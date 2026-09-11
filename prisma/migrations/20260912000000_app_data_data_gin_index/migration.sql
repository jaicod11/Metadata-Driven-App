-- Entity records are stored as JSONB in app_data.data, so every filter and
-- search over a dynamic field is a containment query on that column. A GIN
-- index is what makes `data @> '{"field":"value"}'` an index scan instead of a
-- sequential scan over every record of every app.
--
-- IF NOT EXISTS because this repo has been managed with `prisma db push`; the
-- index may already exist on a database that was pushed from schema.prisma.
CREATE INDEX IF NOT EXISTS "app_data_data_idx" ON "app_data" USING GIN ("data" jsonb_ops);
