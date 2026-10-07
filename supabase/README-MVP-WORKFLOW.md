# MVP workflow setup

Run migrations in order: `001_initial_schema.sql`, then `002_mvp_workflow.sql`, then `seed/001_demo.sql`.

For a local test admin, after creating a user in Supabase Auth, set that user's profile role to `admin` in the Supabase SQL editor:

```sql
update public.profiles set role='admin' where id='YOUR_AUTH_USER_UUID';
```

The application intentionally uses test pledges and does not connect to a production payment/custody provider.
