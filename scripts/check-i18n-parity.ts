import fs from 'node:fs';

const en = JSON.parse(fs.readFileSync('messages/en.json', 'utf8'));
const hi = JSON.parse(fs.readFileSync('messages/hi.json', 'utf8'));
const enKeys = Object.keys(en.hospitalOps || {});
const hiKeys = Object.keys(hi.hospitalOps || {});
const missing = enKeys.filter((key) => !(key in (hi.hospitalOps || {})));
if (missing.length > 0) {
  throw new Error(`Missing hospitalOps keys in hi.json: ${missing.join(', ')}`);
}

const enAdminKeys = Object.keys(en.admin || {});
const missingAdmin = enAdminKeys.filter((key) => !(key in (hi.admin || {})));
const extraAdmin = Object.keys(hi.admin || {}).filter((key) => !(key in (en.admin || {})));
if (missingAdmin.length > 0 || extraAdmin.length > 0) {
  throw new Error(
    `admin translation mismatch. Missing in hi.json: ${missingAdmin.join(', ') || 'none'}; ` +
    `extra in hi.json: ${extraAdmin.join(', ') || 'none'}`,
  );
}
console.log(
  `Translation parity check passed: hospitalOps ${enKeys.length} keys, admin ${enAdminKeys.length} keys aligned.`,
);
