# OncoCare+ Pharmacy — Real Working Local Version

This is a standalone React + Vite pharmacy dashboard with a small local Express API.

## What changed from the demo

The previous version stored everything in browser demo state and used alerts for some actions. This version uses a server-side JSON datastore at `server/data.json`, so data survives page refreshes and browser restarts while the server is running.

The dashboard supports real user input for:

- Creating pharmacy orders
- Moving orders through Verification → Preparing → Ready → Dispatched → Completed
- Adding medicines and opening stock
- Increasing inventory stock
- Adding patients
- Creating and verifying/rejecting prescriptions
- Creating and updating deliveries
- Recording payments
- Marking notifications read
- Updating pharmacy profile and open/closed status

## Requirements

- Node.js 18+
- npm

## Run

From this folder:

```powershell
npm install
npm run dev
```

Then open:

```text
http://localhost:5173/
```

The Vite frontend runs on port 5173 and the API runs on port 4000.

## Data storage

On first API start, `server/data.json` is created from `server/seed.json`.

`server/data.json` is the live local datastore. It is intentionally not committed to source control in a production application.

To reset the local datastore to the initial seed records, use the Profile page's **Reset Seed Data** button or POST `/api/reset`.

## Important production note

This is a real working local full-stack prototype, not a production medical-record system. For deployment, replace the JSON datastore with a proper database such as PostgreSQL/Supabase, add authentication/roles, audit logging, encryption, secure prescription-file storage, server-side authorization and validation, and proper payment integration.
