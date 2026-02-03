import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function flatten(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v, key));
    else out.push(key);
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const enPath = path.join('src', 'i18n', 'locales', 'en.json');
const arPath = path.join('src', 'i18n', 'locales', 'ar.json');

const en = readJson(enPath);
const ar = readJson(arPath);

const enKeys = new Set(flatten(en));
const arKeys = new Set(flatten(ar));

const enOnly = [...enKeys].filter((k) => !arKeys.has(k)).sort();
const arOnly = [...arKeys].filter((k) => !enKeys.has(k)).sort();

const srcFiles = walk('src').filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
const used = new Set();

// Match: t('a.b') or t("a.b")
const keyRe = /\bt\(\s*['"]([^'"]+)['"]/g;

for (const file of srcFiles) {
  const s = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = keyRe.exec(s))) {
    used.add(m[1]);
  }
}

const defined = new Set([...enKeys, ...arKeys]);
const missing = [...used].filter((k) => !defined.has(k)).sort();

let ok = true;
if (enOnly.length) {
  ok = false;
  console.error(`[i18n] Keys present in en.json but missing in ar.json (${enOnly.length}):`);
  for (const k of enOnly) console.error(`  - ${k}`);
}
if (arOnly.length) {
  ok = false;
  console.error(`[i18n] Keys present in ar.json but missing in en.json (${arOnly.length}):`);
  for (const k of arOnly) console.error(`  - ${k}`);
}
if (missing.length) {
  ok = false;
  console.error(`[i18n] Keys used in code but missing in locales (${missing.length}):`);
  for (const k of missing) console.error(`  - ${k}`);
}

if (!ok) process.exit(1);
console.log(`[i18n] OK: ${used.size} keys used, ${defined.size} keys defined.`);

