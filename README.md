# MetaApp — Metadata-Driven Application Runtime

> **Build full-stack applications from a single JSON configuration — no backend code, no database migrations, no UI boilerplate.**

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-metadata--driven--app.vercel.app-blue?style=for-the-badge)](https://metadata-driven-app.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-38bdf8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-green?style=for-the-badge&logo=postgresql)](https://neon.tech/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/)

---

## 🌐 Live Demo

**[https://metadata-driven-app.vercel.app/](https://metadata-driven-app.vercel.app/)**

---

## 📌 What is This?

MetaApp is a **metadata-driven application runtime** — a system that reads a JSON configuration file and dynamically generates:

- ✅ **Frontend UI** — forms, tables, dashboards, layouts
- ✅ **REST APIs** — full CRUD for every entity, auto-generated
- ✅ **Database structure** — records stored dynamically via Prisma + PostgreSQL
- ✅ **Workflows** — automation triggered on create, update, or delete
- ✅ **CSV Import** — bulk import data with column mapping
- ✅ **Multi-auth Login** — Google, GitHub, and email/password

The entire system handles missing fields, invalid values, unknown components, and inconsistent schemas **gracefully without crashing**.

---

## 🛠 Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| **Next.js 14** | App Router, Server Components, API Routes |
| **React 18** | UI rendering, hooks, client components |
| **TypeScript** | Type safety across the entire codebase |
| **TailwindCSS** | Utility-first styling |
| **SWR** | Data fetching and caching |
| **Zustand** | Global state management |
| **Monaco Editor** | JSON config editor with syntax highlighting |

### Backend
| Technology | Purpose |
|-----------|---------|
| **Next.js API Routes** | Dynamic REST API generation |
| **NextAuth.js** | Authentication — Google, GitHub, credentials |
| **Zod** | Runtime schema validation |
| **Prisma ORM** | Type-safe database queries |
| **bcryptjs** | Password hashing |

### Database & Deployment
| Technology | Purpose |
|-----------|---------|
| **PostgreSQL** | Primary database |
| **Neon** | Serverless PostgreSQL (free tier) |
| **Vercel** | Frontend + API deployment |

---

## ✨ Features

### Core Engine
- 🔧 **JSON → App** — Paste a config, get a working app instantly
- 🛡 **Graceful error handling** — Invalid configs never crash the UI
- 🔌 **Extensible component registry** — Add custom components easily
- 📐 **4 layout types** — Form, Table, Dashboard, Grid, Stack, Tabs

### Authentication (Multi-auth)
- 🔐 Email/Password login with bcrypt hashing
- 🔵 Google OAuth
- ⚫ GitHub OAuth
- 🔒 Session-based auth with JWT

### Workflow Automation
- ⚡ Trigger on `onSubmit`, `onUpdate`, `onDelete`, or manually
- 📧 `sendEmail` action with template variable interpolation
- 🌐 `callWebhook` action with timeout handling
- 🔄 `transform` action for data mapping
- 🔀 `condition` action for branching logic

### CSV Import
- 📤 Drag-and-drop file upload
- 🗂 Column mapping UI — map CSV headers to entity fields
- 👁 Preview before importing
- ❌ Per-row error reporting

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A [Neon](https://neon.tech) account (free)
- A [Google Cloud](https://console.cloud.google.com) project (for Google OAuth)
- A [GitHub](https://github.com/settings/developers) OAuth app

### Installation

```bash
# Clone the repository
git clone https://github.com/jaicod11/Metadata-Driven-App.git
cd Metadata-Driven-App

# Install dependencies
npm install

# Set up environment variables
cp env.example .env.local
# Fill in your values in .env.local

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## ⚙️ Environment Variables

Create `.env.local` in the project root:

```env
# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:pass@pooler.neon.tech/dbname?sslmode=require"
DIRECT_URL="postgresql://user:pass@direct.neon.tech/dbname?sslmode=require"

# NextAuth
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# GitHub OAuth
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## 📋 Sample JSON Configuration

```json
{
  "name": "Employee Directory",
  "entities": [
    {
      "name": "employee",
      "label": "Employee",
      "fields": [
        { "name": "name",       "type": "string", "required": true  },
        { "name": "email",      "type": "email",  "required": true  },
        { "name": "department", "type": "select",
          "options": [
            { "label": "Engineering", "value": "engineering" },
            { "label": "Design",      "value": "design"      }
          ]
        },
        { "name": "joinDate", "type": "date" }
      ]
    }
  ],
  "pages": [
    { "path": "/",          "layout": "dashboard" },
    { "path": "/employees", "layout": "table",  "entity": "employee" },
    { "path": "/new",       "layout": "form",   "entity": "employee" }
  ]
}
```

Paste this into the app → your Employee Directory is live with a dashboard, table, and form — no code needed.

---

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── (auth)/             # Login & Register pages
│   ├── dashboard/          # Dashboard, Apps, Settings pages
│   ├── runtime/            # Dynamic app renderer
│   └── api/                # REST API routes
├── components/
│   ├── ui/                 # Reusable UI primitives
│   ├── layout/             # Sidebar, Header, Shell
│   ├── auth/               # Auth forms & OAuth buttons
│   ├── config/             # JSON config editor
│   ├── workflows/          # Workflow builder UI
│   ├── import/             # CSV import flow
│   └── runtime/            # Core rendering engine
│       ├── forms/          # DynamicForm + 7 field types
│       ├── tables/         # DynamicTable with pagination
│       ├── dashboards/     # DynamicDashboard + StatCards
│       └── layouts/        # Grid, Stack, Tabs layouts
├── lib/
│   ├── db/                 # Prisma client + query functions
│   ├── auth/               # NextAuth config & session helpers
│   ├── runtime/            # Schema parser + validator
│   ├── workflow/           # Workflow execution engine
│   ├── csv/                # CSV parser + importer
│   └── utils/              # API responses, error handlers
├── hooks/                  # SWR data fetching hooks
├── store/                  # Zustand global state
└── types/                  # TypeScript type definitions
```

---

## 🎯 Assignment Requirements Met

| Requirement | Status |
|------------|--------|
| Frontend rendering engine (forms, tables, dashboards) | ✅ |
| Dynamic API generation | ✅ |
| CRUD execution | ✅ |
| Validation handling | ✅ |
| Schema management | ✅ |
| Reliable error handling + graceful fallbacks | ✅ |
| Authentication with user-scoped data | ✅ |
| Database architecture (PostgreSQL + Prisma) | ✅ |
| Deployment (Vercel + Neon) | ✅ |
| **Bonus: CSV Import** | ✅ |
| **Bonus: Multi-auth Login** | ✅ |
| **Bonus: Workflow Automation** | ✅ |

---

## 👨‍💻 Author

**Jaideep Kundu**

---

## 📄 License

This project is for academic/assignment purposes.