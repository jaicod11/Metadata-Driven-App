# Metadata-Driven App Runtime

A Next.js application that turns a JSON config into a working app at runtime: pages, forms,
tables, a REST API, validation, permissions and persistence. There is no code generation and
no scaffolding step — the config is stored as JSON in the database, read on each request, and
interpreted. Adding an entity means editing JSON, not writing a route, a model or a migration.

Live: <https://metadata-driven-app.vercel.app>

## How it works

Sign in, paste a config, and the app exists. One config row produces one live app.

```
App.config (JSON)
  ├── parseConfig()          validates + normalises, never throws
  ├── /runtime/:appId/*      pages resolved from config.pages, rendered by layout
  └── /api/runtime/:appId/:entity   CRUD, validation, filtering, permissions
                                     └── AppData (one JSONB table for every entity)
```

Two files carry most of the weight:

- `src/lib/runtime/schema-parser.ts` — raw JSON → validated `AppConfig`
- `src/components/runtime/RuntimeRenderer.tsx` — `AppConfig` + URL → rendered page

## Tech stack

| Layer | What's used |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript 5 |
| Styling | TailwindCSS 3 |
| Auth | NextAuth v4 — JWT sessions, PrismaAdapter; Google, GitHub, email/password (bcrypt) |
| Database | PostgreSQL (Neon) via Prisma 5 |
| Validation | Zod 3 — config schemas hand-written, entity schemas built at runtime |
| Data fetching | SWR 2 |
| Client state | Zustand 4 (UI state only; server data stays in SWR) |
| Charts | Recharts 2 |
| Config editor | Monaco |
| CSV import | PapaParse + react-dropzone |
| Deployment | Vercel |

---

## Configuration

A minimal config needs a name, entities and pages:

```json
{
  "name": "Expense Tracker",
  "entities": [
    { "name": "expense", "label": "Expense", "fields": [
      { "name": "description", "type": "string", "required": true },
      { "name": "amount", "type": "number" }
    ]}
  ],
  "pages": [
    { "path": "/expenses", "title": "Expenses", "layout": "table", "entity": "expense" },
    { "path": "/new", "title": "Add", "layout": "form", "entity": "expense" }
  ]
}
```

Optional top-level keys: `description`, `version`, `roles`, `workflows`, `theme`.

### Field types

`string` `number` `boolean` `date` `select` `file` `email` `url` `textarea` `relation` `computed`

Unknown types fall back to `string` with a warning rather than failing the config.

```json
{ "name": "category", "type": "select", "options": [
  { "label": "Food", "value": "food" },
  { "label": "Travel", "value": "travel" }
]}
```

### Validation rules

Declared once per field and enforced in both places — the generated form shows inline errors,
the API returns 400 with the same field-level messages. `unique` is the exception: only the
server can answer it, so it's checked on write.

```json
{ "name": "code", "type": "string", "required": true,
  "validation": { "minLength": 3, "maxLength": 10, "regex": "^[A-Z]+$", "unique": true,
                  "message": "Code must be 3–10 capital letters" } }
```

Supported: `required`, `min`, `max`, `minLength`, `maxLength`, `regex` (alias `pattern`),
`email`, `unique`, `message`.

### Relations

`belongsTo` stores the target record's id. `hasMany` stores nothing — it's the inverse view of
a belongsTo on the target, resolved by querying children that point back.

```json
{ "name": "category", "type": "relation", "target": "category",
  "relationType": "belongsTo", "displayField": "title" }
```

Forms render a belongsTo as a dropdown of target records; tables and detail views resolve the
id to a label (config's `displayField`, else the target's first text field). A `hasMany` renders
as a linked list on the parent's detail page. `foreignKey` names the child field explicitly when
inference isn't enough.

### Computed fields

Evaluated at read time from sibling fields, never stored. The expression language is a
hand-written parser supporting `+ - * /`, parentheses, string concatenation, numbers, strings
and field names — no function calls, no property access, no `eval`.

```json
{ "name": "total", "type": "computed", "expression": "price * quantity" }
```

### Roles and permissions

There is no role column on the user — roles are declared in the config, and membership is
resolved against the signed-in session by email. A config with no `roles` gives everyone full
access, so existing configs are unaffected.

```json
{
  "roles": [
    { "name": "admin", "users": ["you@example.com"] },
    { "name": "viewer", "default": true }
  ],
  "entities": [{
    "name": "expense",
    "permissions": {
      "admin":  { "read": true, "create": true, "update": true, "delete": true, "auditLog": true },
      "viewer": { "read": true }
    },
    "fields": [
      { "name": "amount", "type": "number", "permissions": { "viewer": { "visible": false } } }
    ]
  }]
}
```

Entity verbs: `read` `create` `update` `delete` `auditLog`. An omitted verb is denied, so
`{ "read": true }` is read-only. Field overrides are `visible` and `editable`, both defaulting
to true. An entity with no `permissions` map is open to every declared role.

### Pages and layouts

`form` `table` `detail` `dashboard` `auditLog` `grid` `tabs` `stack`

A detail page takes the record id as a trailing segment, so `{ "path": "/expenses/view" }` is
reached at `/expenses/view/<id>`. Pages whose entity the role can't read are dropped from
navigation and refuse to render if reached directly.

### Dashboard widgets

```json
{ "path": "/", "layout": "dashboard", "widgets": [
  { "type": "count", "title": "Paid", "entity": "expense", "filter": { "paid": true } },
  { "type": "aggregate", "title": "Total", "entity": "expense", "field": "amount", "op": "sum" },
  { "type": "chart", "title": "By category", "entity": "expense", "field": "category", "chart": "bar" }
]}
```

`op` is `sum` `avg` `min` `max`; `chart` is `bar` or `line`. A widget naming an entity or field
the current role can't read is omitted entirely — not greyed out — because a placeholder would
still confirm the value exists.

---

## Architecture notes

### One JSONB table, not a table per entity

Every record of every entity in every app lives in `AppData`, with `entity` as a plain string
matched against `config.entities[].name` and the values in a `data` JSONB column.

The reason is config editing: changing `"type": "string"` to `"type": "number"` must not run
`ALTER TABLE` against production. The cost is that querying a dynamic field means querying
inside JSON, so a GIN index (`app_data_data_idx`, `jsonb_ops`) backs the containment queries
that filters compile to.

### Filtering and sorting are raw parameterized SQL

The list route builds SQL with `Prisma.sql` rather than the query builder, for two reasons:

- Prisma can't `ORDER BY` a JSON path at all.
- Its JSON `path`/`equals` filter compiles to `data#>'{k}' = …`, which no index can serve.
  Containment (`data @> '{"k":"v"}'::jsonb`) is what the GIN index answers.

Every value is a bound parameter, including JSONB keys (`data->>$1::text` — the cast
disambiguates the text-key operator from the array-index one). The only non-parameter is the
sort direction, whitelisted to `ASC`/`DESC`. Numeric sorts and aggregates guard with
`jsonb_typeof(...) = 'number'` so one bad row can't fail the query on a cast.

### One permission gate, read by everything

`visibleFields()` and `entityPermissions()` in `src/lib/runtime/permissions.ts` are the single
definition of who may see what. Enforcement is server-side; the client uses the same functions
only to decide what to draw.

Everything reads from that one gate:

- **Forms** omit invisible fields and render non-editable ones as read-only values.
- **API routes** strip invisible fields from responses and discard non-writable fields from
  writes after validation, so a forbidden field posted by hand is dropped rather than trusted.
- **Relations** aren't resolved or fetched when the target entity isn't readable.
- **List queries** only filter, sort and search on role-readable stored fields, so a filter
  can't become an oracle for a hidden value.
- **Computed fields** are hidden when the role can't read every field the expression touches.
- **Audit diffs** record only fields the actor could read, and are filtered again on read
  against the viewer's role.
- **Widgets** are omitted when they name anything the role can't read.

### ComponentRegistry uses lazy `require()`

`getComponent()` resolves a layout string to a React component, loading built-ins with
`require()` *inside* the function and caching them in module scope. The layout components
(`GridLayout`, `TabsLayout`, `StackLayout`) import `getComponent` themselves so they can render
children — a top-level import would create a cycle that evaluates to `undefined` at module init.
Unknown types return a fallback component; `getComponent` never throws.

Custom types can be registered at runtime:

```ts
registerComponent("calendar", MyCalendarComponent);
```

### Broken configs degrade, they don't crash

`parseConfig` never throws. It returns `{ valid, config, errors, warnings }`. Errors block
saving; warnings don't. Anything with a sensible fallback is a warning (unknown field type →
`string`, unknown layout → `table`, page referencing a missing entity → render without it).
Things with no fallback are errors, reported with the entity and field named:

```
entity "employee" → field "dept" → target: Relation target "Departments" is not a defined entity
```

Cross-reference checks cover relation targets, computed-expression references, permission maps
keyed by undeclared roles, and widget entity/field references.

### Audit log

Every successful create, update and delete writes a row to `audit_logs` after the write
commits: entity, record id, action, acting user, timestamp, and a JSON diff (old → new for
updates, the record for create/delete). A failed audit write is logged but doesn't fail the
mutation it describes. Browse it with a page using `layout: "auditLog"`, gated by the
`auditLog` permission.

---

## API

All runtime endpoints live under `/api/runtime/:appId/:entity` and share a response envelope:
`{ success: true, data }` or `{ success: false, error: { message, details } }`.

| Method | Purpose |
|---|---|
| `GET` | List records (paginated, with total), or one record with `?id=` |
| `POST` | Create |
| `PUT ?id=` | Update |
| `DELETE ?id=` | Delete |
| `GET /audit` | Audit entries for the entity |

List query params: `page`, `limit` (max 100), `sort`, `dir`, `q` (text search),
`filter.<field>=<value>`, and the `filterField`/`filterValue` pair used by hasMany lists.

```bash
curl 'http://localhost:3000/api/runtime/<appId>/expense?filter.paid=true&q=coffee&sort=amount&dir=desc&page=1&limit=25' \
  -H 'Cookie: next-auth.session-token=<token>'
```

Two supporting endpoints: `GET /api/widgets?appId=&path=` computes a dashboard page's widget
values, and `GET /api/openapi.json?appId=` generates an OpenAPI 3.0 document for that app.

`POST /api/import/csv` bulk-loads records from an uploaded CSV with a column → field mapping,
driven from the dashboard's Import CSV page. Rows go through the same validator as the API, so
invalid rows are reported per row rather than failing the batch, and the import answers to the
same `create` permission.

### OpenAPI and Swagger UI

The spec is generated from the same config that drives the API — paths per entity, request and
response schemas from the field definitions, enums from select options, required-ness and
min/max/length/pattern read from the same rule resolver the validator uses. A field appears
only if at least one declared role could see it, and computed fields are never writable.

Swagger UI is at **`/api-docs`**. Without `?appId=` it lists your apps; pick one to load its
reference. The raw document is linked from the header.

---

## Local development

### Prerequisites

Node 18+, and a PostgreSQL database (the project targets Neon).

### Environment

Copy `env.example` to `.env` and fill it in. Note that `env.example` is missing `DIRECT_URL`,
which `prisma/schema.prisma` requires:

```bash
DATABASE_URL="postgresql://…-pooler.…/db?sslmode=require"   # pooled — used at runtime
DIRECT_URL="postgresql://….…/db?sslmode=require"            # direct — used by migrations

NEXTAUTH_SECRET="…"          # openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"

GOOGLE_CLIENT_ID=""          # optional — omit to use email/password only
GOOGLE_CLIENT_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Neon needs both URLs: the pooled one survives a cold start mid-request, the direct one is what
migrations use.

### Run

```bash
npm install
npx prisma migrate deploy   # apply migrations (0_init, GIN index, audit log)
npm run dev                 # http://localhost:3000
```

Then register an account, create an app from the dashboard, and open it at
`/runtime/<appId>`.

### Other commands

```bash
npm run build          # prisma generate && next build
npm run db:generate    # regenerate the Prisma client after a schema change
npm run db:push        # sync schema without a migration
npm run db:migrate     # create a new migration
npm run db:studio      # inspect AppData rows directly
```

`npm run build` runs `prisma generate` first on purpose — Vercel caches `node_modules`, so
Prisma's postinstall generation doesn't re-run and the client goes stale without it.

### Project layout

```
src/
├── app/                    routes — dashboard, runtime, API
├── components/
│   ├── runtime/            the rendering layer (registry, layouts, forms, tables, detail)
│   ├── config/             Monaco-based config editor
│   └── import/             CSV import UI
├── lib/
│   ├── runtime/            parser, validator, permissions, relations, computed,
│   │                       expression parser, audit, widgets, openapi
│   ├── db/queries/         all SQL and Prisma access
│   ├── workflow/           workflow engine and actions
│   └── csv/                CSV parsing and import
└── types/                  config, runtime and API types
```

---

## Known limitations

Things that are genuinely incomplete or constrained, as of now:

- **Workflows never fire automatically.** The engine, actions and trigger types
  (`onSubmit`, `onUpdate`, `onDelete`, `schedule`, `manual`) all exist and workflows can be
  created and stored, but the only thing that calls the engine is the "Run" button in the
  workflows UI. Entity mutations don't trigger workflows, and there is no scheduler.
- **`sendEmail` is a stub.** It interpolates the template and logs to the console with a TODO
  for a real provider. `callWebhook`, `transform`, `notify` and `condition` do run.
- **`grid`, `tabs` and `stack` layouts render nothing.** `parsePage` builds its result field by
  field and doesn't carry `components` through, so `page.components` is always undefined and
  those layouts always show their "no components defined" message.
- **No edit form.** Forms create records. A form page can reach update mode via a trailing id
  segment, but nothing prefills it, so the fields come up empty and a PUT validates the whole
  record.
- **Computed fields can't reference other computed fields.** This is deliberate — it makes
  cycles impossible and keeps evaluation single-pass — but it rules out chained derivations.
  Self-references and references to `hasMany` fields are config errors.
- **Relation dropdowns cap at 100 records.** `RelationField` and the label resolution in tables
  and detail views fetch one page of the target entity (the API's maximum). Beyond that, a
  stored id that isn't in the page renders as `#abc123 (not listed)` rather than its label.
  Related lists on a detail page cap at 50 children.
- **Swagger UI needs internet access.** It loads from a CDN rather than being bundled. If the
  CDN is blocked the page says so and links the raw JSON, which is served locally either way.
- **Text search is `ILIKE`, not full-text.** The GIN index serves equality filters via
  containment; search and sorting don't use it, so they're sequential scans on large tables.
- **`theme` is parsed but never applied.** `primaryColor` and `fontFamily` are validated and
  stored, and no component reads them.
- **No app sharing.** Every app has exactly one owner and every route is ownership-scoped, so
  listing another user's email under a role has no practical effect — they can't reach the app
  at all. Roles are useful today for restricting or previewing your own view.
- **Field names aren't secret.** Permissions gate field *values*; the config object handed to
  the client still contains the names and types of fields the role can't read.
- **`npm run db:seed` doesn't work.** The script points at `prisma/seed.ts`, which doesn't
  exist.
- **`typescript.ignoreBuildErrors` is on.** The dynamic JSONB layer produces type friction
  Prisma can't express, so the build won't fail on type errors — run `npx tsc --noEmit`
  yourself.
- **No automated tests.** There's no test runner configured.
- **Dashboard widgets don't live-update.** Their SWR key sits outside the entity key prefix, so
  a create elsewhere won't refresh an open dashboard until it remounts.
