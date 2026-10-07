# CivicRaise MVP v0.1

CivicRaise is a federal advocacy marketplace. This repository is the MVP implementation of the agreed v0.1 workflow.

## MVP scope

### Citizen
- Sign up/sign in
- Browse campaigns
- H.R. 5602 benchmark campaign
- Make test pledges
- View funding progress
- Review submitted deliverables
- Vote in ratification
- Raise a formal deliverable dispute

### Advocate
- Sign in
- View RFPs
- Submit test bids
- View contracts
- Submit milestone deliverables

### Admin
- Manage campaign state
- Verify advocates
- Review bids
- Award an RFP
- Track contracts and deliverables
- Review disputes
- Finalize ratification
- View audit/ledger data

## Important MVP boundary

**No production money is enabled.** Pledges use a mock/test provider. No live escrow, FBO, bank, card processor, or lobbyist disbursement is connected.

The production payments/custody architecture remains subject to legal, banking, payments, tax, and accounting validation.

## Stack

- Next.js
- React
- TypeScript
- Supabase Auth
- Supabase Postgres + RLS
- Vercel deployment target

## Local setup

1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

5. Run `npm run dev`.

## Supabase setup

Run the migrations in `supabase/migrations` in numeric order. The seed in `supabase/seed/001_demo.sql` creates the H.R. 5602 benchmark data.

For a production/staging project, prefer the Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Then deploy the Next.js application to Vercel with the same two public Supabase environment variables.

## Test workflow

1. Create a citizen account.
2. Open H.R. 5602.
3. Make a test pledge.
4. Create an advocate account and submit a test bid.
5. In Supabase, mark the advocate `verification_status = verified`, or use the admin verification screen once an admin account exists.
6. Use an admin account to advance the campaign and select the bid.
7. Advocate submits a milestone deliverable.
8. Backer reviews the deliverable.
9. Backer votes to approve or reject.
10. Admin finalizes ratification.
11. If needed, raise a dispute and resolve it from the admin dispute queue.

## Creating the first admin

For staging, create a normal Supabase Auth user first, then run:

```sql
update public.profiles
set role = 'admin'
where id = 'AUTH_USER_UUID';
```

Do not expose this operation in the client. Production admin provisioning should use a controlled administrative process and MFA.

## Health check

After deployment:

`/api/health`

should return a JSON response showing `database: connected` and `environment: test-money-only`.

## Production checklist before real money

- Counsel validates the payments/custody structure.
- Banking/payment provider validates the account architecture.
- Tax/accounting validates revenue recognition and customer funds treatment.
- Authentication and admin MFA are enabled.
- Storage is configured for protected evidence files.
- Monitoring, backups, logging, and incident response are configured.
- Legal policies are finalized and linked from the app.
- Test-money routes are disabled or replaced before production launch.

## Deployment hardening in Build 5

- Removed the insecure demo endpoint that could promote any signed-in user to admin.
- Added Supabase auth session middleware and email-confirmation callback handling.
- Added database protection against client-side role escalation.
- Added uniqueness constraints for one bid per advocate/RFP and one contract per RFP.
- Test pledges are accepted only while the campaign is PUBLISHED or FUNDING.
- The benchmark seed starts PUBLISHED so the first test pledge can be made immediately.
