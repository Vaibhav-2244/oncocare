import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const targetFile = path.join(process.cwd(), 'supabase', 'APPLY_HOSPITAL_PENDING.sql');

const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .filter((file) => file >= '20261002100000')
  .sort();

if (files.length === 0) {
  throw new Error('No hospital pending migrations found in supabase/migrations.');
}

const output = files
  .map((file) => {
    const source = fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim();
    return `-- ${file}\n${source}`;
  })
  .join('\n\n');

fs.writeFileSync(targetFile, `${output}\n\nNOTIFY pgrst, 'reload schema';\n`);
console.log(`Wrote ${files.length} hospital migration(s) to ${targetFile}`);
