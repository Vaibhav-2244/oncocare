# OncoCare+ LME Super Admin — Standalone starter

A standalone Next.js workspace based on the supplied LME Super Admin requirements. It includes a responsive admin shell, OncoCare-inspired teal/navy healthcare theme, module navigation, local feature-flag preview controls, and explicit unverified/not-connected states.

## Run in VS Code

1. Install Node.js 20.9+ (Node.js 22 LTS recommended).
2. Extract this ZIP and open the `oncocare-lme-super-admin` folder in VS Code.
3. Copy `.env.example` to `.env.local`.
4. Fill in credentials **locally** (see security note below).
5. Open Terminal → New Terminal and run:

   ```bash
   npm install
   npm run dev
   ```

6. Open http://localhost:3000

For a production build, run `npm run build` then `npm start`.

## Environment variables

The `.env.example` includes the Supabase project URL supplied in the request, with placeholders for credentials. Replace placeholders in your local `.env.local`.

**Security:** credentials were pasted into chat. Treat the service-role, Gemini, Google Places, and Google Maps keys as exposed and rotate/restrict them before use. The actual privileged secrets are intentionally not embedded in this ZIP. Never put `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY`, or `GEMINI_API_KEY` in a `NEXT_PUBLIC_` variable or browser code. Keep privileged keys server-side only. Restrict browser Maps keys by HTTP referrer and API. Ensure Supabase RLS policies are correct before using real data.

## Important implementation status

This is a working standalone **UI starter**, not a completed production administration backend. It does not perform privileged mutations, authenticate admins, or query live metrics. Metrics intentionally display em dashes rather than fabricated data. Feature toggles are local preview state only and do not alter production feature flags.

Before production/integration:
- Review the existing OncoCare+ repository, routes, Supabase schema, RLS, functions, and authentication.
- Connect existing auth and enforce RBAC server-side on every protected API.
- Add audited server-side mutations and secure role/permission checks.
- Wire actual database queries and health checks; show only verified integration states.
- Add migrations only after checking the existing schema for equivalent tables.
- Test hospital isolation, patient-caregiver consent, revocation, and non-admin URL/API access.
- Obtain official logo assets and verify exact brand tokens from the production site. This starter uses an original text-and-heartbeat mark and a healthcare teal/navy palette; the supplied website is referenced as the integration target, not copied assets.

## Project layout

- `app/page.tsx` — dashboard shell, navigation and starter module screens
- `app/globals.css` — responsive styling/theme
- `app/layout.tsx` — app metadata and global CSS
- `lib/supabase.ts` — optional public Supabase client initialization
- `.env.example` — environment template (copy to `.env.local`)
