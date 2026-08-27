#!/usr/bin/env node
/*
 * Generates lightweight, crawlable static HTML pages for every term and
 * category — one file each under terms/ and categories/ — plus sitemap.xml.
 *
 * Why: the main site (index.html) renders everything inside a WebGL canvas,
 * so search engines never see any term content. These pages are plain,
 * server-free HTML with the real bilingual text, meant purely for indexing
 * and sharing; each links back into the interactive universe via
 * index.html?term=<id> for the full experience.
 *
 * Re-run this (`node scripts/build-seo-pages.js`) whenever data/terms.json
 * or data/categories.json changes, then commit the regenerated files.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://techverse.aelatar.com';

const categories = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/categories.json'), 'utf8'));
const terms = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/terms.json'), 'utf8'));
const idIndex = new Map(terms.map(t => [t.id, t]));

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function trim(s, n){
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

const termsDir = path.join(ROOT, 'terms');
const catsDir = path.join(ROOT, 'categories');
fs.mkdirSync(termsDir, { recursive: true });
fs.mkdirSync(catsDir, { recursive: true });

function termPage(term){
  const cat = categories[term.category];
  const related = (term.related || []).map(rid => idIndex.get(rid)).filter(Boolean);
  const relLinks = related.map(r =>
    `<li><a href="${esc(r.id)}.html">${esc(r.name)}</a></li>`
  ).join('\n      ');
  const aliasesLine = (term.aliases && term.aliases.length)
    ? `<p class="aliases">${esc(term.aliases.join(' · '))}</p>` : '';
  const desc = trim(term.definition_ar, 155);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(term.name)} — TechVerse | ${esc(cat.label_ar)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/terms/${esc(term.id)}.html">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(term.name)} — TechVerse">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/terms/${esc(term.id)}.html">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="../css/seo-page.css">
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'DefinedTerm',
  name: term.name,
  description: term.definition_en,
  inDefinedTermSet: `${SITE}/categories/${term.category}.html`,
  url: `${SITE}/terms/${term.id}.html`
})}
</script>
</head>
<body>
<div class="wrap">
  <a class="brand" href="../index.html">🌌 TechVerse</a>
  <div class="badge" style="--c:${esc(cat.color)}">${esc(cat.label_ar)} · ${esc(cat.label_en)}</div>
  <h1>${esc(term.name)}</h1>
  ${aliasesLine}
  <section class="def">
    <h2>AR · العربية</h2>
    <p dir="rtl" lang="ar">${esc(term.definition_ar)}</p>
  </section>
  <section class="def">
    <h2>EN · English</h2>
    <p dir="ltr" lang="en">${esc(term.definition_en)}</p>
  </section>
  ${related.length ? `<h3>روابط عصبية مرتبطة · Related Terms</h3>\n  <ul class="rel">\n      ${relLinks}\n  </ul>` : ''}
  <a class="explore" href="../index.html?term=${esc(term.id)}">🚀 استكشفه في الكون التفاعلي · Explore in the interactive universe</a>
</div>
</body>
</html>
`;
}

function categoryPage(catId, cat){
  const catTerms = terms.filter(t => t.category === catId).sort((a, b) => a.name.localeCompare(b.name));
  const items = catTerms.map(t =>
    `<li><a href="../terms/${esc(t.id)}.html">${esc(t.name)}</a></li>`
  ).join('\n      ');
  const desc = `${cat.label_ar} · ${cat.label_en} — ${catTerms.length} مصطلح على TechVerse`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(cat.label_ar)} · ${esc(cat.label_en)} — TechVerse</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/categories/${esc(catId)}.html">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(cat.label_ar)} · ${esc(cat.label_en)} — TechVerse">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/categories/${esc(catId)}.html">
<link rel="stylesheet" href="../css/seo-page.css">
</head>
<body>
<div class="wrap">
  <a class="brand" href="../index.html">🌌 TechVerse</a>
  <div class="badge" style="--c:${esc(cat.color)}">${esc(cat.label_ar)} · ${esc(cat.label_en)}</div>
  <h1>${esc(cat.label_ar)} <span class="sub">${esc(cat.label_en)}</span></h1>
  <p class="aliases">${catTerms.length} مصطلح · terms</p>
  <ul class="rel">
      ${items}
  </ul>
  <a class="explore" href="../index.html">🚀 استكشف المجرة كاملة في الكون التفاعلي · Explore the whole galaxy</a>
</div>
</body>
</html>
`;
}

let count = 0;
for(const term of terms){
  fs.writeFileSync(path.join(termsDir, `${term.id}.html`), termPage(term));
  count++;
}
for(const [catId, cat] of Object.entries(categories)){
  fs.writeFileSync(path.join(catsDir, `${catId}.html`), categoryPage(catId, cat));
}

const urls = [
  `${SITE}/`,
  ...Object.keys(categories).map(catId => `${SITE}/categories/${catId}.html`),
  ...terms.map(t => `${SITE}/terms/${t.id}.html`)
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);

console.log(`Generated ${count} term pages, ${Object.keys(categories).length} category pages, and sitemap.xml (${urls.length} URLs).`);
