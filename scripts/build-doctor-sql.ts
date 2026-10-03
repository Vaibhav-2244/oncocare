import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const targetFile = path.join(process.cwd(), 'supabase', 'APPLY_DOCTOR_PENDING.sql');
const files = fs.readdirSync(migrationsDir)
  .filter((file) => /^20261003.*_doctor_.*\.sql$/.test(file))
  .sort();

if (files.length === 0) throw new Error('No doctor migrations found in supabase/migrations.');

const sections = files.map((file) => `-- ${file}\n${fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim()}`);
fs.writeFileSync(targetFile, `${sections.join('\n\n')}\n\nNOTIFY pgrst, 'reload schema';\n`);
console.log(`Wrote ${files.length} doctor migration(s) to ${targetFile}`);
