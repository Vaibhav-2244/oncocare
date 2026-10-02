import fs from 'node:fs';

const en = JSON.parse(fs.readFileSync('messages/en.json', 'utf8'));
const hi = JSON.parse(fs.readFileSync('messages/hi.json', 'utf8'));
const enKeys = Object.keys(en.hospitalOps || {});
const hiKeys = Object.keys(hi.hospitalOps || {});
const missing = enKeys.filter((key) => !(key in (hi.hospitalOps || {})));
if (missing.length > 0) {
  throw new Error(`Missing hospitalOps keys in hi.json: ${missing.join(', ')}`);
}
console.log(`hospitalOps parity check passed: ${enKeys.length} keys aligned.`);
