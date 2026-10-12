# Running checks locally

The repository workflow checks need Node.js 20 or newer and PostgreSQL 16.

The database integration test applies every migration to a fresh, disposable database, then exercises the admin transition and bid-award RPCs. It inserts only fixed test fixtures and rolls the entire test transaction back. The script refuses database URLs that do not point to `localhost` or `127.0.0.1` and a database named `civicraise_test`.

Create an empty local database with that name, then run:

```sh
npm ci
npm run typecheck
npm run build
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/civicraise_test npm run test:db
```

Do not point this command at the production Supabase database. GitHub Actions uses a temporary PostgreSQL service and dummy Supabase public environment values; it does not connect to the live app or database.
