import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const files = (await fs.readdir(migrationsDir)).filter((file) => file.includes('_doctor_') && file.endsWith('.sql')).sort();
const source = (await Promise.all(files.map((file) => fs.readFile(path.join(migrationsDir, file), 'utf8')))).join('\n');
const requiredChecks: [string, RegExp][] = [
  ['doctor_patients RLS', /ALTER TABLE public\.doctor_patients ENABLE ROW LEVEL SECURITY/],
  ['doctor owner policy', /doctor_patients_owner ON public\.doctor_patients/],
  ['doctor role guard', /doctor_has_role/],
  ['admin verification guard', /admin_set_doctor_verification/],
  ['patient consent redemption', /redeem_doctor_link_code/],
];
for (const [label, pattern] of requiredChecks) {
  if (!(pattern as RegExp).test(source)) throw new Error(`FAIL: missing ${label}`);
  console.log(`PASS: ${label}`);
}
console.log(`PASS: inspected ${files.length} doctor migration(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
