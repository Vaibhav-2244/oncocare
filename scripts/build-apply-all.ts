import fs from 'fs';
import path from 'path';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const targetFile = path.join(process.cwd(), 'supabase', 'pharmacy_apply_all.sql');

const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .filter((file) => file >= '20261001110000');

if (files.length === 0) {
  throw new Error('No pharmacy migrations found in supabase/migrations.');
}

const output = files
  .map((file) => {
    const source = fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim();
    return `-- ${file}\n${source}`;
  })
  .join('\n\n');

fs.writeFileSync(targetFile, `${output}\n`);
console.log(`Wrote ${files.length} pharmacy migration(s) to ${targetFile}`);
