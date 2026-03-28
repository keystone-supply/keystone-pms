-- Run in Supabase SQL Editor (or psql) to compare live `projects` with repo migrations.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'projects'
ORDER BY ordinal_position;
