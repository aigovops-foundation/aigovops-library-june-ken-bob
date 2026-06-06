// src/core/i18n.js
// i18n SERVICE — English-first, never English-only.
// Negotiates locale from Accept-Language and serves UI/agent strings in the
// member's language. English is the source-of-truth; other locales derive from it.
// Full RTL + ICU formatting in production; v1 ships en + es to prove the path.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(here, '..', 'i18n');
const SUPPORTED = ['en', 'es'];
const DEFAULT = process.env.DEFAULT_LOCALE || 'en';
const catalogs = {};
for (const l of SUPPORTED) {
  catalogs[l] = JSON.parse(fs.readFileSync(path.join(DIR, `${l}.json`), 'utf8'));
}

export function negotiate(acceptLanguage = '') {
  const wanted = acceptLanguage.split(',').map(s => s.split(';')[0].trim().slice(0, 2).toLowerCase());
  return wanted.find(l => SUPPORTED.includes(l)) || DEFAULT;
}

export function t(locale, key, vars = {}) {
  const cat = catalogs[locale] || catalogs[DEFAULT];
  let s = cat[key] ?? catalogs[DEFAULT][key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export { SUPPORTED, DEFAULT };
