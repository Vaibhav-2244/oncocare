# Hospital dashboard security

- Keep all transactional writes behind SECURITY DEFINER RPCs.
- Never expose a service-role key to the browser.
- Enforce hospital_id tenancy in every table and function.
- Keep clinical data restricted to clinical.read and orders.pipeline roles.
- Private hospital-reports storage bucket is required for report exports.
- Secure cron invocation using the CRON_SECRET header.
