import { createStarMap } from './starmap.js';

/* ============================ i18n ============================ */
const i18n = {
  ar: {
    dir: 'rtl',
    title: 'كون المصطلحات التقنية',
    subtitle: 'شبكات · لينكس · أنظمة · أمن سيبراني · مراقبة',
    searchPlaceholder: 'ابحث عن مصطلح…',
    hint: 'اضغط على أي نجمة لعرض شرحها، وتنقّل بين المصطلحات عبر الروابط العصبية المتصلة بها.',
    related: 'روابط عصبية مرتبطة',
    langToggle: 'English',
    legendToggle: 'الفئات',
    newBadge: 'جديد',
    notFoundTitle: 'المصطلح غير موجود',
    notFoundBody: name => `مفيش نجمة بالاسم "${name}" في الكون حاليًا.`,
    suggestions: 'أقرب المصطلحات:',
    close: 'إغلاق',
    coffee: 'ادعم المشروع',
    recentTitle: '🌟 أحدث الاكتشافات',
    galaxiesTitle: '🌌 اكتمال المجرات',
    constellationsTitle: '🌠 كوكبات (مسارات تعلّم)',
    daysAgo: n => n===0 ? 'اليوم' : n===1 ? 'من يوم' : `من ${n} أيام`,
    density: d => `كثافة الروابط: ${d}%`,
    journeyTitle: '🚀 رحلتي',
    pointsLabel: 'نقطة',
    visitedLabel: 'مصطلح مُستكشف',
    newBadgeTitle: 'شارة جديدة! ★',
    nextSuggestedLabel: '▶ التالي المقترح',
    relatedPathsLabel: '🌠 جزء من مسار تعلّم',
    visitedTag: '✓ تمت زيارته'
  },
  en: {
    dir: 'ltr',
    title: 'TechVerse',
    subtitle: 'Networking · Linux · Systems · Cybersecurity · Surveillance',
    searchPlaceholder: 'Search for a term…',
    hint: 'Click any star to view its explanation, and navigate between related terms via the neural links connecting them.',
    related: 'Related Neural Links',
    langToggle: 'العربية',
    legendToggle: 'Categories',
    newBadge: 'NEW',
    notFoundTitle: 'Term not found',
    notFoundBody: name => `No star named "${name}" exists in the universe yet.`,
    suggestions: 'Closest matches:',
    close: 'Close',
    coffee: 'Support the project',
    recentTitle: '🌟 Recent Discoveries',
    galaxiesTitle: '🌌 Galaxy Completeness',
    constellationsTitle: '🌠 Constellations (Learning Paths)',
    daysAgo: n => n===0 ? 'Today' : n===1 ? '1 day ago' : `${n} days ago`,
    density: d => `Link density: ${d}%`,
    journeyTitle: '🚀 My Journey',
    pointsLabel: 'Points',
    visitedLabel: 'Terms Explored',
    newBadgeTitle: 'New Badge! ★',
    nextSuggestedLabel: '▶ Suggested Next',
    relatedPathsLabel: '🌠 Part of a Learning Path',
    visitedTag: '✓ Visited'
  }
};
let lang = 'ar';

/* ============================ Data loading ============================ */
async function loadData(){
  const [categories, terms, constellations] = await Promise.all([
    fetch('data/categories.json').then(r=>r.json()),
    fetch('data/terms.json').then(r=>r.json()),
    fetch('data/constellations.json').then(r=>r.json())
  ]);
  return {categories, terms, constellations};
}

/* ============================ Fuzzy search ============================ */
function levenshtein(a, b){
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, ()=> new Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function findExact(terms, query){
  const q = query.trim().toLowerCase();
  if(!q) return null;
  return terms.find(t=> t.name.toLowerCase()===q) ||
         terms.find(t=> (t.aliases||[]).some(a=>a.toLowerCase()===q)) ||
         terms.find(t=> t.name.toLowerCase().includes(q)) ||
         terms.find(t=> (t.aliases||[]).some(a=>a.toLowerCase().includes(q))) ||
         null;
}

function findSuggestions(terms, query, limit=4){
  const q = query.trim().toLowerCase();
  const scored = terms.map(t=>{
    const names = [t.name, ...(t.aliases||[])];
    const best = Math.min(...names.map(n=>levenshtein(n, q)));
    return {term:t, dist:best};
  });
  scored.sort((a,b)=>a.dist-b.dist);
  return scored.slice(0, limit).map(s=>s.term);
}

function logFailedSearch(query){
  try{
    const key = 'techverse_search_wishlist';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.push({query, ts: new Date().toISOString()});
    localStorage.setItem(key, JSON.stringify(list.slice(-500)));
  }catch(e){ /* localStorage unavailable */ }
  /* Centralized wishlist: log each miss as a GoatCounter custom event so it
     aggregates across every visitor (not just this browser) once the real
     GoatCounter site code is in place — the dashboard's Events view then
     ranks missing terms by how often they were searched. Silently a no-op
     against the current placeholder site code / when analytics is blocked. */
  try{
    const slug = query.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'blank';
    if(window.goatcounter && typeof window.goatcounter.count === 'function'){
      window.goatcounter.count({
        path: 'missing-term/' + slug,
        title: 'Missing term search: ' + query,
        event: true
      });
    }
  }catch(e){ /* analytics unavailable */ }
}

/* ============================ Galaxy clustering ============================
   Each of the 12 categories is its own galaxy, clearly separated from the
   other 11, and each one has a genuinely different shape/logic (see
   GALAXY_SHAPES below) rather than one template reused everywhere — the
   same way real galaxies come in different Hubble types (spiral, barred,
   ring, elliptical...), not just rotated copies of one photo. Viewed from
   the free-orbiting 3D camera at anything but dead-on, each flat disk
   naturally reads as an oval, exactly like real galaxy shots. */
function hashUnit(str){
  let h = 2166136261 >>> 0;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

// Labels are a fixed offset above their star (see starmap.js buildGraph) —
// they never reposition themselves to dodge overlaps — so the collision
// force below has to give each star enough room for its own label text,
// not just its glow. Mirrors starmap.js's makeLabelTexture sizing (same
// font/size/padding) so the estimate matches what actually renders.
const _labelMeasure = document.createElement('canvas').getContext('2d');
function estimateLabelWorldWidth(name){
  _labelMeasure.font = "700 34px 'Tajawal', Arial, sans-serif";
  const w = _labelMeasure.measureText(name).width + 32;
  const h = 34 + 22;
  return 15 * (w / h);
}

function computeSubAngles(terms, categories){
  const bySubcat = {};
  terms.forEach(t=>{
    if(!t.subcategory) return;
    if(!bySubcat[t.category]) bySubcat[t.category] = new Set();
    bySubcat[t.category].add(t.subcategory);
  });
  const catKeys = Object.keys(categories);
  const result = {};
  Object.entries(bySubcat).forEach(([catId, set])=>{
    const keys = [...set].sort();
    const n = keys.length;
    const angles = {}, subIndex = {};
    keys.forEach((k,i)=>{ angles[k] = (i/n) * Math.PI * 2; subIndex[k] = i; });
    // Each galaxy's arms start from a different clock position, and half
    // spiral the other way, so a field of several galaxies doesn't look
    // uniformly stamped from one template.
    const idx = catKeys.indexOf(catId);
    const rotation = catKeys.length > 1 ? (idx / catKeys.length) * Math.PI * 2 : 0;
    const dir = idx % 2 === 0 ? 1 : -1;
    result[catId] = { angles, subIndex, n, rotation, dir };
  });
  return result;
}

// Pushes the 12 hand-placed category anchors (categories.json cx/cy) further
// apart from the shared center than their raw 0..1 grid would give, so
// neighboring galaxies read as visually distinct instead of bleeding into
// each other. Real 3D orbit/zoom (already in place) is how a visitor gets
// close to any one of them, the same way you'd approach a real galaxy field.
const GALAXY_SPREAD = 2.1;

// `compactCenters` (a Map catId -> {cx,cy} in the same pixel space as the
// plain formula below, or null/undefined for "use the full 12-galaxy map
// unmodified") lets the layout override where a category's anchor sits when
// some other categories are hidden — see buildCompactCenters, which is what
// actually computes it.
function galaxyCenter(catId, categories, width, height, compactCenters){
  if(compactCenters){
    const c = compactCenters.get(catId);
    if(c) return c;
  }
  const cat = categories[catId];
  return {
    cx: (cat.cx - 0.5) * width * GALAXY_SPREAD + width * 0.5,
    cy: (cat.cy - 0.5) * height * GALAXY_SPREAD + height * 0.5
  };
}

// Recomputes where each *visible* category's anchor should sit when some
// categories are hidden — pulling them together toward screen center, like
// the plain shrink-in-place this replaced, but spaced evenly around a circle
// (by their original relative angle from center, just evenly spaced) rather
// than simply scaling each one's original x/y offset. Scaling in place kept
// whatever x/y alignment two categories originally happened to have — e.g.
// networking and security's hand-placed anchors are both on the left side
// (similar x, very different y), so shrinking them straight toward center
// left them almost directly above/below each other: a barely-3-pixels-wide
// sliver that the orbiting camera would occasionally catch edge-on and read
// as a collapsed line. Even angular spacing has no such degenerate case for
// any subset size.
function buildCompactCenters(categories, hiddenCategories, width, height){
  const catKeys = Object.keys(categories);
  const visible = catKeys.filter(k=> !hiddenCategories.has(k));
  const n = visible.length;
  if(n === 0 || n === catKeys.length) return null; // nothing hidden (or everything hidden) — use the plain map as-is
  const map = new Map();
  if(n === 1){
    map.set(visible[0], { cx: width*0.5, cy: height*0.5 });
    return map;
  }
  const minWH = Math.min(width, height);
  const radiusFrac = Math.max(0.4, Math.min(1, n / catKeys.length));
  const radius = minWH * 0.4 * radiusFrac;
  const sorted = visible
    .map(k=> ({ k, angle0: Math.atan2(categories[k].cy - 0.5, categories[k].cx - 0.5) }))
    .sort((a, b)=> a.angle0 - b.angle0);
  sorted.forEach((e, i)=>{
    const angle = (i / n) * Math.PI * 2;
    map.set(e.k, { cx: width*0.5 + Math.cos(angle)*radius, cy: height*0.5 + Math.sin(angle)*radius });
  });
  return map;
}

// One shape per category, picked to fit what the category is about rather
// than assigned arbitrarily. Only a handful of underlying generators (see
// the switch in radialTarget) — real galaxy classification reuses "spiral"
// across countless individual galaxies too — but arm count/tightness/
// direction differ enough per category that no two read as the same galaxy.
const GALAXY_SHAPES = {
  networking:  { type: 'spiral', arms: 2, turns: 0.9 },
  linux:       { type: 'barredSpiral', turns: 0.75, barFrac: 0.4 },
  systems:     { type: 'spiral', arms: 4, turns: 0.55 },
  security:    { type: 'rings', bands: 3 },
  hardware:    { type: 'ring' },
  ai:          { type: 'spiral', arms: 3, turns: 1.3 },
  softdev:     { type: 'scatter' },
  databases:   { type: 'rings', bands: 2 },
  web:         { type: 'spiral', arms: 2, turns: 0.4 },
  blockchain:  { type: 'chain' },
  iot:         { type: 'hubSatellite' },
  projectmgmt: { type: 'elliptical' }
};

// Average direction (as an angle) from a galaxy's own center toward the
// center(s) of every other galaxy it has at least one cross-category link
// into — a term that bridges to several galaxies leans toward their
// combined direction, same as a vector sum of several pulls.
function crossGalaxyAngle(node, crossCatTargets, categories, width, height){
  const targets = crossCatTargets[node.id];
  if(!targets || targets.size === 0) return null;
  const home = galaxyCenter(node.category, categories, width, height);
  let vx = 0, vy = 0;
  targets.forEach(catId=>{
    const other = galaxyCenter(catId, categories, width, height);
    const dx = other.cx - home.cx, dy = other.cy - home.cy;
    const len = Math.hypot(dx, dy) || 1;
    vx += dx / len; vy += dy / len; // unit vectors, so one very-far galaxy
  });                                // can't dominate a nearer one
  if(Math.hypot(vx, vy) < 1e-6) return null;
  return Math.atan2(vy, vx);
}

function radialTarget(node, subAngleData, degreeMaxByCat, catTermCount, catOrderIndex, intraDegree, crossDegree, crossCatTargets, categories, width, height, compactCenters){
  const { cx, cy } = galaxyCenter(node.category, categories, width, height, compactCenters);
  const catData = subAngleData[node.category];
  const shape = GALAXY_SHAPES[node.category] || { type: 'spiral', arms: 2, turns: 0.85 };
  const rotation = catData ? (catData.rotation || 0) : 0;
  const dir = catData ? (catData.dir || 1) : 1;

  const subIdx = (catData && node.subcategory && node.subcategory in catData.subIndex)
    ? catData.subIndex[node.subcategory]
    : Math.floor(hashUnit(node.id) * 6);
  const armBaseAngle = (catData && node.subcategory && node.subcategory in catData.angles)
    ? catData.angles[node.subcategory] + rotation
    : hashUnit(node.id) * Math.PI * 2;
  // A little per-node jitter so an entire arm/cluster doesn't sit on one
  // infinitely-thin curve — it gets some visible width instead.
  const sectorCount = catData ? Math.max(4, catData.n) : 6;
  const jitter = (hashUnit(node.id + '_a') - 0.5) * (Math.PI / sectorCount) * 1.6;

  // Core-to-periphery radius budget shared by every shape: the terms most
  // connected to OTHER terms in their own galaxy sit near its center;
  // everything else orbits outward. Intra-galaxy degree only (not total
  // degree) drives this, so a term's centrality reflects its role within
  // its own galaxy, not connections elsewhere. Eased with a square (not
  // sqrt) so only the genuinely top-tier hub terms get pulled in tight —
  // a sqrt curve pulled every mid-degree term in too, which piled dozens
  // of terms into the same small core zone and read as one overexposed
  // blown-out cluster instead of a bright center + orbits.
  const maxDeg = degreeMaxByCat[node.category] || 1;
  const norm = Math.min(1, (intraDegree[node.id] || 0) / maxDeg);
  const termCount = catTermCount[node.category] || 1;
  const outerR = Math.min(width, height) * Math.min(0.20, 0.075 + termCount * 0.0035);
  const innerR = 22;
  const orderFrac = termCount > 1 ? (catOrderIndex[node.id] || 0) / termCount : 0;

  let x, y;
  switch(shape.type){
    case 'barredSpiral': {
      // Straight bar through the core (2 opposite ends), peeling off into
      // spiral arms past barFrac — like a barred spiral galaxy.
      const r = innerR + (outerR - innerR) * Math.pow(1 - norm, 2);
      const t = Math.max(0, Math.min(1, (r - innerR) / (outerR - innerR)));
      const barFrac = shape.barFrac || 0.4;
      const barAngle = (subIdx % 2) * Math.PI + rotation;
      if(t < barFrac){
        const perp = barAngle + Math.PI / 2;
        const w = (hashUnit(node.id + '_w') - 0.5) * innerR * 1.3;
        x = cx + Math.cos(barAngle) * r + Math.cos(perp) * w;
        y = cy + Math.sin(barAngle) * r + Math.sin(perp) * w;
      } else {
        const tt = (t - barFrac) / (1 - barFrac);
        const angle = barAngle + jitter + dir * tt * (shape.turns || 0.75) * Math.PI * 2;
        x = cx + Math.cos(angle) * r; y = cy + Math.sin(angle) * r;
      }
      break;
    }
    case 'rings': {
      // Discrete concentric bands (defense-in-depth / layered structure)
      // instead of a smooth radius gradient — hub terms land on the
      // innermost band, not just "somewhat closer in".
      const bands = shape.bands || 3;
      const bandIdx = Math.min(bands - 1, Math.floor((1 - norm) * bands));
      const bandR = innerR + (outerR - innerR) * ((bandIdx + 0.5) / bands);
      const angle = hashUnit(node.id + '_ring') * Math.PI * 2;
      x = cx + Math.cos(angle) * bandR; y = cy + Math.sin(angle) * bandR;
      break;
    }
    case 'ring': {
      // One clean ring, terms evenly spaced around it — for small,
      // tightly-scoped categories where a full core/arm structure would
      // be overkill for the term count.
      const rr = outerR * 0.75;
      const angle = orderFrac * Math.PI * 2 + rotation;
      x = cx + Math.cos(angle) * rr; y = cy + Math.sin(angle) * rr;
      break;
    }
    case 'scatter': {
      // Irregular galaxy: no rotational structure, radius only loosely
      // tied to degree, angle fully free.
      const rr = innerR + (outerR - innerR) * Math.pow(hashUnit(node.id + '_sr'), 0.7) * (0.5 + 0.5 * (1 - norm));
      const angle = hashUnit(node.id + '_sa') * Math.PI * 2;
      x = cx + Math.cos(angle) * rr; y = cy + Math.sin(angle) * rr;
      break;
    }
    case 'chain': {
      // Terms strung around a single undulating loop, like links in a
      // chain, instead of radiating from a center at all.
      const baseR = outerR * 0.68;
      const angle = orderFrac * Math.PI * 2 + rotation;
      const rr = baseR + 0.22 * baseR * Math.sin(angle * 5);
      x = cx + Math.cos(angle) * rr; y = cy + Math.sin(angle) * rr;
      break;
    }
    case 'hubSatellite': {
      // Small satellite clumps (one per subcategory) around a shared
      // center, with the most-connected terms pulled toward the true
      // center rather than staying in their clump — a hub with things
      // orbiting it, not a disk.
      const clusterR = outerR * 0.62;
      const localR = (hashUnit(node.id + '_hr') - 0.5) * innerR * 1.4;
      const localA = (hashUnit(node.id + '_ha') - 0.5) * 0.5;
      const angle = armBaseAngle + localA;
      const rr = innerR + (clusterR + localR - innerR) * (1 - Math.pow(norm, 2));
      x = cx + Math.cos(angle) * rr; y = cy + Math.sin(angle) * rr;
      break;
    }
    case 'elliptical': {
      // Smooth structureless density falloff from the center — no arms,
      // no rings, just a soft glow that thins out toward the edge.
      const angle = hashUnit(node.id + '_ea') * Math.PI * 2;
      const rr = outerR * Math.pow(hashUnit(node.id + '_er'), 1.6);
      x = cx + Math.cos(angle) * rr; y = cy + Math.sin(angle) * rr;
      break;
    }
    case 'spiral':
    default: {
      const r = innerR + (outerR - innerR) * Math.pow(1 - norm, 2);
      const t = Math.max(0, Math.min(1, (r - innerR) / (outerR - innerR)));
      const arms = shape.arms || 2;
      const armAngle = ((subIdx % arms) / arms) * Math.PI * 2 + rotation;
      const angle = armAngle + jitter + dir * t * (shape.turns || 0.85) * Math.PI * 2;
      x = cx + Math.cos(angle) * r; y = cy + Math.sin(angle) * r;
      break;
    }
  }

  // Terms that reach into another galaxy lean toward it: the more of a
  // term's total connections are cross-galaxy rather than local, the more
  // its position (angle blended via vector sum, not naive interpolation —
  // handles wraparound correctly; radius pushed outward) leans toward the
  // direction of the galaxy(ies) it's actually connected to, like a tidal
  // pull toward whatever it's linked to. A term with no local connections
  // at all is already at the rim from the radius formula above; this adds
  // the missing direction on top of that.
  const crossAngle = crossGalaxyAngle(node, crossCatTargets, categories, width, height);
  if(crossAngle !== null){
    const cross = crossDegree[node.id] || 0;
    const local = intraDegree[node.id] || 0;
    const w = Math.min(1, (cross / (cross + local + 1e-6)) * 1.3);
    const baseAngle = Math.atan2(y - cy, x - cx);
    const baseR = Math.hypot(x - cx, y - cy);
    const bx = Math.cos(baseAngle) * (1 - w) + Math.cos(crossAngle) * w;
    const by = Math.sin(baseAngle) * (1 - w) + Math.sin(crossAngle) * w;
    const blendedAngle = Math.atan2(by, bx);
    const blendedR = baseR + (outerR - baseR) * w * 0.5;
    x = cx + Math.cos(blendedAngle) * blendedR;
    y = cy + Math.sin(blendedAngle) * blendedR;
  }

  return { x, y };
}

/* ============================ Progress / gamification ============================
   Real, self-referential progress only: what the visitor has actually explored,
   stored locally in their own browser. No fabricated counters, no randomized
   rewards — points and badges are deterministic functions of genuine visits. */
const STORAGE_VISITED = 'techverse_visited';
const STORAGE_POINTS = 'techverse_points';
const STORAGE_BADGES = 'techverse_badges';

function loadSet(key){ try{ return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }catch(e){ return new Set(); } }
function saveSet(key, set){ try{ localStorage.setItem(key, JSON.stringify([...set])); }catch(e){ /* unavailable */ } }
function loadNum(key){ try{ return parseInt(localStorage.getItem(key) || '0', 10) || 0; }catch(e){ return 0; } }
function saveNum(key, n){ try{ localStorage.setItem(key, String(n)); }catch(e){ /* unavailable */ } }

const STATIC_BADGES = [
  { id:'explorer_10', threshold:10, icon:'🔭', name_ar:'مستكشف مبتدئ', name_en:'Novice Explorer' },
  { id:'explorer_50', threshold:50, icon:'🌟', name_ar:'كسرت حاجز الـ50 مصطلح', name_en:'Broke the 50-Term Barrier' },
  { id:'explorer_100', threshold:100, icon:'✨', name_ar:'كسرت حاجز الـ100 مصطلح', name_en:'Broke the 100-Term Barrier' },
  { id:'explorer_200', threshold:200, icon:'🌌', name_ar:'خبير الكون', name_en:'Universe Expert' }
];

/* ============================ Galaxy stats ============================ */
function computeCategoryStats(categories, terms){
  const stats = {};
  Object.keys(categories).forEach(catId=>{
    stats[catId] = { count: 0, internalLinks: 0 };
  });
  terms.forEach(t=>{ if(stats[t.category]) stats[t.category].count++; });
  const idIndex = new Map(terms.map(t=>[t.id, t]));
  const seen = new Set();
  terms.forEach(t=>{
    (t.related||[]).forEach(rid=>{
      const other = idIndex.get(rid);
      if(!other) return;
      const key = [t.id, rid].sort().join('__');
      if(seen.has(key)) return;
      seen.add(key);
      if(other.category === t.category && stats[t.category]) stats[t.category].internalLinks++;
    });
  });
  const maxCount = Math.max(1, ...Object.values(stats).map(s=>s.count));
  Object.values(stats).forEach(s=>{
    s.maxCount = maxCount;
    s.density = s.count > 1 ? Math.round((2*s.internalLinks / (s.count*(s.count-1))) * 100) : 0;
  });
  return stats;
}

/* ============================ Main ============================ */
(async function main(){
  const {categories, terms, constellations} = await loadData();
  const idIndex = new Map(terms.map(t=>[t.id,t]));
  const nodes = terms.map(t=>({...t}));
  const linkSet = new Set();
  const links = [];
  terms.forEach(t=>{
    (t.related||[]).forEach(rid=>{
      if(!idIndex.has(rid)) return;
      const key = [t.id,rid].sort().join('__');
      if(linkSet.has(key)) return;
      linkSet.add(key);
      links.push({source:t.id, target:rid});
    });
  });
  const degree = {};
  links.forEach(l=>{ degree[l.source]=(degree[l.source]||0)+1; degree[l.target]=(degree[l.target]||0)+1; });
  // Split each term's connections into "within its own galaxy" (drives how
  // central it sits — see degreeMaxByCat below) vs "reaching into another
  // galaxy" (drives which direction it leans — see crossCatTargets, used in
  // radialTarget). A term with only cross-galaxy links naturally lands at
  // the rim already, since its intra-degree is 0.
  const intraDegree = {}, crossDegree = {}, crossCatTargets = {};
  links.forEach(l=>{
    const a = idIndex.get(l.source), b = idIndex.get(l.target);
    if(!a || !b) return;
    if(a.category === b.category){
      intraDegree[l.source] = (intraDegree[l.source]||0) + 1;
      intraDegree[l.target] = (intraDegree[l.target]||0) + 1;
    } else {
      crossDegree[l.source] = (crossDegree[l.source]||0) + 1;
      crossDegree[l.target] = (crossDegree[l.target]||0) + 1;
      (crossCatTargets[l.source] = crossCatTargets[l.source] || new Set()).add(b.category);
      (crossCatTargets[l.target] = crossCatTargets[l.target] || new Set()).add(a.category);
    }
  });
  const degreeMaxByCat = {}, catTermCount = {}, catOrderIndex = {};
  nodes.forEach(n=>{
    catOrderIndex[n.id] = catTermCount[n.category] || 0;
    catTermCount[n.category] = (catTermCount[n.category]||0) + 1;
    degreeMaxByCat[n.category] = Math.max(degreeMaxByCat[n.category]||0, intraDegree[n.id]||0);
  });
  nodes.forEach(n=> n.r = Math.min(17, 6.5 + (degree[n.id]||0)*1.15));
  nodes.forEach(n=> n.labelW = estimateLabelWorldWidth(n.name));

  let width = window.innerWidth, height = window.innerHeight;
  const canvas = document.getElementById('stage-canvas');
  const starMap = createStarMap({ canvas, width, height, categories });

  const isRecent = (dateAdded) => {
    if(!dateAdded) return false;
    const days = (Date.now() - new Date(dateAdded).getTime()) / 86400000;
    return days <= 7;
  };

  starMap.buildGraph(nodes, links);

  /* ---- progress / gamification state ---- */
  let visitedIds = loadSet(STORAGE_VISITED);
  let points = loadNum(STORAGE_POINTS);
  let earnedBadges = loadSet(STORAGE_BADGES);
  starMap.setVisited([...visitedIds]);
  const categoryStats = computeCategoryStats(categories, terms);

  function categoryVisitedCount(catId){
    let n = 0;
    terms.forEach(t=>{ if(t.category===catId && visitedIds.has(t.id)) n++; });
    return n;
  }

  function computeCurrentBadges(){
    const list = [];
    STATIC_BADGES.forEach(b=> list.push({ ...b, earned: visitedIds.size >= b.threshold }));
    Object.entries(categories).forEach(([catId, cat])=>{
      const total = categoryStats[catId].count;
      if(total === 0) return;
      list.push({
        id:'galaxy_'+catId, icon:'🪐',
        name_ar:`مستكشف مجرة ${cat.label_ar}`, name_en:`${cat.label_en} Galaxy Master`,
        earned: categoryVisitedCount(catId) >= total
      });
    });
    constellations.forEach(c=>{
      list.push({
        id:'path_'+c.id, icon:'🛰️',
        name_ar:`أكملت مسار ${c.name_ar}`, name_en:`Completed ${c.name_en} Path`,
        earned: c.term_ids.every(id=>visitedIds.has(id))
      });
    });
    return list;
  }

  function showBadgeToast(badge){
    const wrap = document.getElementById('badgeToastWrap');
    if(!wrap) return;
    const el = document.createElement('div');
    el.className = 'badgeToast';
    el.innerHTML = `<span class="tIcon">${badge.icon}</span><span><span class="tTitle">${i18n[lang].newBadgeTitle}</span>${lang==='ar' ? badge.name_ar : badge.name_en}</span>`;
    wrap.appendChild(el);
    setTimeout(()=> el.remove(), 3100);
  }

  function checkBadges(){
    computeCurrentBadges().filter(b=>b.earned).forEach(b=>{
      if(!earnedBadges.has(b.id)){
        earnedBadges.add(b.id);
        showBadgeToast(b);
      }
    });
    saveSet(STORAGE_BADGES, earnedBadges);
  }

  function updateJourneyChip(){
    d3.select('#journeyPointsInline').text(points);
  }
  function bumpJourneyChip(){
    const chip = document.getElementById('journeyChip');
    if(!chip) return;
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }

  function markVisited(id){
    const already = visitedIds.has(id);
    visitedIds.add(id);
    saveSet(STORAGE_VISITED, visitedIds);
    starMap.setVisited([...visitedIds]);
    if(!already){
      points += 10;
      saveNum(STORAGE_POINTS, points);
      bumpJourneyChip();
    }
    checkBadges();
    updateJourneyChip();
    updateLegendProgress();
  }

  function getNextSuggested(term){
    const related = (term.related||[]).map(rid=>idIndex.get(rid)).filter(Boolean).filter(r=>!visitedIds.has(r.id));
    if(related.length) return related[0];
    const sameSub = terms.filter(t=> t.category===term.category && t.subcategory===term.subcategory && t.id!==term.id && !visitedIds.has(t.id));
    if(sameSub.length) return sameSub[0];
    const sameCat = terms.filter(t=> t.category===term.category && t.id!==term.id && !visitedIds.has(t.id));
    if(sameCat.length) return sameCat[0];
    const anyLeft = terms.filter(t=> t.id!==term.id && !visitedIds.has(t.id));
    if(anyLeft.length) return anyLeft[Math.floor(Math.random()*anyLeft.length)];
    return null;
  }

  const subAngleData = computeSubAngles(terms, categories);
  // Tracks which categories are currently toggled off in the legend —
  // starMap.setCategoryVisible (called alongside this) is what actually
  // hides their stars/links/haze; here it drives compactCenters (see
  // buildCompactCenters) and how hard the x/y anchor pull is (below).
  const hiddenCategories = new Set();
  const totalCatCount = Object.keys(categories).length;
  // Rebuilt (see the legend click handler) whenever hiddenCategories
  // changes; null means "nothing hidden, use the plain 12-galaxy map".
  let compactCenters = null;
  // The x/y anchor pull (below) competes against charge repulsion and
  // collision every tick, so relocating the anchors alone only pulls the
  // settled cluster distance in partway — ramping the pull stronger as
  // fewer categories are visible is what makes them actually end up close
  // together rather than just less far apart.
  function currentXYStrength(){
    const visibleCount = totalCatCount - hiddenCategories.size;
    const visibleFrac = visibleCount <= 0 ? 1 : Math.max(0.22, Math.min(1, visibleCount / totalCatCount));
    return 0.14 + (1 - visibleFrac) * 0.3;
  }
  const targetX = d=> radialTarget(d, subAngleData, degreeMaxByCat, catTermCount, catOrderIndex, intraDegree, crossDegree, crossCatTargets, categories, width, height, compactCenters).x;
  const targetY = d=> radialTarget(d, subAngleData, degreeMaxByCat, catTermCount, catOrderIndex, intraDegree, crossDegree, crossCatTargets, categories, width, height, compactCenters).y;

  // Cross-galaxy links (a term related to one in a different category) stay
  // gentle — enough to bend a line across the gap and show the connection —
  // instead of pulling as hard as same-galaxy links do. At full strength a
  // handful of cross-links (e.g. hardware's PoE/UTP cable terms linking into
  // networking) were strong enough to physically drag those terms out of
  // their own galaxy entirely, breaking shapes like "ring" that depend on
  // every term landing close to a specific radius.
  const linkStrength = l => l.source.category === l.target.category ? 0.4 : 0.05;

  const collideRadius = d=>{
    if(hiddenCategories.has(d.category)) return 0; // see chargeStrength below
    const nodeR = d.r*1.25 + 11;
    const labelUp = d.r + 28; // ~labelBaseY + half label height, in starmap.js
    const labelR = Math.sqrt((d.labelW/2)**2 + labelUp*labelUp) + 4;
    return Math.max(nodeR, labelR);
  };
  // Hidden categories' stars are invisible but stay in the simulation (so
  // they're already near the right spot if the category is shown again) —
  // without this, up to ~230 of them still physically repelled/collided
  // against the handful of genuinely visible stars, which fought the
  // shrink-together pull above and could leave the visible galaxies further
  // apart than before instead of closer.
  const chargeStrength = d=> hiddenCategories.has(d.category) ? 0 : -95;

  const sim = d3.forceSimulation(nodes)
    // Distance scales with both endpoints' radii so heavily-connected hub
    // terms (bigger glow halos) don't get pulled in closer than their own
    // glow radius allows — otherwise the busiest nodes stay visually fused
    // together no matter how much collision spacing is added elsewhere.
    .force('link', d3.forceLink(links).id(d=>d.id).distance(d=> 50 + (d.source.r||8)*0.8 + (d.target.r||8)*0.8).strength(linkStrength))
    .force('charge', d3.forceManyBody().strength(chargeStrength))
    // Sized to cover the star's own fixed label too (see estimateLabelWorldWidth
    // above and starmap.js buildGraph), not just its glow — since the label no
    // longer dodges overlaps on its own, keeping stars (and their attached
    // labels) apart is the only thing preventing text from overlapping.
    .force('collide', d3.forceCollide(collideRadius))
    // Pulls each term toward its core-to-periphery position within its own
    // circular galaxy (see radialTarget) — stronger than before so that
    // clear per-galaxy structure wins out over the general link/charge pull.
    .force('x', d3.forceX(targetX).strength(currentXYStrength()))
    .force('y', d3.forceY(targetY).strength(currentXYStrength()));
  // Node/link screen positions are now refreshed every animation frame inside
  // starmap.js (so the gentle drift keeps running even once the simulation
  // settles), so no d3 'tick' handler is needed here.

  window.addEventListener('resize', ()=>{
    width = window.innerWidth; height = window.innerHeight;
    starMap.resize(width, height);
    compactCenters = buildCompactCenters(categories, hiddenCategories, width, height);
    sim.force('x', d3.forceX(targetX).strength(currentXYStrength()));
    sim.force('y', d3.forceY(targetY).strength(currentXYStrength()));
    sim.alpha(0.3).restart();
  });

  // Let the layout settle for a moment, then reveal the founding batch with a birth effect.
  setTimeout(()=>{
    const newIds = nodes.filter(n=>isRecent(n.date_added)).map(n=>n.id);
    if(newIds.length) starMap.triggerBirth(newIds);
  }, 900);

  // Deep link support (?term=<id>) — lets the static SEO pages and shared
  // links jump straight to a specific star once the layout has settled.
  const deepLinkId = new URLSearchParams(window.location.search).get('term');
  if(deepLinkId && idIndex.has(deepLinkId)){
    setTimeout(()=> selectNode(deepLinkId), 950);
  }

  /* ---- interaction ---- */
  let selectedId = null;
  const neighborMap = {};
  nodes.forEach(n=> neighborMap[n.id] = new Set());
  links.forEach(l=>{
    neighborMap[l.source.id||l.source].add(l.target.id||l.target);
    neighborMap[l.target.id||l.target].add(l.source.id||l.source);
  });

  let activeConstellationId = null;
  const termConstellations = new Map();
  terms.forEach(t=> termConstellations.set(t.id, []));
  constellations.forEach(c=> c.term_ids.forEach(tid=>{
    if(termConstellations.has(tid)) termConstellations.get(tid).push(c);
  }));

  function activateConstellation(cid){
    activeConstellationId = cid;
    const c = constellations.find(c=>c.id===cid);
    starMap.setConstellation(c ? c.term_ids : null);
  }

  /* ---- curiosity gap: a genuine question built from the term's own real
     relationships (never fabricated, never a substitute for the full
     definition, which is always shown in full right below it) ---- */
  function getTeaser(term){
    const cat = categories[term.category];
    const inPath = (termConstellations.get(term.id) || []).length > 0;
    const relFirst = (term.related && term.related.length) ? idIndex.get(term.related[0]) : null;
    if(inPath){
      return {
        ar: `🌠 "${term.name}" جزء من مسار تعلّم كامل — عايز تعرف هو إيه؟`,
        en: `🌠 "${term.name}" is part of a full learning path — want to see it?`
      };
    }
    if(relFirst){
      return {
        ar: `🔗 إيه العلاقة بين "${term.name}" و"${relFirst.name}"؟`,
        en: `🔗 What connects "${term.name}" and "${relFirst.name}"?`
      };
    }
    return {
      ar: `✦ ليه "${term.name}" مهم في عالم ${cat.label_ar}؟`,
      en: `✦ Why does "${term.name}" matter in ${cat.label_en}?`
    };
  }

  function selectNode(id){
    selectedId = id;
    activeConstellationId = null;
    starMap.setConstellation(null);
    starMap.setSelection(id, neighborMap[id]);
    markVisited(id);
    openPanel(idIndex.get(id));
    starMap.centerOn(id);
    hideNotFound();
  }

  function applyHoloStagger(){
    const items = [
      document.querySelector('#panelBadge'),
      document.querySelector('.subBadge'),
      document.querySelector('.newBadge'),
      document.querySelector('#panelName'),
      document.querySelector('.curiosityHook'),
      ...document.querySelectorAll('#panelDefs .defBlock'),
      document.querySelector('#relTitle'),
      document.querySelector('#relList'),
      document.querySelector('.relatedPaths'),
      document.querySelector('.nextSuggested')
    ].filter(Boolean);
    items.forEach((el, i)=>{
      el.classList.remove('holoStep');
      void el.offsetWidth;
      el.classList.add('holoStep');
      el.style.animationDelay = (i*0.06)+'s';
    });
  }

  function openPanel(term){
    const cat = categories[term.category];
    document.getElementById('panel').style.setProperty('--accent', cat.color);
    const badge = d3.select('#panelBadge');
    badge.selectAll('*').remove();
    badge.style('background', cat.color+'22').style('color', cat.color).style('border','1px solid '+cat.color+'55')
      .text(lang==='ar' ? cat.label_ar : cat.label_en);
    const existingBadge = document.querySelector('.newBadge');
    if(existingBadge) existingBadge.remove();
    const existingSub = document.querySelector('.subBadge');
    if(existingSub) existingSub.remove();
    const sub = cat.subcategories && cat.subcategories[term.subcategory];
    if(sub){
      badge.node().insertAdjacentHTML('afterend', `<span class="subBadge">${lang==='ar' ? sub.label_ar : sub.label_en}</span>`);
    }
    if(isRecent(term.date_added)){
      badge.node().insertAdjacentHTML('afterend', `<span class="newBadge">★ ${i18n[lang].newBadge}</span>`);
    }
    d3.select('#panelName').text(term.name).style('color', cat.color);
    d3.select('#panelDefs').html('');
    const defsWrap = d3.select('#panelDefs');
    defsWrap.append('div').attr('class','curiosityHook').text(getTeaser(term)[lang]);
    const arBlock = defsWrap.append('div').attr('class','defBlock');
    arBlock.append('span').attr('class','defLangTag').text('AR · العربية');
    arBlock.append('div').attr('class','defText').attr('lang','ar').attr('dir','rtl').text(term.definition_ar);
    const enBlock = defsWrap.append('div').attr('class','defBlock');
    enBlock.append('span').attr('class','defLangTag').text('EN · English');
    enBlock.append('div').attr('class','defText').attr('lang','en').attr('dir','ltr').text(term.definition_en);

    d3.select('#relTitle').text(i18n[lang].related);
    const relList = d3.select('#relList').html('');
    (term.related||[]).forEach(rid=>{
      const r = idIndex.get(rid);
      if(!r) return;
      const chip = relList.append('div').attr('class','relChip')
        .style('border-color', categories[r.category].color+'55')
        .on('click', ()=> selectNode(rid));
      chip.append('span').text(r.name);
      if(visitedIds.has(rid)) chip.append('span').attr('class','visitedTag').text(i18n[lang].visitedTag);
    });

    const existingPaths = document.querySelector('.relatedPaths');
    if(existingPaths) existingPaths.remove();
    const memberPaths = termConstellations.get(term.id) || [];
    if(memberPaths.length){
      const pathsSel = d3.select('#panelInner').append('div').attr('class','relatedPaths');
      pathsSel.append('div').attr('class','nsLabel').text(i18n[lang].relatedPathsLabel);
      const wrap = pathsSel.append('div').attr('class','pathChipWrap');
      memberPaths.forEach(c=>{
        wrap.append('div').attr('class','pathChip')
          .on('click', ()=>{
            closePanel();
            activateConstellation(c.id);
            renderStats();
            d3.select('#statsPanel').classed('open', true);
          })
          .call(chip=>{
            chip.append('span').attr('class','pIcon').text('🌠');
            chip.append('span').text(lang==='ar' ? c.name_ar : c.name_en);
          });
      });
    }

    const existingNext = document.querySelector('.nextSuggested');
    if(existingNext) existingNext.remove();
    const next = getNextSuggested(term);
    if(next){
      const nextSel = d3.select('#panelInner').append('div').attr('class','nextSuggested');
      nextSel.append('div').attr('class','nsLabel').text(i18n[lang].nextSuggestedLabel);
      nextSel.append('div').attr('class','nsChip').text(next.name).on('click', ()=> selectNode(next.id));
    }

    d3.select('#panel').classed('open', true);
    applyHoloStagger();
  }

  function closePanel(){
    d3.select('#panel').classed('open', false);
    selectedId = null;
    starMap.setSelection(null, new Set());
  }
  d3.select('#closePanel').on('click', closePanel);
  starMap.onNodeClick(id => selectNode(id));
  starMap.onBackgroundClick(()=>{
    if(selectedId) closePanel();
    if(activeConstellationId){ activeConstellationId = null; starMap.setConstellation(null); }
    hideNotFound();
    d3.select('#statsPanel').classed('open', false);
  });

  const teaserEl = document.getElementById('hoverTeaser');
  starMap.onNodeHover((id, x, y)=>{
    if(!id){ teaserEl.classList.remove('show'); return; }
    const t = idIndex.get(id);
    if(!t) return;
    teaserEl.textContent = getTeaser(t)[lang];
    const rtl = document.documentElement.getAttribute('dir') === 'rtl';
    teaserEl.style.top = (y - 12) + 'px';
    if(rtl){
      teaserEl.style.right = (window.innerWidth - x + 16) + 'px';
      teaserEl.style.left = 'auto';
    } else {
      teaserEl.style.left = (x + 16) + 'px';
      teaserEl.style.right = 'auto';
    }
    teaserEl.classList.add('show');
  });

  /* ---- legend ---- */
  const legendSel = d3.select('#legend');
  function renderLegend(){
    legendSel.html('');
    Object.entries(categories).forEach(([key,c])=>{
      const chip = legendSel.append('div').attr('class','chip').attr('data-cat',key);
      chip.append('div').attr('class','dot').style('background', c.color);
      chip.append('span').text(lang==='ar' ? c.label_ar : c.label_en);
      const total = categoryStats[key] ? categoryStats[key].count : 0;
      if(total) chip.append('span').attr('class','chipProgress').text(`${categoryVisitedCount(key)}/${total}`);
      chip.on('click', function(){
        const off = chip.classed('off');
        chip.classed('off', !off);
        if(off) hiddenCategories.delete(key); else hiddenCategories.add(key);
        compactCenters = buildCompactCenters(categories, hiddenCategories, width, height);
        starMap.setCategoryVisible(key, off);
        // d3's forces only evaluate their accessor once, when (re-)attached —
        // not every tick — so hiddenCategories/compactCenters having changed
        // does nothing until every affected force is reassigned here.
        // Reheating afterward is what makes the still-visible galaxies
        // actually drift toward their new, tighter anchor positions instead
        // of staying frozen wherever they'd already settled — and zeroing
        // out hidden stars' charge/collision is what stops them from
        // crowding the visible ones apart as everything pulls inward.
        sim.force('x', d3.forceX(targetX).strength(currentXYStrength()));
        sim.force('y', d3.forceY(targetY).strength(currentXYStrength()));
        sim.force('charge', d3.forceManyBody().strength(chargeStrength));
        sim.force('collide', d3.forceCollide(collideRadius));
        sim.alpha(0.5).restart();
      });
    });
  }
  renderLegend();

  const legendPanel = document.getElementById('legendPanel');
  d3.select('#legendToggleLabel').text(i18n[lang].legendToggle);
  let legendCollapsed = false;
  try{ legendCollapsed = localStorage.getItem('techverse_legend_collapsed') === '1'; }catch(e){ /* unavailable */ }
  legendPanel.classList.toggle('collapsed', legendCollapsed);
  document.getElementById('legendToggle').addEventListener('click', ()=>{
    legendCollapsed = !legendCollapsed;
    legendPanel.classList.toggle('collapsed', legendCollapsed);
    try{ localStorage.setItem('techverse_legend_collapsed', legendCollapsed ? '1' : '0'); }catch(e){ /* unavailable */ }
  });

  function updateLegendProgress(){
    legendSel.selectAll('.chip').each(function(){
      const key = this.getAttribute('data-cat');
      const total = categoryStats[key] ? categoryStats[key].count : 0;
      const span = this.querySelector('.chipProgress');
      if(span && total) span.textContent = `${categoryVisitedCount(key)}/${total}`;
    });
  }

  /* ---- stats / recent discoveries / constellations panel ---- */
  function renderConstellationSteps(constellation){
    const stepsSel = d3.select('#constellationSteps').html('');
    if(!constellation) return;
    const desc = stepsSel.append('div').attr('class','constDesc')
      .text(lang==='ar' ? constellation.description_ar : constellation.description_en);
    constellation.term_ids.forEach((tid, i)=>{
      const t = idIndex.get(tid);
      if(!t) return;
      const row = stepsSel.append('div').attr('class','constStep')
        .on('click', ()=>{ d3.select('#statsPanel').classed('open', false); selectNode(tid); });
      row.append('div').attr('class','stepNum').text(i+1);
      row.append('div').style('color', categories[t.category].color).text(t.name);
    });
  }

  function renderJourney(){
    d3.select('#statsTitleJourney').text(i18n[lang].journeyTitle);
    const overview = d3.select('#journeyOverview').html('');
    function addStat(num, lbl){
      const box = overview.append('div').attr('class','journeyStat');
      box.append('div').attr('class','jNum').text(num);
      box.append('div').attr('class','jLbl').text(lbl);
    }
    addStat(points, i18n[lang].pointsLabel);
    addStat(`${visitedIds.size}/${terms.length}`, i18n[lang].visitedLabel);

    const badgesSel = d3.select('#journeyBadges').html('');
    computeCurrentBadges().forEach(b=>{
      badgesSel.append('div').attr('class','badgeChip'+(b.earned ? '' : ' locked'))
        .html(`<span class="bIcon">${b.icon}</span><span>${lang==='ar' ? b.name_ar : b.name_en}</span>`);
    });
  }

  function renderStats(){
    renderJourney();
    d3.select('#statsTitleRecent').text(i18n[lang].recentTitle);
    d3.select('#statsTitleGalaxies').text(i18n[lang].galaxiesTitle);
    d3.select('#statsTitleConstellations').text(i18n[lang].constellationsTitle);

    const constSel = d3.select('#constellationList').html('');
    constellations.forEach(c=>{
      constSel.append('div')
        .attr('class', 'constChip' + (activeConstellationId===c.id ? ' active' : ''))
        .text(lang==='ar' ? c.name_ar : c.name_en)
        .on('click', ()=>{
          if(activeConstellationId === c.id){
            activeConstellationId = null;
            starMap.setConstellation(null);
          } else {
            activateConstellation(c.id);
          }
          renderStats();
        });
    });
    if(activeConstellationId){
      renderConstellationSteps(constellations.find(c=>c.id===activeConstellationId));
    }

    const recent = [...terms].filter(t=>t.date_added)
      .sort((a,b)=> new Date(b.date_added) - new Date(a.date_added))
      .slice(0, 15);
    const recentSel = d3.select('#recentList').html('');
    recent.forEach(t=>{
      const days = Math.floor((Date.now() - new Date(t.date_added).getTime()) / 86400000);
      const row = recentSel.append('div').attr('class','recentRow')
        .on('click', ()=>{ d3.select('#statsPanel').classed('open', false); selectNode(t.id); });
      row.append('div').attr('class','rDot').style('background', categories[t.category].color);
      row.append('div').attr('class','rName').text(t.name);
      row.append('div').attr('class','rDate').text(i18n[lang].daysAgo(days));
    });

    const galaxySel = d3.select('#galaxyStats').html('');
    Object.entries(categories).forEach(([key, cat])=>{
      const s = categoryStats[key];
      const row = galaxySel.append('div').attr('class','galaxyRow');
      const head = row.append('div').attr('class','gHead');
      head.append('div').attr('class','gDot').style('background', cat.color);
      head.append('span').text(lang==='ar' ? cat.label_ar : cat.label_en);
      head.append('span').attr('class','gCount').text(s.count);
      head.append('span').attr('class','gVisited').text(`(${categoryVisitedCount(key)} ✓)`);
      row.append('div').attr('class','gBarTrack').append('div').attr('class','gBarFill')
        .style('width', Math.round((s.count / s.maxCount) * 100) + '%')
        .style('background', cat.color);
      row.append('div').attr('class','gDensity').text(i18n[lang].density(s.density));
    });
  }
  d3.select('#statsBtn').on('click', ()=>{
    renderStats();
    d3.select('#statsPanel').classed('open', true);
  });
  d3.select('#journeyChip').on('click', ()=>{
    renderStats();
    d3.select('#statsPanel').classed('open', true);
  });
  d3.select('#closeStats').on('click', ()=> d3.select('#statsPanel').classed('open', false));
  updateJourneyChip();

  /* ---- not found panel ---- */
  function showNotFound(query, suggestions){
    const box = d3.select('#notFound');
    box.html('');
    box.append('div').attr('class','nfTitle').text(i18n[lang].notFoundTitle);
    box.append('div').text(i18n[lang].notFoundBody(query));
    box.append('div').attr('class','nfSuggestions').selectAll('div').data(suggestions).enter().append('div')
      .attr('class','relChip').text(d=>d.name)
      .on('click', d=>{ selectNode(d.id); });
    box.classed('show', true);
  }
  function hideNotFound(){ d3.select('#notFound').classed('show', false); }

  /* ---- search ---- */
  function refreshDatalist(){
    const dl = d3.select('#termsList').html('');
    terms.forEach(t=> dl.append('option').attr('value', t.name));
  }
  refreshDatalist();

  d3.select('#search').on('keyup', function(ev){
    if(ev.key !== 'Enter') return;
    const val = this.value.trim();
    if(!val) return;
    const match = findExact(terms, val);
    if(match){
      selectNode(match.id);
      this.value='';
    } else {
      logFailedSearch(val);
      showNotFound(val, findSuggestions(terms, val));
    }
  });

  /* ---- zoom controls ---- */
  d3.select('#zoomIn').on('click', ()=> starMap.zoomBy(1.35));
  d3.select('#zoomOut').on('click', ()=> starMap.zoomBy(0.74));
  d3.select('#zoomReset').on('click', ()=> starMap.zoomReset());

  /* ---- language toggle ---- */
  function applyLangChrome(){
    const t = i18n[lang];
    document.documentElement.setAttribute('dir', t.dir);
    document.documentElement.setAttribute('lang', lang);
    d3.select('#title').text(t.title);
    d3.select('#subtitle').text(t.subtitle);
    d3.select('#search').attr('placeholder', t.searchPlaceholder);
    d3.select('#hint').text(t.hint);
    d3.select('#langToggle').text(t.langToggle);
    d3.select('#legendToggleLabel').text(t.legendToggle);
    d3.select('#journeyChip').attr('title', t.journeyTitle);
    d3.select('#coffeeLink').text('☕ ' + t.coffee);
    renderLegend();
    if(selectedId) openPanel(idIndex.get(selectedId));
    if(document.querySelector('#statsPanel').classList.contains('open')) renderStats();
  }
  d3.select('#langToggle').on('click', ()=>{
    lang = lang === 'ar' ? 'en' : 'ar';
    applyLangChrome();
  });
  applyLangChrome();
})();
