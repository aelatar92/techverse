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
    newBadge: 'جديد',
    notFoundTitle: 'المصطلح غير موجود',
    notFoundBody: name => `مفيش نجمة بالاسم "${name}" في الكون حاليًا.`,
    suggestions: 'أقرب المصطلحات:',
    close: 'إغلاق',
    coffee: 'ادعم المشروع'
  },
  en: {
    dir: 'ltr',
    title: 'TechVerse',
    subtitle: 'Networking · Linux · Systems · Cybersecurity · Surveillance',
    searchPlaceholder: 'Search for a term…',
    hint: 'Click any star to view its explanation, and navigate between related terms via the neural links connecting them.',
    related: 'Related Neural Links',
    langToggle: 'العربية',
    newBadge: 'NEW',
    notFoundTitle: 'Term not found',
    notFoundBody: name => `No star named "${name}" exists in the universe yet.`,
    suggestions: 'Closest matches:',
    close: 'Close',
    coffee: 'Support the project'
  }
};
let lang = 'ar';

/* ============================ Data loading ============================ */
async function loadData(){
  const [categories, terms] = await Promise.all([
    fetch('data/categories.json').then(r=>r.json()),
    fetch('data/terms.json').then(r=>r.json())
  ]);
  return {categories, terms};
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
}

/* ============================ Main ============================ */
(async function main(){
  const {categories, terms} = await loadData();
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

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d=>d.id).distance(64).strength(0.45))
    .force('charge', d3.forceManyBody().strength(-95))
    .force('collide', d3.forceCollide(d=>d.r+8))
    .force('x', d3.forceX(d=> categories[d.category].cx*width).strength(0.075))
    .force('y', d3.forceY(d=> categories[d.category].cy*height).strength(0.075))
    .on('tick', ()=> starMap.syncPositions());

  window.addEventListener('resize', ()=>{
    width = window.innerWidth; height = window.innerHeight;
    starMap.resize(width, height);
    sim.force('x', d3.forceX(d=> categories[d.category].cx*width).strength(0.075));
    sim.force('y', d3.forceY(d=> categories[d.category].cy*height).strength(0.075));
    sim.alpha(0.3).restart();
  });

  // Let the layout settle for a moment, then reveal the founding batch with a birth effect.
  setTimeout(()=>{
    const newIds = nodes.filter(n=>isRecent(n.date_added)).map(n=>n.id);
    if(newIds.length) starMap.triggerBirth(newIds);
  }, 900);

  /* ---- interaction ---- */
  let selectedId = null;
  const neighborMap = {};
  nodes.forEach(n=> neighborMap[n.id] = new Set());
  links.forEach(l=>{
    neighborMap[l.source.id||l.source].add(l.target.id||l.target);
    neighborMap[l.target.id||l.target].add(l.source.id||l.source);
  });

  function selectNode(id){
    selectedId = id;
    starMap.setSelection(id, neighborMap[id]);
    openPanel(idIndex.get(id));
    starMap.centerOn(id);
    hideNotFound();
  }

  function openPanel(term){
    const cat = categories[term.category];
    const badge = d3.select('#panelBadge');
    badge.selectAll('*').remove();
    badge.style('background', cat.color+'22').style('color', cat.color).style('border','1px solid '+cat.color+'55')
      .text(lang==='ar' ? cat.label_ar : cat.label_en);
    const existingBadge = document.querySelector('.newBadge');
    if(existingBadge) existingBadge.remove();
    if(isRecent(term.date_added)){
      badge.node().insertAdjacentHTML('afterend', `<span class="newBadge">★ ${i18n[lang].newBadge}</span>`);
    }
    d3.select('#panelName').text(term.name).style('color', cat.color);
    d3.select('#panelDefs').html('');
    const defsWrap = d3.select('#panelDefs');
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
      relList.append('div').attr('class','relChip')
        .style('border-color', categories[r.category].color+'55')
        .text(r.name)
        .on('click', ()=> selectNode(rid));
    });
    d3.select('#panel').classed('open', true);
  }

  function closePanel(){
    d3.select('#panel').classed('open', false);
    selectedId = null;
    starMap.setSelection(null, new Set());
  }
  d3.select('#closePanel').on('click', closePanel);
  starMap.onNodeClick(id => selectNode(id));
  starMap.onBackgroundClick(()=>{ if(selectedId) closePanel(); hideNotFound(); });

  /* ---- legend ---- */
  const legendSel = d3.select('#legend');
  function renderLegend(){
    legendSel.html('');
    Object.entries(categories).forEach(([key,c])=>{
      const chip = legendSel.append('div').attr('class','chip').attr('data-cat',key);
      chip.append('div').attr('class','dot').style('background', c.color);
      chip.append('span').text(lang==='ar' ? c.label_ar : c.label_en);
      chip.on('click', function(){
        const off = chip.classed('off');
        chip.classed('off', !off);
        starMap.setCategoryVisible(key, off);
      });
    });
  }
  renderLegend();

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
    d3.select('#coffeeLink').text('☕ ' + t.coffee);
    renderLegend();
    if(selectedId) openPanel(idIndex.get(selectedId));
  }
  d3.select('#langToggle').on('click', ()=>{
    lang = lang === 'ar' ? 'en' : 'ar';
    applyLangChrome();
  });
  applyLangChrome();
})();
