# Doctor dashboard security model

## Ownership

Doctor profile, availability, leave, roster, notes, appointments,
consultations, prescriptions, treatment plans, reports, and link codes are
owned by `auth.uid()` and protected by RLS. RPCs repeat the doctor-role and
ownership checks because RPCs are the application boundary.

## Consent

Roster data is not patient live data. A patient link must be redeemed by the
patient account, must be explicit about scopes, and must support revocation.
Only the scopes granted by the patient may be used for symptoms, side effects,
medications, labs, timeline, and messages.

## Operational controls

- Do not put PHI in browser storage, URLs, logs, demo exports, or analytics.
- Keep storage buckets private and use signed URLs.
- Audit signing, amendments, prescriptions, link redemption, scope changes,
  revocation, and administrative verification.
- Keep doctor verification status out of doctor-editable profile fields.
- Apply migrations in timestamp order and review generated SQL before running it.
