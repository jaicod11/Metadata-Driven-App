-- One row per successful mutation of an entity record.
--
-- No foreign key to users: an audit trail must outlive the account that wrote
-- it, so a deleted user must not cascade its history away. The app relation
-- does cascade — deleting an app takes its records and their history together.
--
-- IF NOT EXISTS / constraint guard because this repo has also been managed with
-- `prisma db push`; the table may already exist on a database pushed from
-- schema.prisma.
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "diff" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- The browse page reads newest-first for one entity of one app.
CREATE INDEX IF NOT EXISTS "audit_logs_appId_entity_createdAt_idx" ON "audit_logs"("appId", "entity", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_appId_createdAt_idx" ON "audit_logs"("appId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_appId_fkey'
    ) THEN
        ALTER TABLE "audit_logs"
            ADD CONSTRAINT "audit_logs_appId_fkey"
            FOREIGN KEY ("appId") REFERENCES "apps"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
