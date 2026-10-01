# Open Questions / Blockers

## Client-document conflicts

None identified. `hospital-dashboard-requirements.md` remains the source of truth; the implementation follows its configurable patient identifier and patient-flow focus (Client sections 1–25).

## Step 1 verification blocker

- The migration `supabase/migrations/20261001100000_hospital_foundation_fix.sql` has not been applied to the target Supabase project in this environment.
- `scripts/verify-foundation.ts` has not been run against that project. Local Postgres tooling is unavailable here, so tenant isolation, RPC grants, invite acceptance, and demo cleanup are not yet empirically verified.

## Product clarification

- The client requirements do not specify which legal or institutional documents are required to approve a hospital verification request, or the expected review time. Until supplied, the platform admin verification action is a manual decision and the workspace remains usable while unverified, as directed in Step 1.
