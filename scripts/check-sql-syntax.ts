import fs from 'fs';
import path from 'path';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const startFrom = '20261001000000';

const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .filter((file) => file >= startFrom);

if (files.length === 0) {
  console.error('No migration files found after cutoff:', startFrom);
  process.exit(1);
}

const errors: string[] = [];

for (const file of files) {
  const fullPath = path.join(migrationsDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');

  const expressionUniqueViolation = /UNIQUE\s*\([^)]*(?:lower\s*\(|upper\s*\(|coalesce\s*\(|cast\s*\()/gi;
  const primaryKeyExpressionViolation = /PRIMARY\s+KEY\s*\([^)]*(?:lower\s*\(|upper\s*\(|coalesce\s*\(|cast\s*\()/gi;
  const concurrentIndexViolation = /CREATE\s+INDEX\s+CONCURRENTLY/gi;
  const viewWithoutSecurityInvoker = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+/gi;

  if (expressionUniqueViolation.test(source)) {
    errors.push(`${file}: expression-based UNIQUE constraint detected`);
  }
  if (primaryKeyExpressionViolation.test(source)) {
    errors.push(`${file}: expression-based PRIMARY KEY constraint detected`);
  }
  if (concurrentIndexViolation.test(source)) {
    errors.push(`${file}: CREATE INDEX CONCURRENTLY is not allowed in migration scripts`);
  }

  if (viewWithoutSecurityInvoker.test(source) && !/WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/i.test(source)) {
    errors.push(`${file}: view is missing WITH (security_invoker = true)`);
  }

  const quoteMatches = source.match(/\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/g) ?? [];
  const stack: string[] = [];

  for (const match of quoteMatches) {
    if (match === '$$') {
      if (stack[stack.length - 1] === '$$') {
        stack.pop();
      } else {
        stack.push('$$');
      }
      continue;
    }

    const last = stack[stack.length - 1];
    if (last === match) {
      stack.pop();
    } else {
      stack.push(match);
    }
  }

  if (stack.length > 0) {
    errors.push(`${file}: unbalanced dollar-quoted blocks remain open (${stack.join(', ')})`);
  }
}

if (errors.length > 0) {
  console.error('SQL syntax audit failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`SQL syntax audit passed for ${files.length} migration files.`);
