-- Resolve Supabase security advisor "extension_in_public".
-- Keep extensions installed, but move them to the dedicated extensions schema.

create schema if not exists extensions;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'citext') then
    execute 'alter extension citext set schema extensions';
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'alter extension vector set schema extensions';
  end if;
end
$$;
