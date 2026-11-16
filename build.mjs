#!/usr/bin/env node
// Builds the deployable site into dist/: the Italian home at /, one pre-translated
// home per language at /es/, /ar/…, hreflang links between them, and sitemap.xml.
// Search engines do not run the in-page language switch, so without these pages
// only the Italian text is ever indexed. Zero dependencies; the Dockerfile runs it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const ORIGIN = 'https://scuolasanvitale.d4digitalstudio.it';
const DEFAULT_LANG = 'it';
const OG_LOCALE = { it: 'it_IT', es: 'es_ES', ar: 'ar_AR', ro: 'ro_RO', sq: 'sq_AL', zh: 'zh_CN', tl: 'tl_PH', uk: 'uk_UA', fr: 'fr_FR', en: 'en_GB' };
const STATIC_FILES = ['test.html', 'materiale.html', 'sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'robots.txt'];
const STATIC_DIRS = ['assets', 'audio'];

const fail = (msg) => { console.error('build.mjs: ' + msg); process.exit(1); };
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');
const langUrl = (lang) => ORIGIN + (lang === DEFAULT_LANG ? '/' : `/${lang}/`);

const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function readDictionary(name) {
  const match = source.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  if (!match) fail(`could not find "const ${name} = {…};" in index.html`);
  return new Function('return ' + match[1])();
}
const T = readDictionary('T');
const T_META = readDictionary('T_META');
const LANGS = Object.keys(T);
for (const lang of LANGS) {
  if (!T_META[lang]) fail(`T_META has no entry for "${lang}"`);
  if (!OG_LOCALE[lang]) fail(`OG_LOCALE has no entry for "${lang}"`);
  Object.assign(T[lang], T_META[lang]);
}

// Replaces exactly one occurrence, so a renamed tag in index.html fails the build
// instead of silently shipping a page with the Italian value.
function replaceOnce(html, pattern, replacement, what) {
  const hits = html.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'));
  if (!hits || hits.length !== 1) fail(`expected exactly one ${what}, found ${hits ? hits.length : 0}`);
  return html.replace(pattern, replacement);
}

const hreflangLinks = [
  ...LANGS.map((lang) => `<link rel="alternate" hreflang="${lang}" href="${langUrl(lang)}">`),
  `<link rel="alternate" hreflang="x-default" href="${langUrl(DEFAULT_LANG)}">`,
].join('\n');

// Runs before anything renders. On the Italian home it sends a returning visitor
// to the language they picked earlier; crawlers have no stored choice and stay.
function headScript(lang) {
  const redirect = lang === DEFAULT_LANG
    ? `try{var l=localStorage.getItem('ssv_lang');if(l&&l!=='${DEFAULT_LANG}'&&${JSON.stringify(LANGS)}.indexOf(l)>-1&&location.pathname==='/')location.replace('/'+l+'/');}catch(e){}`
    : '';
  return `<script>window.SSV_PAGE_LANG='${lang}';${redirect}</script>`;
}

function buildPage(lang) {
  const tr = T[lang];
  let html = source;

  html = replaceOnce(html, /<meta charset="UTF-8">/, `<meta charset="UTF-8">\n${headScript(lang)}`, 'charset meta');
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${langUrl(lang)}">\n${hreflangLinks}`, 'canonical link');
  if (lang === DEFAULT_LANG) return html;

  html = replaceOnce(html, /<html lang="it">/, `<html lang="${lang}"${lang === 'ar' ? ' dir="rtl"' : ''}>`, '<html lang="it">');
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(tr.meta_title)}</title>`, '<title>');
  const metas = [
    ['name="description"', tr.meta_desc],
    ['property="og:title"', tr.meta_title],
    ['property="og:description"', tr.meta_desc],
    ['property="og:url"', langUrl(lang)],
    ['property="og:locale"', OG_LOCALE[lang]],
    ['name="twitter:title"', tr.meta_title],
    ['name="twitter:description"', tr.meta_desc],
  ];
  for (const [attr, value] of metas) {
    html = replaceOnce(html, new RegExp(`<meta ${attr} content="[^"]*">`), `<meta ${attr} content="${escapeAttr(value)}">`, `meta ${attr}`);
  }

  // Bake the translation into every element the in-page switch would rewrite.
  const expected = (source.match(/\sdata-i18n="/g) || []).length;
  let replaced = 0;
  html = html.replace(/<(\w+)([^>]*?\sdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g, (whole, tag, attrs, key) => {
    if (tr[key] === undefined) fail(`"${lang}" has no translation for "${key}"`);
    replaced += 1;
    const value = tr[key].includes('<') ? tr[key] : escapeHtml(tr[key]);
    return `<${tag}${attrs}>${value}</${tag}>`;
  });
  if (replaced !== expected) fail(`"${lang}": translated ${replaced} of ${expected} data-i18n elements`);

  // The page now lives one folder down, so its relative links must point at the root.
  html = html.replace(/(?<![\w/.-])assets\//g, '/assets/');
  html = html.replace(/href="(test|materiale)\.html"/g, 'href="/$1.html"');
  return html;
}

function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const alternates = [
    ...LANGS.map((lang) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${langUrl(lang)}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${langUrl(DEFAULT_LANG)}"/>`,
  ].join('\n');
  const homes = LANGS.map((lang) => `  <url>\n    <loc>${langUrl(lang)}</loc>\n    <lastmod>${today}</lastmod>\n${alternates}\n  </url>`);
  const others = ['test.html', 'materiale.html'].map((file) => `  <url>\n    <loc>${ORIGIN}/${file}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...homes, ...others].join('\n')}\n</urlset>\n`;
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const file of STATIC_FILES) fs.copyFileSync(path.join(ROOT, file), path.join(DIST, file));
for (const dir of STATIC_DIRS) fs.cpSync(path.join(ROOT, dir), path.join(DIST, dir), { recursive: true });

for (const lang of LANGS) {
  const outDir = lang === DEFAULT_LANG ? DIST : path.join(DIST, lang);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), buildPage(lang));
}
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), buildSitemap());

console.log(`build.mjs: ${LANGS.length} language pages (${LANGS.join(', ')}) written to dist/`);
