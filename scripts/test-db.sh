#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to a local, disposable civicraise_test PostgreSQL database." >&2
  exit 2
fi

if [[ ! "$DATABASE_URL" =~ ^postgres(ql)?://([^/]*@)?(localhost|127\.0\.0\.1)(:[0-9]+)?/civicraise_test([?].*)?$ ]]; then
  echo "Refusing to run migrations: DATABASE_URL must point to localhost or 127.0.0.1 and database civicraise_test." >&2
  exit 2
fi

psql "$DATABASE_URL" --set ON_ERROR_STOP=1 --file tests/database-bootstrap.sql

for migration in supabase/migrations/*.sql; do
  echo "Applying $migration"
  psql "$DATABASE_URL" --set ON_ERROR_STOP=1 --file "$migration"
done

psql "$DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/tests/admin_workflow.sql
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 --file supabase/tests/test_pledges.sql
