import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ---------------------------------------------------------------------
   Procedural textures (no external image assets — keeps the site static
   and lightweight, and lets us tint everything per category at runtime).
--------------------------------------------------------------------- */
function makeGlowTexture(size = 128){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeDotTexture(size = 32){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeNebulaTexture(hex, size = 512){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(hex);
  const r = Math.round(col.r*255), g_ = Math.round(col.g*255), b = Math.round(col.b*255);
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0.0, `rgba(${r},${g_},${b},0.16)`);
  grad.addColorStop(0.35, `rgba(${r},${g_},${b},0.09)`);
  grad.addColorStop(0.7, `rgba(${r},${g_},${b},0.025)`);
  grad.addColorStop(1.0, `rgba(${r},${g_},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeLabelTexture(text){
  const paddingX = 16;
  const fontSize = 30;
  const font = `600 ${fontSize}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + paddingX*2;
  const h = fontSize + 22;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(5,6,13,0.95)';
  ctx.strokeText(text, w/2, h/2);
  ctx.fillStyle = '#e8ecf7';
  ctx.fillText(text, w/2, h/2);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return { texture: tex, aspect: w/h };
}

/* ---------------------------------------------------------------------
   Twinkling background starfield — one draw call via a custom shader.
--------------------------------------------------------------------- */
const starVertexShader = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpeed;
  varying float vPhase;
  varying float vSpeed;
  void main(){
    vPhase = aPhase;
    vSpeed = aSpeed;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize;
  }
`;
const starFragmentShader = `
  uniform sampler2D uTex;
  uniform float uTime;
  varying float vPhase;
  varying float vSpeed;
  void main(){
    float tw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * vSpeed + vPhase));
    vec4 tex = texture2D(uTex, gl_PointCoord);
    gl_FragColor = vec4(vec3(1.0), tex.a * tw);
  }
`;

function makeStarfield(count, spread, dotTexture){
  const positions = new Float32Array(count*3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for(let i=0;i<count;i++){
    positions[i*3+0] = (Math.random()-0.5) * spread.w;
    positions[i*3+1] = (Math.random()-0.5) * spread.h;
    positions[i*3+2] = 0;
    sizes[i] = Math.random()*2.2 + 0.6;
    phases[i] = Math.random()*Math.PI*2;
    speeds[i] = Math.random()*1.2 + 0.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: dotTexture }, uTime: { value: 0 } },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  return new THREE.Points(geo, mat);
}

/* ---------------------------------------------------------------------
   Neural links — a traveling light pulse plus a slow breathing opacity,
   so the connections between stars read as alive rather than static wires.
--------------------------------------------------------------------- */
const linkVertexShader = `
  attribute vec3 color;
  attribute float aT;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vT;
  varying float vPhase;
  void main(){
    vColor = color;
    vT = aT;
    vPhase = aPhase;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const linkFragmentShader = `
  uniform float uTime;
  varying vec3 vColor;
  varying float vT;
  varying float vPhase;
  void main(){
    float breathe = 0.65 + 0.35 * sin(uTime * 0.55 + vPhase * 6.2831853);
    float pulsePos = fract(uTime * 0.22 + vPhase);
    float d = abs(vT - pulsePos);
    d = min(d, 1.0 - d);
    float pulse = smoothstep(0.12, 0.0, d) * 2.2;
    vec3 finalColor = vColor * breathe + vColor * pulse;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

/* ---------------------------------------------------------------------
   StarMap — the public API consumed by app.js
--------------------------------------------------------------------- */
export function createStarMap({ canvas, width, height, categories }){
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-width/2, width/2, height/2, -height/2, 1, 3000);
  camera.position.z = 1000;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x05060d, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;

  // Parallax layers, farthest first
  const farGroup = new THREE.Group();   // distant starfield
  const nebulaGroup = new THREE.Group(); // category nebula clouds
  const rawGroup = new THREE.Group();    // nodes + links + labels (screen-space coords, flipped)
  rawGroup.scale.set(1, -1, 1);
  rawGroup.position.set(-width/2, height/2, 0);

  const fgRoot = new THREE.Group(); fgRoot.add(rawGroup);
  const midRoot = new THREE.Group(); midRoot.add(nebulaGroup);
  const bgRoot = new THREE.Group(); bgRoot.add(farGroup);

  scene.add(bgRoot, midRoot, fgRoot);

  const dotTex = makeDotTexture();
  const glowTex = makeGlowTexture();

  farGroup.position.z = -400;
  farGroup.add(makeStarfield(500, { w: width*2.4, h: height*2.4 }, dotTex));

  // nebula clouds behind each category cluster
  nebulaGroup.position.z = -180;
  Object.values(categories).forEach(cat=>{
    const tex = makeNebulaTexture(cat.color);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.NormalBlending, opacity: 0.9 });
    const sprite = new THREE.Sprite(mat);
    const nx = cat.cx*width - width/2;
    const ny = height/2 - cat.cy*height;
    sprite.position.set(nx, ny, 0);
    const s = Math.max(width, height) * 0.34;
    sprite.scale.set(s, s, 1);
    nebulaGroup.add(sprite);
  });

  /* ---- links (single LineSegments, per-vertex color for active/dim states) ---- */
  const linkGroup = new THREE.Group();
  rawGroup.add(linkGroup);
  let linkGeometry, linkMaterial, linkMesh;
  let linkData = []; // {a: node, b: node, baseColor: THREE.Color}

  /* ---- nodes ---- */
  const nodeGroup = new THREE.Group();
  rawGroup.add(nodeGroup);
  const nodeEntries = new Map(); // id -> {node, core, glow, ring, label}

  let nodesRef = [];
  let onNodeClickCb = null;
  let onBackgroundClickCb = null;

  function buildGraph(nodes, links){
    nodesRef = nodes;
    nodeGroup.clear();
    nodeEntries.clear();

    nodes.forEach(node=>{
      const color = new THREE.Color(categories[node.category].color);
      const glowMat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });
      const glow = new THREE.Sprite(glowMat);
      const glowSize = node.r * 4.2;
      glow.scale.set(glowSize, glowSize, 1);

      const coreMat = new THREE.SpriteMaterial({ map: dotTex, color: 0xffffff, transparent: true, depthWrite: false });
      const core = new THREE.Sprite(coreMat);
      core.scale.set(node.r*1.15, node.r*1.15, 1);

      const ringMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 });
      const ring = new THREE.Sprite(ringMat);
      ring.scale.set(node.r*2.4, node.r*2.4, 1);

      const hitMat = new THREE.SpriteMaterial({ transparent: true, opacity: 0 });
      const hitArea = new THREE.Sprite(hitMat);
      const hitSize = Math.max(node.r*4.2, 26);
      hitArea.scale.set(hitSize, hitSize, 1);

      const { texture, aspect } = makeLabelTexture(node.name);
      const labelMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 });
      const label = new THREE.Sprite(labelMat);
      const labelH = 15;
      label.scale.set(labelH*aspect, labelH, 1);
      label.position.set(0, node.r + 13, 0.3);

      const holder = new THREE.Group();
      holder.userData.id = node.id;
      holder.add(glow, core, ring, label, hitArea);
      nodeGroup.add(holder);
      nodeEntries.set(node.id, {
        node, holder, glow, core, ring, label, hitArea, glowMat, coreMat, ringMat, labelMat, baseColor: color,
        driftPhaseX: Math.random()*Math.PI*2,
        driftPhaseY: Math.random()*Math.PI*2,
        driftSpeedX: 0.14 + Math.random()*0.10,
        driftSpeedY: 0.11 + Math.random()*0.10,
        driftAmpX: 2.5 + Math.random()*3,
        driftAmpY: 2.5 + Math.random()*3
      });
    });

    linkData = [];
    links.forEach(l=>{
      const a = nodes.find(n=>n.id === (l.source.id || l.source));
      const b = nodes.find(n=>n.id === (l.target.id || l.target));
      if(a && b) linkData.push({ a, b });
    });

    const positions = new Float32Array(linkData.length*6);
    const colors = new Float32Array(linkData.length*6);
    const aT = new Float32Array(linkData.length*2);
    const aPhase = new Float32Array(linkData.length*2);
    linkData.forEach((l, i)=>{
      aT[i*2+0] = 0; aT[i*2+1] = 1;
      const ph = Math.random();
      aPhase[i*2+0] = ph; aPhase[i*2+1] = ph;
    });
    linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    linkGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    linkGeometry.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    linkGeometry.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
    linkMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: linkVertexShader,
      fragmentShader: linkFragmentShader,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    if(linkMesh) linkGroup.remove(linkMesh);
    linkMesh = new THREE.LineSegments(linkGeometry, linkMaterial);
    linkGroup.add(linkMesh);

    syncPositions(0);
    setSelection(null, new Set());
  }

  function syncPositions(t){
    const time = t || 0;
    nodeEntries.forEach(entry=>{
      const dx = Math.sin(time*entry.driftSpeedX + entry.driftPhaseX) * entry.driftAmpX;
      const dy = Math.cos(time*entry.driftSpeedY + entry.driftPhaseY) * entry.driftAmpY;
      entry.holder.position.set((entry.node.x||0)+dx, (entry.node.y||0)+dy, 0);
    });
    if(linkGeometry){
      const pos = linkGeometry.attributes.position.array;
      linkData.forEach((l, i)=>{
        const ea = nodeEntries.get(l.a.id), eb = nodeEntries.get(l.b.id);
        const ax = ea ? ea.holder.position.x : (l.a.x||0), ay = ea ? ea.holder.position.y : (l.a.y||0);
        const bx = eb ? eb.holder.position.x : (l.b.x||0), by = eb ? eb.holder.position.y : (l.b.y||0);
        pos[i*6+0] = ax; pos[i*6+1] = ay; pos[i*6+2] = 0;
        pos[i*6+3] = bx; pos[i*6+4] = by; pos[i*6+5] = 0;
      });
      linkGeometry.attributes.position.needsUpdate = true;
    }
  }

  let hiddenCategories = new Set();
  let currentSelected = null;
  let currentNeighbors = new Set();
  let currentConstellation = null; // Set of ids, or null

  function setSelection(selectedId, neighborSet){
    currentSelected = selectedId;
    currentNeighbors = neighborSet || new Set();

    const constellationActive = currentConstellation && currentConstellation.size > 0;

    nodeEntries.forEach((entry, id)=>{
      const hidden = hiddenCategories.has(entry.node.category);
      const isSelected = id === selectedId;
      const isNeighbor = currentNeighbors.has(id);
      const inConstellation = constellationActive && currentConstellation.has(id);
      entry.holder.visible = !hidden;
      const dim = constellationActive ? !inConstellation : (selectedId && !isSelected && !isNeighbor);
      entry.glowMat.opacity = hidden ? 0 : (dim ? 0.1 : 0.9);
      entry.coreMat.opacity = hidden ? 0 : (dim ? 0.12 : 1);
      entry.ringMat.opacity = (isSelected || inConstellation) ? 0.95 : 0;
      entry.labelMat.opacity = hidden ? 0 : ((isSelected || isNeighbor || inConstellation) ? 0.95 : 0);
    });

    if(linkGeometry){
      const colArr = linkGeometry.attributes.color.array;
      linkData.forEach((l, i)=>{
        const hidden = hiddenCategories.has(l.a.category) || hiddenCategories.has(l.b.category);
        let intensity;
        if(hidden) intensity = 0;
        else if(constellationActive){
          intensity = (currentConstellation.has(l.a.id) && currentConstellation.has(l.b.id)) ? 0.9 : 0.02;
        }
        else if(!selectedId) intensity = 0.22;
        else if(l.a.id === selectedId || l.b.id === selectedId) intensity = 0.9;
        else intensity = 0.03;
        const c = new THREE.Color(0x8fa2ff);
        colArr[i*6+0] = c.r*intensity; colArr[i*6+1] = c.g*intensity; colArr[i*6+2] = c.b*intensity;
        colArr[i*6+3] = c.r*intensity; colArr[i*6+4] = c.g*intensity; colArr[i*6+5] = c.b*intensity;
      });
      linkGeometry.attributes.color.needsUpdate = true;
    }
  }

  function setConstellation(ids){
    currentConstellation = ids && ids.length ? new Set(ids) : null;
    setSelection(null, new Set());
  }

  function setCategoryVisible(catId, visible){
    if(visible) hiddenCategories.delete(catId); else hiddenCategories.add(catId);
    setSelection(currentSelected, currentNeighbors);
  }

  function setHoverLabel(id, show){
    const entry = nodeEntries.get(id);
    if(!entry) return;
    if(currentSelected === id || currentNeighbors.has(id)) return; // already shown
    entry.labelMat.opacity = show ? 0.85 : 0;
  }

  /* ---- pan & zoom (screen-pixel semantics, matches the previous D3/SVG feel) ---- */
  let curW = width, curH = height;
  function applyTransform(x, y, k){
    fgRoot.scale.set(k, k, 1);
    fgRoot.position.set(x + (k-1)*curW/2, -y - (k-1)*curH/2, 0);
    const pf = 0.35; // mid parallax factor
    midRoot.scale.set(1 + (k-1)*pf, 1 + (k-1)*pf, 1);
    midRoot.position.set((x + (k-1)*curW/2)*pf, (-y - (k-1)*curH/2)*pf, 0);
    const bf = 0.12; // far parallax factor
    bgRoot.position.set((x + (k-1)*curW/2)*bf, (-y - (k-1)*curH/2)*bf, 0);
  }

  const zoomBehavior = d3.zoom().scaleExtent([0.25, 3.5]).on('zoom', ev=>{
    const { x, y, k } = ev.transform;
    applyTransform(x, y, k);
  });
  d3.select(canvas).call(zoomBehavior);

  function zoomBy(factor){
    d3.select(canvas).transition().duration(300).call(zoomBehavior.scaleBy, factor);
  }
  function zoomReset(){
    d3.select(canvas).transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
  }
  function centerOn(id){
    const entry = nodeEntries.get(id);
    if(!entry) return;
    const scale = 1.25;
    const nx = entry.node.x, ny = entry.node.y;
    const tx = curW/2 - nx*scale;
    const ty = curH/2 - ny*scale;
    d3.select(canvas).transition().duration(600).call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  /* ---- picking ---- */
  const raycaster = new THREE.Raycaster();
  raycaster.params.Sprite = { threshold: 0 };
  const pointerNDC = new THREE.Vector2();
  let pointerMoved = false;
  let downPos = null;

  function pickAt(clientX, clientY){
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const targets = [...nodeEntries.values()].filter(e=>e.holder.visible).map(e=>e.hitArea);
    const hits = raycaster.intersectObjects(targets, false);
    if(!hits.length) return null;
    const hitSprite = hits[0].object;
    for(const [id, entry] of nodeEntries){ if(entry.hitArea === hitSprite) return id; }
    return null;
  }

  let hoveredId = null;
  canvas.addEventListener('pointerdown', ev=>{ downPos = { x: ev.clientX, y: ev.clientY }; pointerMoved = false; });
  canvas.addEventListener('pointermove', ev=>{
    if(downPos && Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y) > 4) pointerMoved = true;
    if(!downPos){
      const id = pickAt(ev.clientX, ev.clientY);
      canvas.style.cursor = id ? 'pointer' : 'grab';
      if(id !== hoveredId){
        if(hoveredId) setHoverLabel(hoveredId, false);
        if(id) setHoverLabel(id, true);
        hoveredId = id;
      }
    }
  });
  canvas.addEventListener('click', ev=>{
    if(pointerMoved) return;
    const id = pickAt(ev.clientX, ev.clientY);
    if(id && onNodeClickCb) onNodeClickCb(id);
    else if(!id && onBackgroundClickCb) onBackgroundClickCb();
  });

  /* ---- birth animation ---- */
  function triggerBirth(ids){
    const start = performance.now();
    const duration = 1400;
    const targets = ids.map(id=>nodeEntries.get(id)).filter(Boolean);
    targets.forEach(t=>{ t.holder.scale.set(0.001, 0.001, 0.001); });
    function step(now){
      const t = Math.min(1, (now-start)/duration);
      const ease = t<1 ? 1 - Math.pow(2, -10*t) * Math.cos(t*12) * 0.15 - Math.pow(1-t, 3) : 1;
      const s = Math.max(0.001, ease);
      targets.forEach(tg=> tg.holder.scale.set(s, s, s));
      if(t < 1) requestAnimationFrame(step);
      else targets.forEach(tg=> tg.holder.scale.set(1,1,1));
    }
    requestAnimationFrame(step);
  }

  /* ---- postprocessing: two-layer bloom for an HDR, over-exposed space-photo feel ---- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomWide = new UnrealBloomPass(new THREE.Vector2(width, height), 0.28, 0.85, 0.38);
  const bloomTight = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.18, 0.7);
  composer.addPass(bloomWide);
  composer.addPass(bloomTight);

  const vignetteShader = {
    uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.35 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
      void main(){
        vec4 color = texture2D(tDiffuse, vUv);
        vec2 c = vUv - 0.5;
        float d = length(c) * 1.4;
        color.rgb *= smoothstep(0.9, 0.25, d) * uAmount + (1.0-uAmount);
        gl_FragColor = color;
      }`
  };
  composer.addPass(new ShaderPass(vignetteShader));

  function resize(w, h){
    curW = w; curH = h;
    camera.left = -w/2; camera.right = w/2; camera.top = h/2; camera.bottom = -h/2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloomWide.setSize(w, h);
    bloomTight.setSize(w, h);
    rawGroup.position.set(-w/2, h/2, 0);
  }

  let running = true;
  function animate(now){
    if(!running) return;
    const t = now/1000;
    for(const mat of farGroup.children.map(c=>c.material)){ if(mat.uniforms) mat.uniforms.uTime.value = t; }
    if(linkMaterial && linkMaterial.uniforms) linkMaterial.uniforms.uTime.value = t;
    syncPositions(t);
    composer.render();
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  return {
    buildGraph,
    syncPositions,
    setSelection,
    setConstellation,
    setCategoryVisible,
    setHoverLabel,
    zoomBy,
    zoomReset,
    centerOn,
    triggerBirth,
    resize,
    onNodeClick(cb){ onNodeClickCb = cb; },
    onBackgroundClick(cb){ onBackgroundClickCb = cb; },
    dispose(){ running = false; }
  };
}
