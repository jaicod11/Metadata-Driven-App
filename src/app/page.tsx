import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <span className="font-semibold text-gray-900">MetaApp</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 font-medium px-4 py-2 transition-colors">
            Sign in
          </Link>
          <Link href="/register" className="text-sm bg-blue-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium mb-6 border border-blue-100">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
          Metadata-driven runtime
        </div>
        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-5">
          Turn JSON configs into<br />
          <span className="text-blue-600">working applications</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          Define your data model and pages in JSON. MetaApp dynamically generates
          the UI, APIs, and database — ready to use instantly.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/register" className="px-7 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
            Start building free
          </Link>
          <Link href="/login" className="px-7 py-3 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors">
            Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: "⚡", title: "Instant APIs", desc: "Dynamic CRUD endpoints are auto-generated from your entity definitions. No backend code needed." },
            { icon: "🎨", title: "Dynamic UI", desc: "Forms, tables, and dashboards render directly from your config. Handles unknown fields gracefully." },
            { icon: "🔄", title: "Workflow Automation", desc: "Trigger email, webhooks, and transforms on submit, update, or delete — all configured in JSON." },
          ].map((f) => (
            <div key={f.title} className="p-6 rounded-2xl border border-gray-200 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sample config preview */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-3">
          One JSON config. A complete app.
        </h2>
        <p className="text-gray-500 text-center mb-8 text-sm">Paste this, hit create — your CRM is live.</p>
        <pre className="bg-gray-900 text-gray-100 rounded-2xl p-6 text-xs leading-relaxed overflow-x-auto shadow-xl">
{`{
  "name": "Simple CRM",
  "entities": [
    {
      "name": "contact",
      "fields": [
        { "name": "name",  "type": "string", "required": true  },
        { "name": "email", "type": "email",  "required": true  },
        { "name": "status","type": "select",
          "options": [
            { "label": "Lead",   "value": "lead"   },
            { "label": "Active", "value": "active" }
          ]
        }
      ]
    }
  ],
  "pages": [
    { "path": "/",        "layout": "dashboard" },
    { "path": "/contacts","layout": "table",  "entity": "contact" },
    { "path": "/new",     "layout": "form",   "entity": "contact" }
  ]
}`}
        </pre>
      </section>

      <footer className="text-center pb-10 text-xs text-gray-400">
        Built with Next.js · PostgreSQL · Prisma
      </footer>
    </div>
  );
}
