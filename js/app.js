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

/* ============================ Sub-galaxy clustering ============================
   Large categories (many terms/subcategories) get visually crowded when every
   term is pulled toward one single anchor point. Instead, terms are pulled
   toward a secondary anchor offset from the category center based on their
   subcategory, arranging subcategories in a ring around the galaxy so related
   terms cluster together without the whole category collapsing into one blob. */
function computeSubAngles(terms){
  const bySubcat = {};
  terms.forEach(t=>{
    if(!t.subcategory) return;
    if(!bySubcat[t.category]) bySubcat[t.category] = new Set();
    bySubcat[t.category].add(t.subcategory);
  });
  const result = {};
  Object.entries(bySubcat).forEach(([catId, set])=>{
    const keys = [...set].sort();
    const n = keys.length;
    const angles = {};
    keys.forEach((k,i)=>{ angles[k] = (i/n) * Math.PI * 2; });
    result[catId] = { angles, n };
  });
  return result;
}

function subOffset(node, subAngleData, width, height){
  const catData = subAngleData[node.category];
  if(!catData || catData.n <= 1 || !node.subcategory || !(node.subcategory in catData.angles)){
    return { ox: 0, oy: 0 };
  }
  const angle = catData.angles[node.subcategory];
  const radiusFrac = Math.min(0.14, 0.05 + catData.n * 0.012);
  const R = Math.min(width, height) * radiusFrac;
  return { ox: Math.cos(angle) * R, oy: Math.sin(angle) * R };
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
  nodes.forEach(n=> n.r = Math.min(17, 6.5 + (degree[n.id]||0)*1.15));

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

  const subAngleData = computeSubAngles(terms);

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d=>d.id).distance(64).strength(0.45))
    .force('charge', d3.forceManyBody().strength(-95))
    .force('collide', d3.forceCollide(d=>d.r+8))
    .force('x', d3.forceX(d=> categories[d.category].cx*width + subOffset(d, subAngleData, width, height).ox).strength(0.075))
    .force('y', d3.forceY(d=> categories[d.category].cy*height + subOffset(d, subAngleData, width, height).oy).strength(0.075));
  // Node/link screen positions are now refreshed every animation frame inside
  // starmap.js (so the gentle drift keeps running even once the simulation
  // settles), so no d3 'tick' handler is needed here.

  window.addEventListener('resize', ()=>{
    width = window.innerWidth; height = window.innerHeight;
    starMap.resize(width, height);
    sim.force('x', d3.forceX(d=> categories[d.category].cx*width + subOffset(d, subAngleData, width, height).ox).strength(0.075));
    sim.force('y', d3.forceY(d=> categories[d.category].cy*height + subOffset(d, subAngleData, width, height).oy).strength(0.075));
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
        starMap.setCategoryVisible(key, off);
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
