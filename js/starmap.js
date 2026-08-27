import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ---------------------------------------------------------------------
   Procedural textures (no external image assets — keeps the site static
   and lightweight, and lets us tint everything per category at runtime).
--------------------------------------------------------------------- */
function makeGlowTexture(size = 192){
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

function makeDotTexture(size = 48){
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

function makeRingTexture(size = 96){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = size * 0.10;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size*0.34, 0, Math.PI*2);
  ctx.stroke();
  try{ ctx.filter = 'blur(2px)'; ctx.stroke(); }catch(e){ /* filter unsupported, ignore */ }
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

function makeLabelTexture(text, maxAnisotropy){
  // Rendered at 4x resolution (supersampled) so the texture still has enough
  // detail to look crisp when the sprite is magnified at high zoom — a label
  // sprite scales up with the same camera zoom as everything else, and a
  // texture drawn at 1:1 display size just gets blurrier the more you zoom in.
  const SS = 4;
  const paddingX = 16;
  const fontSize = 34;
  const font = `700 ${fontSize}px 'Tajawal', Arial, sans-serif`;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + paddingX*2;
  const h = fontSize + 22;
  const c = document.createElement('canvas');
  c.width = w*SS; c.height = h*SS;
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5.7;
  ctx.strokeStyle = 'rgba(5,6,13,0.95)';
  ctx.strokeText(text, w/2, h/2);
  ctx.fillStyle = '#e8ecf7';
  ctx.fillText(text, w/2, h/2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = maxAnisotropy || 8;
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

function makeStarfield(count, radius, dotTexture){
  const positions = new Float32Array(count*3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for(let i=0;i<count;i++){
    // Distribute on a spherical shell (not a flat plane) so the backdrop
    // reads correctly from every orbit angle instead of going edge-on.
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos(2*Math.random()-1);
    const r = radius * (0.85 + Math.random()*0.15);
    positions[i*3+0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);
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
   Cosmic dust — slow-drifting tinted particles around each galaxy core,
   distinct from the twinkling starfield: bigger, colored, lazier motion.
--------------------------------------------------------------------- */
const dustVertexShader = `
  attribute vec3 color;
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpeed;
  attribute vec2 aAmp;
  uniform float uTime;
  varying vec3 vColor;
  void main(){
    vColor = color;
    vec3 p = position;
    p.x += sin(uTime*aSpeed + aPhase) * aAmp.x;
    p.y += cos(uTime*aSpeed*0.8 + aPhase*1.3) * aAmp.y;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize;
  }
`;
const dustFragmentShader = `
  uniform sampler2D uTex;
  varying vec3 vColor;
  void main(){
    vec4 tex = texture2D(uTex, gl_PointCoord);
    gl_FragColor = vec4(vColor, tex.a * 0.5);
  }
`;

function makeDust(categories, width, height, dotTexture, zForCat){
  const perCat = 22;
  const catEntries = Object.entries(categories);
  const count = catEntries.length * perCat;
  const positions = new Float32Array(count*3);
  const colors = new Float32Array(count*3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const amps = new Float32Array(count*2);
  let i = 0;
  catEntries.forEach(([catId, cat])=>{
    const col = new THREE.Color(cat.color);
    const cx = cat.cx*width - width/2;
    const cy = height/2 - cat.cy*height;
    const cz = zForCat ? zForCat(catId) : 0;
    const spread = Math.max(width, height) * 0.16;
    for(let k=0;k<perCat;k++){
      positions[i*3+0] = cx + (Math.random()-0.5)*spread*2;
      positions[i*3+1] = cy + (Math.random()-0.5)*spread*2;
      positions[i*3+2] = cz + (Math.random()-0.5)*160;
      colors[i*3+0] = col.r; colors[i*3+1] = col.g; colors[i*3+2] = col.b;
      sizes[i] = Math.random()*10 + 4;
      phases[i] = Math.random()*Math.PI*2;
      speeds[i] = Math.random()*0.06 + 0.02;
      amps[i*2+0] = Math.random()*30 + 12;
      amps[i*2+1] = Math.random()*30 + 12;
      i++;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geo.setAttribute('aAmp', new THREE.BufferAttribute(amps, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: dotTexture }, uTime: { value: 0 } },
    vertexShader: dustVertexShader,
    fragmentShader: dustFragmentShader,
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
    float breathe = 0.78 + 0.22 * sin(uTime * 0.55 + vPhase * 6.2831853);
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
// Stable, deterministic per-string hash → [0,1). Used to assign each node
// (and its category's nebula haze) a fixed depth so the galaxy looks the
// same on every reload instead of re-randomizing every visit.
function hashUnit(str){
  let h = 2166136261 >>> 0;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

export function createStarMap({ canvas, width, height, categories }){
  const catKeys = Object.keys(categories);
  // Each category gets its own depth band so galaxies stay coherent in z too,
  // not just x/y — spread across a wide range so orbiting reveals real depth.
  function categoryBandCenter(catId){
    const idx = catKeys.indexOf(catId);
    const denom = Math.max(1, catKeys.length - 1);
    return -180 + (idx/denom) * 360;
  }

  const scene = new THREE.Scene();
  const fov = 50;
  const camFar = 4000;
  const camera = new THREE.PerspectiveCamera(fov, width/height, 1, camFar);
  const D0 = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov/2)));
  camera.position.set(0, 0, D0);
  // Depth-fades node/nebula sprites (built-in Sprite fog support) so distant
  // content softens into the backdrop instead of an abrupt pop, and so
  // zooming all the way out fades to background color before hitting the
  // far clip plane rather than the galaxy vanishing outright.
  scene.fog = new THREE.Fog(0x05060d, D0 * 1.4, camFar * 0.8);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x05060d, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  // Depth-ordered layers — real depth now comes from actual camera movement,
  // so these are added straight to the scene (no more manual parallax-factor
  // group scaling keyed to a fake 2D zoom transform).
  const farGroup = new THREE.Group();   // distant starfield (spherical shell)
  const nebulaGroup = new THREE.Group(); // category nebula clouds + dust
  const rawGroup = new THREE.Group();    // nodes + links + labels (screen-space coords, flipped)
  rawGroup.scale.set(1, -1, 1);
  rawGroup.position.set(-width/2, height/2, 0);

  scene.add(farGroup, nebulaGroup, rawGroup);

  const dotTex = makeDotTexture();
  const glowTex = makeGlowTexture();
  const ringTex = makeRingTexture();

  const starfield = makeStarfield(500, 2400, dotTex);
  farGroup.add(starfield);

  // nebula clouds behind each category cluster — z-jittered around that
  // category's own node depth band so the haze stays visually coherent with
  // its cluster as the camera orbits, instead of collapsing to a line edge-on.
  Object.entries(categories).forEach(([catId, cat])=>{
    const tex = makeNebulaTexture(cat.color);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.NormalBlending, opacity: 0.9 });
    const sprite = new THREE.Sprite(mat);
    const nx = cat.cx*width - width/2;
    const ny = height/2 - cat.cy*height;
    const nz = categoryBandCenter(catId) - 60 + (hashUnit(catId)-0.5)*160;
    sprite.position.set(nx, ny, nz);
    const s = Math.max(width, height) * 0.34;
    sprite.scale.set(s, s, 1);
    nebulaGroup.add(sprite);
  });
  const dustPoints = makeDust(categories, width, height, dotTex, catId=>categoryBandCenter(catId) - 60);
  nebulaGroup.add(dustPoints);

  /* ---- links (single LineSegments, per-vertex color for active/dim states) ---- */
  const linkGroup = new THREE.Group();
  rawGroup.add(linkGroup);
  let linkGeometry, linkMaterial, linkMesh;
  let linkData = []; // {a: node, b: node}
  let linkBaseColorArr = new Float32Array(0);
  let hoveredLinkIndex = -1;

  /* ---- nodes ---- */
  const nodeGroup = new THREE.Group();
  rawGroup.add(nodeGroup);
  const nodeEntries = new Map(); // id -> {node, core, glow, ring, label, ...}

  let nodesRef = [];
  let onNodeClickCb = null;
  let onBackgroundClickCb = null;
  let onNodeHoverCb = null;

  function buildGraph(nodes, links){
    nodesRef = nodes;
    nodeGroup.clear();
    nodeEntries.clear();

    nodes.forEach(node=>{
      const color = new THREE.Color(categories[node.category].color);
      const glowSize = node.r * 4.2;
      const glowMat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, sizeAttenuation: true });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(glowSize, glowSize, 1);

      const coreSize = node.r*1.15;
      const coreMat = new THREE.SpriteMaterial({ map: dotTex, color: 0xffffff, transparent: true, depthWrite: false, sizeAttenuation: true });
      const core = new THREE.Sprite(coreMat);
      core.scale.set(coreSize, coreSize, 1);

      const ringMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, sizeAttenuation: true });
      const ring = new THREE.Sprite(ringMat);
      ring.scale.set(node.r*2.4, node.r*2.4, 1);

      const visitedMat = new THREE.SpriteMaterial({ map: ringTex, color: 0xffd76a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true });
      const visitedRing = new THREE.Sprite(visitedMat);
      visitedRing.scale.set(node.r*2.05, node.r*2.05, 1);

      const hitMat = new THREE.SpriteMaterial({ transparent: true, opacity: 0, sizeAttenuation: true });
      const hitArea = new THREE.Sprite(hitMat);
      const hitSize = Math.max(node.r*4.2, 26);
      hitArea.scale.set(hitSize, hitSize, 1);

      // Labels keep a constant screen-space size regardless of camera distance.
      // sizeAttenuation stays true (same real-perspective-shrink path as every
      // other sprite here — its "false" branch multiplies scale by raw view-
      // space distance, which needs a scale value calibrated for that specific
      // formula, not a world-unit size like ours); instead syncPositions scales
      // each label's world size by (distanceToCamera / D0) every frame, which
      // exactly cancels the natural perspective shrink and nets a constant
      // apparent size, with legibility at extreme distance still governed by
      // the existing opacity dimming.
      const { texture, aspect } = makeLabelTexture(node.name, maxAnisotropy);
      const labelMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0, sizeAttenuation: true });
      const label = new THREE.Sprite(labelMat);
      const labelH = 15;
      const labelScaleX = labelH*aspect, labelScaleY = labelH;
      label.scale.set(labelScaleX, labelScaleY, 1);
      const labelBaseY = node.r + 13;
      label.position.set(0, labelBaseY, 0.3);

      const holder = new THREE.Group();
      holder.userData.id = node.id;
      holder.add(glow, core, ring, visitedRing, label, hitArea);
      nodeGroup.add(holder);
      // Stable per-node depth, banded by category so each galaxy stays
      // coherent in z too — computed once here, never re-randomized per frame.
      const z = categoryBandCenter(node.category) + (hashUnit(node.id)-0.5)*90;
      nodeEntries.set(node.id, {
        node, holder, glow, core, ring, visitedRing, label, hitArea, z,
        glowMat, coreMat, ringMat, visitedMat, labelMat, baseColor: color,
        glowSize, coreSize, hitSize,
        // Wider, slightly slower drift than before so stars read as freely
        // floating rather than statically pinned in place — links (redrawn
        // live from actual positions every frame) follow along naturally.
        driftPhaseX: Math.random()*Math.PI*2,
        driftPhaseY: Math.random()*Math.PI*2,
        driftSpeedX: 0.10 + Math.random()*0.08,
        driftSpeedY: 0.08 + Math.random()*0.08,
        driftAmpX: 7 + Math.random()*7,
        driftAmpY: 7 + Math.random()*7,
        breathePhase: Math.random()*Math.PI*2,
        breatheSpeed: 0.35 + Math.random()*0.25,
        labelBaseY,
        labelScaleX, labelScaleY
      });
    });

    linkData = [];
    links.forEach(l=>{
      const a = nodes.find(n=>n.id === (l.source.id || l.source));
      const b = nodes.find(n=>n.id === (l.target.id || l.target));
      if(a && b) linkData.push({ a, b });
    });

    // Links are rendered as thin quads (2 triangles / 6 verts each) rather than
    // GL_LINES: hairlines stay a fixed ~1px regardless of zoom, so at higher
    // zoom levels they get lost against the now much-larger, bloom-saturated
    // star glows. A quad with real world-space width scales with zoom like
    // everything else, so links stay (and get more) visible as you zoom in.
    const VPL = 6;
    const positions = new Float32Array(linkData.length*VPL*3);
    const colors = new Float32Array(linkData.length*VPL*3);
    const aT = new Float32Array(linkData.length*VPL);
    const aPhase = new Float32Array(linkData.length*VPL);
    linkData.forEach((l, i)=>{
      const ph = Math.random();
      for(let k=0;k<VPL;k++) aPhase[i*VPL+k] = ph;
      aT[i*VPL+0]=0; aT[i*VPL+1]=0; aT[i*VPL+2]=1;
      aT[i*VPL+3]=0; aT[i*VPL+4]=1; aT[i*VPL+5]=1;
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
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    if(linkMesh) linkGroup.remove(linkMesh);
    linkMesh = new THREE.Mesh(linkGeometry, linkMaterial);
    // Vertex positions are rewritten every frame (drift) after the geometry's
    // bounding sphere was computed from the initial all-zero layout, so the
    // stale sphere no longer matches reality; without this, THREE silently
    // frustum-culls the whole link mesh once the camera zooms/pans away from
    // world origin, which read as "all the links vanish when I zoom in".
    linkMesh.frustumCulled = false;
    linkGroup.add(linkMesh);
    linkBaseColorArr = new Float32Array(linkData.length*VPL*3);
    hoveredLinkIndex = -1;

    syncPositions(0);
    setSelection(null, new Set());
  }

  const LINK_HALF_WIDTH = 1.3;
  // Never let a star's glow/core/hit-area shrink below this fraction of its
  // apparent size at the default camera distance (D0), no matter how far
  // the camera dollies out.
  const GLOW_FLOOR = 0.4;
  const _camWorld = new THREE.Vector3();
  const _camLocal = new THREE.Vector3();
  const _linkA = new THREE.Vector3();
  const _linkB = new THREE.Vector3();
  const _linkDir = new THREE.Vector3();
  const _linkMid = new THREE.Vector3();
  const _linkView = new THREE.Vector3();
  const _linkPerp = new THREE.Vector3();

  function syncPositions(t){
    const time = t || 0;
    // Camera position expressed in rawGroup-local space (same space node/link
    // positions live in) — computed once per frame, reused below both for
    // label distance-compensation and for link camera-facing ribbons.
    camera.getWorldPosition(_camWorld);
    rawGroup.worldToLocal(_camLocal.copy(_camWorld));
    nodeEntries.forEach(entry=>{
      const dx = Math.sin(time*entry.driftSpeedX + entry.driftPhaseX) * entry.driftAmpX;
      const dy = Math.cos(time*entry.driftSpeedY + entry.driftPhaseY) * entry.driftAmpY;
      entry.holder.position.set((entry.node.x||0)+dx, (entry.node.y||0)+dy, entry.z);
      const breathe = 1 + 0.035 * Math.sin(time*entry.breatheSpeed + entry.breathePhase);
      const distToCam = entry.holder.position.distanceTo(_camLocal);
      // Real perspective shrink (sizeAttenuation) is a good depth cue up
      // close, but taken all the way out at max dolly distance it shrinks
      // stars into near-invisible specks while the link ribbons (constant
      // world-space width, unaffected by distance) stay full-strength —
      // flipping the scene into a mesh of crossing lines with no visible
      // stars. boost only kicks in once natural shrink would go below the
      // floor, and exactly cancels it from there — normal close-up
      // attenuation is untouched.
      const boost = Math.max(1, GLOW_FLOOR * distToCam / D0);
      entry.glow.scale.set(entry.glowSize*breathe*boost, entry.glowSize*breathe*boost, 1);
      entry.core.scale.set(entry.coreSize*breathe*boost, entry.coreSize*breathe*boost, 1);
      entry.hitArea.scale.set(entry.hitSize*boost, entry.hitSize*boost, 1);
      // Counteract real perspective shrink so the label reads at a constant
      // apparent size regardless of dolly distance (see comment at creation).
      const labelScale = distToCam / D0;
      entry.label.scale.set(entry.labelScaleX*labelScale, entry.labelScaleY*labelScale, 1);
    });
    // Gentle pulsing halo on the selected node only — cheap since it's a
    // single O(1) lookup rather than a per-node check in the loop above.
    if(currentSelected){
      const sel = nodeEntries.get(currentSelected);
      if(sel){
        const pulse = 1 + 0.12 * Math.sin(time * 1.6);
        const ringBase = sel.node.r * 2.4;
        sel.ring.scale.set(ringBase*pulse, ringBase*pulse, 1);
      }
    }
    if(linkGeometry){
      const pos = linkGeometry.attributes.position.array;
      linkData.forEach((l, i)=>{
        const ea = nodeEntries.get(l.a.id), eb = nodeEntries.get(l.b.id);
        _linkA.set(ea ? ea.holder.position.x : (l.a.x||0), ea ? ea.holder.position.y : (l.a.y||0), ea ? ea.holder.position.z : 0);
        _linkB.set(eb ? eb.holder.position.x : (l.b.x||0), eb ? eb.holder.position.y : (l.b.y||0), eb ? eb.holder.position.z : 0);
        _linkDir.subVectors(_linkB, _linkA);
        if(_linkDir.lengthSq() < 1e-6) _linkDir.set(1,0,0); else _linkDir.normalize();
        _linkMid.addVectors(_linkA, _linkB).multiplyScalar(0.5);
        _linkView.subVectors(_camLocal, _linkMid);
        if(_linkView.lengthSq() < 1e-6) _linkView.copy(_linkDir); else _linkView.normalize();
        _linkPerp.crossVectors(_linkDir, _linkView);
        if(_linkPerp.lengthSq() < 1e-6) _linkPerp.crossVectors(_linkDir, new THREE.Vector3(0,1,0));
        _linkPerp.normalize().multiplyScalar(LINK_HALF_WIDTH);
        const o = i*18;
        pos[o+0]=_linkA.x+_linkPerp.x; pos[o+1]=_linkA.y+_linkPerp.y; pos[o+2]=_linkA.z+_linkPerp.z;
        pos[o+3]=_linkA.x-_linkPerp.x; pos[o+4]=_linkA.y-_linkPerp.y; pos[o+5]=_linkA.z-_linkPerp.z;
        pos[o+6]=_linkB.x+_linkPerp.x; pos[o+7]=_linkB.y+_linkPerp.y; pos[o+8]=_linkB.z+_linkPerp.z;
        pos[o+9]=_linkA.x-_linkPerp.x; pos[o+10]=_linkA.y-_linkPerp.y; pos[o+11]=_linkA.z-_linkPerp.z;
        pos[o+12]=_linkB.x-_linkPerp.x; pos[o+13]=_linkB.y-_linkPerp.y; pos[o+14]=_linkB.z-_linkPerp.z;
        pos[o+15]=_linkB.x+_linkPerp.x; pos[o+16]=_linkB.y+_linkPerp.y; pos[o+17]=_linkB.z+_linkPerp.z;
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

    const focused = constellationActive || !!selectedId;

    nodeEntries.forEach((entry, id)=>{
      const hidden = hiddenCategories.has(entry.node.category);
      const isSelected = id === selectedId;
      const isNeighbor = currentNeighbors.has(id);
      const inConstellation = constellationActive && currentConstellation.has(id);
      const emphasized = isSelected || isNeighbor || inConstellation;
      entry.holder.visible = !hidden;
      const dim = constellationActive ? !inConstellation : (selectedId && !isSelected && !isNeighbor);
      entry.glowMat.opacity = hidden ? 0 : (dim ? 0.1 : 0.9);
      entry.coreMat.opacity = hidden ? 0 : (dim ? 0.12 : 1);
      entry.ringMat.opacity = (isSelected || inConstellation) ? 0.95 : 0;
      entry.labelMat.opacity = hidden ? 0 : (emphasized ? 1.0 : (focused ? 0.22 : 0.75));
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
        else if(!selectedId) intensity = 0.34;
        else if(l.a.id === selectedId || l.b.id === selectedId) intensity = 0.9;
        else intensity = 0.04;
        const c = new THREE.Color(0x8fa2ff);
        const r = c.r*intensity, g = c.g*intensity, b = c.b*intensity;
        const o = i*18;
        for(let k=0;k<6;k++){
          colArr[o+k*3+0] = r; colArr[o+k*3+1] = g; colArr[o+k*3+2] = b;
          linkBaseColorArr[o+k*3+0] = r; linkBaseColorArr[o+k*3+1] = g; linkBaseColorArr[o+k*3+2] = b;
        }
      });
      linkGeometry.attributes.color.needsUpdate = true;
      if(hoveredLinkIndex >= 0) setLinkHover(hoveredLinkIndex, true);
    }
  }

  function setLinkHover(idx, hovering){
    if(idx == null || idx < 0 || !linkGeometry || idx >= linkData.length) return;
    const colArr = linkGeometry.attributes.color.array;
    const o = idx*18;
    if(hovering){
      for(let k=0;k<18;k++) colArr[o+k] = Math.min(1.4, linkBaseColorArr[o+k]*2.4 + 0.12);
    } else {
      for(let k=0;k<18;k++) colArr[o+k] = linkBaseColorArr[o+k];
    }
    linkGeometry.attributes.color.needsUpdate = true;
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
    const constellationActive = currentConstellation && currentConstellation.size > 0;
    if(currentSelected === id || currentNeighbors.has(id) || (constellationActive && currentConstellation.has(id))) return; // already emphasized
    if(show){ entry.labelMat.opacity = 1.0; return; }
    const focused = constellationActive || !!currentSelected;
    entry.labelMat.opacity = focused ? 0.22 : 0.75;
  }

  function setVisited(idArray){
    const set = new Set(idArray || []);
    nodeEntries.forEach((entry, id)=>{
      entry.visitedMat.opacity = set.has(id) ? 0.6 : 0;
    });
  }

  /* ---- camera controls: real 3D orbit (rotate/dolly/pan via OrbitControls) ---- */
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = Math.PI * 0.15; // keep the galaxy from flipping upside-down
  controls.maxPolarAngle = Math.PI * 0.85;
  controls.minDistance = D0 / 3.5; // mirrors the old d3-zoom scaleExtent([0.25,3.5])
  // Capped below camera.far (with margin for content up to ~400 units off
  // origin) so dollying all the way out fades into the fog instead of the
  // whole galaxy clipping through the far plane and vanishing.
  controls.maxDistance = Math.min(D0 * 4, camFar - 600);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6; // gentle ambient drift, not a spin
  controls.update();

  // Auto-rotation pauses the instant the user takes the camera (drag, wheel,
  // touch — OrbitControls' own 'start'/'end' events cover all input modes)
  // and resumes on its own a couple of seconds after they let go, so the
  // galaxy is always either responding to the visitor or drifting on its own.
  let autoRotateResumeTimer = null;
  const AUTO_ROTATE_RESUME_MS = 2500;
  controls.addEventListener('start', ()=>{
    controls.autoRotate = false;
    if(autoRotateResumeTimer) clearTimeout(autoRotateResumeTimer);
  });
  controls.addEventListener('end', ()=>{
    if(autoRotateResumeTimer) clearTimeout(autoRotateResumeTimer);
    autoRotateResumeTimer = setTimeout(()=>{ controls.autoRotate = true; }, AUTO_ROTATE_RESUME_MS);
  });

  // Small manual RAF tween for programmatic camera moves (zoomBy/zoomReset/
  // centerOn) — disables user input for the duration so a drag can't fight
  // it, and reuses the already-loaded d3.easeCubicOut to match the feel of
  // the old d3-zoom transitions.
  let cameraTween = null;
  function tweenCamera(toPos, toTarget, duration){
    controls.enabled = false;
    controls.autoRotate = false;
    if(autoRotateResumeTimer) clearTimeout(autoRotateResumeTimer);
    cameraTween = {
      fromPos: camera.position.clone(), toPos,
      fromTarget: controls.target.clone(), toTarget,
      start: performance.now(), duration
    };
  }
  function stepCameraTween(now){
    if(!cameraTween) return;
    const { fromPos, toPos, fromTarget, toTarget, start, duration } = cameraTween;
    const raw = Math.min(1, (now-start)/duration);
    const e = d3.easeCubicOut(raw);
    camera.position.lerpVectors(fromPos, toPos, e);
    controls.target.lerpVectors(fromTarget, toTarget, e);
    if(raw >= 1){
      cameraTween = null;
      controls.enabled = true;
      if(autoRotateResumeTimer) clearTimeout(autoRotateResumeTimer);
      autoRotateResumeTimer = setTimeout(()=>{ controls.autoRotate = true; }, AUTO_ROTATE_RESUME_MS);
    }
  }

  function zoomBy(factor){
    const dist = camera.position.distanceTo(controls.target);
    const newDist = THREE.MathUtils.clamp(dist/factor, controls.minDistance, controls.maxDistance);
    const dir = camera.position.clone().sub(controls.target).normalize();
    tweenCamera(controls.target.clone().addScaledVector(dir, newDist), controls.target.clone(), 300);
  }
  function zoomReset(){
    tweenCamera(new THREE.Vector3(0, 0, D0), new THREE.Vector3(0, 0, 0), 500);
  }
  function centerOn(id){
    const entry = nodeEntries.get(id);
    if(!entry) return;
    const targetPos = entry.holder.getWorldPosition(new THREE.Vector3());
    const dir = camera.position.clone().sub(controls.target).normalize();
    const standoff = D0 / 1.25;
    tweenCamera(targetPos.clone().addScaledVector(dir, standoff), targetPos, 750);
  }

  /* ---- picking (nodes take priority over links) ----
     Node hit-testing uses THREE's raycaster against real sprites (accounts for
     zoom automatically via matrixWorld). Link hit-testing is done manually in
     screen space (project each endpoint, then point-to-segment distance) —
     THREE's built-in Line raycast threshold turned out to need an unpredictably
     large, hard-to-calibrate value in this orthographic/nested-transform setup,
     so a direct screen-pixel distance test is used instead for a reliable,
     tunable hit radius. */
  const raycaster = new THREE.Raycaster();
  raycaster.params.Sprite = { threshold: 0 };
  const pointerNDC = new THREE.Vector2();
  let pointerMoved = false;
  let downPos = null;
  const _projVec = new THREE.Vector3();
  const LINK_HIT_PX = 9;

  function projectToScreen(entry, rect){
    entry.holder.getWorldPosition(_projVec);
    _projVec.project(camera);
    return {
      x: rect.left + (_projVec.x*0.5+0.5) * rect.width,
      y: rect.top + (1 - (_projVec.y*0.5+0.5)) * rect.height
    };
  }

  function distToSegment(px, py, ax, ay, bx, by){
    const dx = bx-ax, dy = by-ay;
    const lenSq = dx*dx + dy*dy;
    let t = lenSq > 0 ? ((px-ax)*dx + (py-ay)*dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t*dx, cy = ay + t*dy;
    return Math.hypot(px-cx, py-cy);
  }

  function pickLinkAt(clientX, clientY, rect){
    let bestIdx = -1, bestDist = LINK_HIT_PX;
    linkData.forEach((l, i)=>{
      const ea = nodeEntries.get(l.a.id), eb = nodeEntries.get(l.b.id);
      if(!ea || !eb || !ea.holder.visible || !eb.holder.visible) return;
      const pa = projectToScreen(ea, rect), pb = projectToScreen(eb, rect);
      const d = distToSegment(clientX, clientY, pa.x, pa.y, pb.x, pb.y);
      if(d < bestDist){ bestDist = d; bestIdx = i; }
    });
    return bestIdx;
  }

  function pickAt(clientX, clientY){
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);

    const nodeTargets = [...nodeEntries.values()].filter(e=>e.holder.visible).map(e=>e.hitArea);
    const nodeHits = raycaster.intersectObjects(nodeTargets, false);
    if(nodeHits.length){
      const hitSprite = nodeHits[0].object;
      for(const [id, entry] of nodeEntries){ if(entry.hitArea === hitSprite) return { type:'node', id }; }
    }
    const linkIdx = pickLinkAt(clientX, clientY, rect);
    if(linkIdx >= 0) return { type:'link', index: linkIdx };
    return null;
  }

  // Right-click drives OrbitControls' pan, so the browser's own context menu
  // popping up would interrupt that gesture — suppress it on the canvas.
  canvas.addEventListener('contextmenu', ev=> ev.preventDefault());

  let hoveredId = null;
  canvas.addEventListener('pointerdown', ev=>{
    downPos = { x: ev.clientX, y: ev.clientY };
    pointerMoved = false;
    canvas.style.cursor = 'grabbing';
  });
  // Without this, downPos never cleared after the first press, so the
  // pointermove hover branch below (guarded by `if(!downPos)`) would never
  // run again for the rest of the session — hover/cursor/link-highlight all
  // silently stopped working after one click.
  canvas.addEventListener('pointerup', ()=>{
    downPos = null;
    canvas.style.cursor = 'grab';
  });
  canvas.addEventListener('pointermove', ev=>{
    if(downPos && Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y) > 4) pointerMoved = true;
    if(!downPos){
      const hit = pickAt(ev.clientX, ev.clientY);
      const nodeId = hit && hit.type==='node' ? hit.id : null;
      const linkIdx = hit && hit.type==='link' ? hit.index : -1;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      if(nodeId !== hoveredId){
        if(hoveredId) setHoverLabel(hoveredId, false);
        if(nodeId) setHoverLabel(nodeId, true);
        hoveredId = nodeId;
        if(onNodeHoverCb) onNodeHoverCb(nodeId, ev.clientX, ev.clientY);
      } else if(nodeId && onNodeHoverCb){
        onNodeHoverCb(nodeId, ev.clientX, ev.clientY);
      }
      if(linkIdx !== hoveredLinkIndex){
        if(hoveredLinkIndex >= 0) setLinkHover(hoveredLinkIndex, false);
        if(linkIdx >= 0) setLinkHover(linkIdx, true);
        hoveredLinkIndex = linkIdx;
      }
    }
  });
  canvas.addEventListener('pointerleave', ()=>{
    if(hoveredId){ setHoverLabel(hoveredId, false); hoveredId = null; if(onNodeHoverCb) onNodeHoverCb(null); }
    if(hoveredLinkIndex >= 0){ setLinkHover(hoveredLinkIndex, false); hoveredLinkIndex = -1; }
  });
  canvas.addEventListener('click', ev=>{
    if(pointerMoved) return;
    const hit = pickAt(ev.clientX, ev.clientY);
    if(hit && hit.type === 'node'){
      if(onNodeClickCb) onNodeClickCb(hit.id);
    } else if(hit && hit.type === 'link'){
      const l = linkData[hit.index];
      let targetId = l.b.id;
      if(currentSelected === l.b.id) targetId = l.a.id;
      else if(currentSelected === l.a.id) targetId = l.b.id;
      if(onNodeClickCb) onNodeClickCb(targetId);
    } else if(onBackgroundClickCb) onBackgroundClickCb();
  });

  /* ---- birth animation: elastic pop-in + an expanding, fading light-flash ring ---- */
  function triggerBirth(ids){
    const start = performance.now();
    const duration = 1400;
    const targets = ids.map(id=>nodeEntries.get(id)).filter(Boolean);
    targets.forEach(t=>{
      t.holder.scale.set(0.001, 0.001, 0.001);
      const flashMat = new THREE.SpriteMaterial({ map: glowTex, color: t.baseColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 });
      const flash = new THREE.Sprite(flashMat);
      flash.scale.set(t.node.r*2, t.node.r*2, 1);
      flash.position.set(0, 0, 0.5);
      t.holder.add(flash);
      t._flash = { sprite: flash, mat: flashMat };
    });
    function step(now){
      const t = Math.min(1, (now-start)/duration);
      const ease = t<1 ? 1 - Math.pow(2, -10*t) * Math.cos(t*12) * 0.15 - Math.pow(1-t, 3) : 1;
      const s = Math.max(0.001, ease);
      targets.forEach(tg=>{
        tg.holder.scale.set(s, s, s);
        if(tg._flash){
          const fScale = 1 + t*5;
          tg._flash.sprite.scale.set(tg.node.r*2*fScale, tg.node.r*2*fScale, 1);
          tg._flash.mat.opacity = Math.max(0, 1 - t*1.15);
        }
      });
      if(t < 1) requestAnimationFrame(step);
      else targets.forEach(tg=>{
        tg.holder.scale.set(1,1,1);
        if(tg._flash){ tg.holder.remove(tg._flash.sprite); tg._flash.mat.dispose(); tg._flash = null; }
      });
    }
    requestAnimationFrame(step);
  }

  /* ---- postprocessing: dual bloom + color grade + cinematic focus blur + vignette ---- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomWide = new UnrealBloomPass(new THREE.Vector2(width, height), 0.18, 0.6, 0.45);
  const bloomTight = new UnrealBloomPass(new THREE.Vector2(width, height), 0.4, 0.15, 0.78);
  composer.addPass(bloomWide);
  composer.addPass(bloomTight);

  const gradeShader = {
    uniforms: { tDiffuse: { value: null }, uContrast: { value: 1.06 }, uSaturation: { value: 1.1 }, uLift: { value: 0.01 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uContrast; uniform float uSaturation; uniform float uLift;
      varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb + uLift;
        col = (col - 0.5) * uContrast + 0.5;
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, uSaturation);
        gl_FragColor = vec4(max(col, 0.0), c.a);
      }`
  };
  composer.addPass(new ShaderPass(gradeShader));

  const dofShader = {
    uniforms: { tDiffuse: { value: null }, uFocus: { value: new THREE.Vector2(0.5, 0.5) }, uAmount: { value: 0 }, uAspect: { value: width/height } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 uFocus; uniform float uAmount; uniform float uAspect;
      varying vec2 vUv;
      void main(){
        vec2 d = vUv - uFocus;
        d.x *= uAspect;
        float dist = length(d);
        float blurAmt = clamp(dist*1.8, 0.0, 1.0) * uAmount;
        float r2 = blurAmt * 0.007;
        float r1 = r2 * 0.5;
        vec4 sum = texture2D(tDiffuse, vUv) * 0.28;
        sum += texture2D(tDiffuse, vUv + vec2(r1,0.0)) * 0.09;
        sum += texture2D(tDiffuse, vUv - vec2(r1,0.0)) * 0.09;
        sum += texture2D(tDiffuse, vUv + vec2(0.0,r1)) * 0.09;
        sum += texture2D(tDiffuse, vUv - vec2(0.0,r1)) * 0.09;
        sum += texture2D(tDiffuse, vUv + vec2(r2,r2)) * 0.09;
        sum += texture2D(tDiffuse, vUv - vec2(r2,r2)) * 0.09;
        sum += texture2D(tDiffuse, vUv + vec2(r2,-r2)) * 0.09;
        sum += texture2D(tDiffuse, vUv - vec2(r2,-r2)) * 0.09;
        gl_FragColor = sum;
      }`
  };
  const dofPass = new ShaderPass(dofShader);
  composer.addPass(dofPass);

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
    // Current orbit/zoom state (camera.position/controls.target) is left
    // untouched here on purpose — matches the old behavior of preserving the
    // user's current zoom/pan transform across a window resize.
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloomWide.setSize(w, h);
    bloomTight.setSize(w, h);
    dofPass.uniforms.uAspect.value = w/h;
    rawGroup.position.set(-w/2, h/2, 0);
  }

  let running = true;
  let dofAmount = 0;
  const _focusWorldPos = new THREE.Vector3();
  function updateFocus(){
    const targetAmount = currentSelected ? 0.4 : 0;
    dofAmount += (targetAmount - dofAmount) * 0.08;
    dofPass.uniforms.uAmount.value = dofAmount;
    if(currentSelected){
      const entry = nodeEntries.get(currentSelected);
      if(entry){
        entry.holder.getWorldPosition(_focusWorldPos);
        _focusWorldPos.project(camera);
        dofPass.uniforms.uFocus.value.set(_focusWorldPos.x*0.5+0.5, _focusWorldPos.y*0.5+0.5);
      }
    }
  }

  function animate(now){
    if(!running) return;
    const t = now/1000;
    if(starfield.material.uniforms) starfield.material.uniforms.uTime.value = t;
    if(dustPoints.material.uniforms) dustPoints.material.uniforms.uTime.value = t;
    if(linkMaterial && linkMaterial.uniforms) linkMaterial.uniforms.uTime.value = t;
    stepCameraTween(now);
    controls.update();
    camera.updateMatrixWorld();
    // Labels are a fixed child offset of their star's holder (see buildGraph)
    // rather than independently repositioned to dodge overlaps — the star
    // itself is what moves (via the force layout's collision spacing, sized
    // to cover the label too) so text never has to jump around on its own.
    syncPositions(t);
    updateFocus();
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
    setVisited,
    zoomBy,
    zoomReset,
    centerOn,
    triggerBirth,
    resize,
    onNodeClick(cb){ onNodeClickCb = cb; },
    onBackgroundClick(cb){ onBackgroundClickCb = cb; },
    onNodeHover(cb){ onNodeHoverCb = cb; },
    dispose(){ running = false; controls.dispose(); if(autoRotateResumeTimer) clearTimeout(autoRotateResumeTimer); }
  };
}
