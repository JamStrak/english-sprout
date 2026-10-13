import {PLANTS} from './garden.js';
import {gardenToolArt, plantDrawing} from './garden-art.js';

const WORLD = 3000;
const cameras = {x: 1500, y: 1500, zoom: .9, selected: null, focused: null, initialized: false};
const sprites = new Map();
const bindings = new WeakMap();
let celebration = null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const position = value => clamp(Number(value) || 0, 0, 9999) / 9999 * WORLD;
const hash = value => Array.from(String(value)).reduce((result, character) => (Math.imul(result, 31) + character.charCodeAt(0)) >>> 0, 0);
const butterflyArt = '<svg viewBox="0 0 44 36" aria-hidden="true"><path d="M21 18C5-6-7 12 13 23 0 39 24 37 21 18" fill="#9ebcdd" stroke="#6d93bc" stroke-width="1.5"/><path d="M23 18C39-6 51 12 31 23 44 39 20 37 23 18" fill="#d8b9de" stroke="#ad8bb8" stroke-width="1.5"/><path d="M22 15v14m-1-15-4-6m6 6 4-6" stroke="#7e748b" stroke-width="2.5" stroke-linecap="round"/><circle cx="11" cy="15" r="3" fill="#e8f0fa"/><circle cx="33" cy="15" r="3" fill="#f7e5f5"/></svg>';
function uniqueId(win) {
  return win.crypto && typeof win.crypto.randomUUID === 'function' ? win.crypto.randomUUID() : `plant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function gardenWorldMarkup(garden) {
  const inventory = garden.inventory || {}, plants = garden.worldPlants || [];
  const mature = plants.filter(plant => plant.growth >= plant.growthGoal).length;
  const needsFirstSeed = !plants.length && !(inventory.seeds > 0);
  return `<section class="garden-world" data-world-next="${plants.some(plant => plant.growth < plant.growthGoal) && inventory.water > 0 ? 'water' : inventory.seeds > 0 ? 'plant' : 'practice'}" aria-label="我的大花园">
    <div class="garden-world-heading"><div><h2>我的大花园</h2><p>${plants.length ? `种下 ${plants.length} 棵 · ${mature} 棵开花啦` : needsFirstSeed ? '花田准备好了，出发找种子吧' : '一粒种子，开始你的花园冒险'}</p></div><button class="text-button" type="button" data-world-collection aria-label="打开花园收藏">🌼 图鉴</button></div>
    <div class="garden-world-stage"><canvas data-garden-world tabindex="0" role="application" aria-label="花园画布。${needsFirstSeed ? '先点下面的出发按钮，练习后带回种子。' : '先选种子，再点花田种下；选水壶，再点小苗浇水。'}拖动空地移动花园。"></canvas><div class="garden-world-ambience" aria-hidden="true"><i class="garden-world-cloud"></i><i class="garden-world-butterfly">${butterflyArt}</i><i class="garden-world-butterfly is-second">${butterflyArt}</i></div><div class="garden-world-growth" data-world-growth aria-live="polite"></div><div class="garden-world-camera" aria-label="花园视野"><button type="button" data-world-zoom="in" aria-label="放大花园">＋</button><button type="button" data-world-zoom="out" aria-label="缩小花园">−</button><button type="button" data-world-zoom="all" aria-label="看看整个花园">🗺️</button><button type="button" data-world-zoom="home" aria-label="回到小苗附近">🌱</button></div><div class="garden-world-hint" data-world-stage-hint>${plants.length ? '拖一拖，探索你的花园' : needsFirstSeed ? '先来玩一句，带回种子 ↓' : '把种子送到亮亮的花田里'}</div></div>
    <p class="garden-world-instruction" data-world-instruction aria-live="polite">拿起小工具，让花园长大</p>
    <div class="garden-world-tools" aria-label="花园小工具"><button type="button" data-world-tool="plant" aria-label="${inventory.seeds > 0 ? '拿起种子，拖到花田或点花田播种' : '种子袋空了，练习后带回种子'}" aria-pressed="false" ${inventory.seeds > 0 ? '' : 'disabled'}><span class="garden-world-tool-art">${gardenToolArt('plant')}</span><strong>${inventory.seeds || 0}</strong><span>${inventory.seeds > 0 ? '种下惊喜' : '等你带回种子'}</span></button><button type="button" data-world-tool="water" aria-label="${inventory.water > 0 ? '拿起水壶，拖到小苗或点小苗浇水' : '水壶空了，练习后带回水'}" aria-pressed="false" ${inventory.water > 0 ? '' : 'disabled'}><span class="garden-world-tool-art">${gardenToolArt('water')}</span><strong>${inventory.water || 0}</strong><span>${inventory.water > 0 ? '咕嘟，长大！' : '玩一句，装满水'}</span></button></div>
    <button class="primary garden-world-practice" type="button" data-world-practice><span aria-hidden="true">⭐</span> ${needsFirstSeed ? '出发玩一句，找花园宝藏' : '跟读评星，补充花园宝藏'} <span aria-hidden="true">→</span></button>
  </section>`;
}

/** Canvas rendering keeps a thousand flowers out of the DOM. All resource writes belong to the caller. */
export function bindGardenWorld(root, {garden, onAction, onPractice, onCollection, notify} = {}) {
  if (!root || !garden || typeof onAction !== 'function') return () => {};
  bindings.get(root)?.();
  const container = root.matches('.garden-world') ? root : root.querySelector('.garden-world');
  const canvas = container?.querySelector('[data-garden-world]');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return () => {};
  const doc = root.ownerDocument, win = doc.defaultView;
  const plants = (garden.worldPlants || []).map(plant => ({...plant, wx: position(plant.x), wy: position(plant.y)})).sort((a, b) => a.wy - b.wy);
  const reduceMotion = Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  if (!cameras.initialized) {
    const anchor = plants.find(plant => plant.growth < plant.growthGoal) || plants[0];
    if (anchor) { cameras.x = anchor.wx; cameras.y = anchor.wy; }
    cameras.initialized = true;
  }
  const tools = Array.from(container.querySelectorAll('[data-world-tool]'));
  const instruction = container.querySelector('[data-world-instruction]');
  const hint = container.querySelector('[data-world-stage-hint]');
  const growthPanel = container.querySelector('[data-world-growth]');
  const cleanupListeners = [];
  let width = 1, height = 1, disposed = false, pending = false, gesture = null, ghost = null, frame = 0, lastPointer = 0;
  const activePointers = new Set();
  let selected = tools.some(tool => !tool.disabled && tool.dataset.worldTool === cameras.selected) ? cameras.selected : !plants.length && garden.inventory?.seeds > 0 ? 'plant' : null;
  let focused = plants.find(plant => plant.id === cameras.focused) || plants.find(plant => plant.growth < plant.growthGoal) || plants[plants.length - 1];
  function listen(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    cleanupListeners.push(() => node.removeEventListener(type, handler, options));
  }
  function say(message) { if (instruction) instruction.textContent = message; }
  function report(message) { say(message); if (typeof notify === 'function') notify(message); }
  function palette(variable, fallback) { return win.getComputedStyle(container).getPropertyValue(variable).trim() || fallback; }
  const colors = {ground: palette('--skin-success-soft', '#edf2df'), line: palette('--skin-line', '#c8d9b1'), text: palette('--skin-primary', '#315e49')};
  function focusPlant(plant) {
    focused = plant; cameras.focused = plant?.id || null;
    if (!growthPanel) return;
    if (!plant) {growthPanel.innerHTML = `<span class="garden-world-growth-icon" aria-hidden="true">${garden.inventory?.seeds > 0 ? '🌱' : '🎒'}</span><strong>${garden.inventory?.seeds > 0 ? '第一颗惊喜' : '花园等你回来'}</strong><small>${garden.inventory?.seeds > 0 ? '种下它，再浇水' : '玩一句，找种子'}</small>`; return;}
    const goal = plant.growthGoal || 5, remaining = Math.max(0, goal - plant.growth);
    growthPanel.innerHTML = `<span class="garden-world-growth-icon" aria-hidden="true">${remaining ? '🌱' : '🌼'}</span><strong>${remaining ? `再浇 ${remaining} 次就开花` : '你养大的花！'}</strong><span class="garden-world-growth-drops" aria-label="已浇水 ${plant.growth} 次，共 ${goal} 次">${Array.from({length: Math.min(goal, 12)}, (_, index) => `<i class="${index < plant.growth ? 'is-filled' : ''}"></i>`).join('')}</span>`;
  }
  function select(type) {
    selected = tools.some(tool => !tool.disabled && tool.dataset.worldTool === type) ? type : null;
    cameras.selected = selected;
    tools.forEach(tool => tool.setAttribute('aria-pressed', String(tool.dataset.worldTool === selected)));
    canvas.classList.toggle('is-world-tool-ready', Boolean(selected));
    container.dataset.worldSelected = selected || '';
    say(selected === 'plant' ? '拖种子到喜欢的地方，也可以点花田' : selected === 'water' ? '拖水壶找小苗，也可以直接点小苗' : !plants.length && !(garden.inventory?.seeds > 0) ? '点下面的出发按钮，开始找宝藏' : !(garden.inventory?.seeds > 0) && !(garden.inventory?.water > 0) ? '小工具用完啦，玩一句补充宝藏' : '拿起小工具，让花园长大');
  }
  function screenPoint(wx, wy) { return {x: (wx - cameras.x) * cameras.zoom + width / 2, y: (wy - cameras.y) * cameras.zoom + height / 2}; }
  function worldPoint(clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    return {x: (clientX - box.left - width / 2) / cameras.zoom + cameras.x, y: (clientY - box.top - height / 2) / cameras.zoom + cameras.y};
  }
  function inside(clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    return clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
  }
  function constrainCamera() { cameras.x = clamp(cameras.x, 0, WORLD); cameras.y = clamp(cameras.y, 0, WORLD); cameras.zoom = clamp(cameras.zoom, .055, 2.2); }
  function schedule() { if (!disposed && !frame) frame = win.requestAnimationFrame(draw); }
  function sprite(plant) {
    const ratio = clamp(plant.growth / (plant.growthGoal || 5), 0, 1);
    const stage = ratio >= 1 ? 3 : ratio >= .6 ? 2 : plant.growth > 0 ? 1 : 0;
    const key = `${plant.kind}-${stage}`;
    if (!sprites.has(key)) {
      const img = new win.Image();
      img.onload = schedule;
      const svg = plantDrawing(plant.kind, stage).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      sprites.set(key, img);
    }
    return {image: sprites.get(key), ratio};
  }
  function ellipse(x, y, rx, ry, color, rotation = 0) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), rotation, 0, Math.PI * 2); ctx.fill();
  }
  function grass(x, y, scale, color = '#789c67') {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(.7, 1.4 * scale); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 2 * scale, y - 8 * scale, x - 6 * scale, y - 9 * scale); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 2 * scale, y - 12 * scale, x + 5 * scale, y - 13 * scale); ctx.moveTo(x + scale, y); ctx.quadraticCurveTo(x + 5 * scale, y - 6 * scale, x + 9 * scale, y - 6 * scale); ctx.stroke();
  }
  function starterGlade() {
    const z = cameras.zoom;
    // Scenery is a painted backdrop, never a collision map or an inventory plant.
    const path = [screenPoint(1205, 1550), screenPoint(1380, 1600), screenPoint(1510, 1780), screenPoint(1775, 1570)];
    ctx.lineCap = 'round'; ctx.strokeStyle = '#d8c79c77'; ctx.lineWidth = 34 * z;
    ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y); ctx.bezierCurveTo(path[1].x, path[1].y, path[2].x, path[2].y, path[3].x, path[3].y); ctx.stroke();
    ctx.strokeStyle = '#efddb4'; ctx.lineWidth = 24 * z; ctx.stroke();
    const pool = screenPoint(1315, 1485);
    ellipse(pool.x, pool.y, 81 * z, 51 * z, '#acb889', -.25);
    ellipse(pool.x, pool.y - 2 * z, 72 * z, 44 * z, '#92c9c6', -.25);
    ellipse(pool.x + 5 * z, pool.y - 7 * z, 61 * z, 33 * z, '#b7e0d7', -.25);
    ctx.strokeStyle = '#e2f2df'; ctx.lineWidth = Math.max(1, 2 * z);
    ctx.beginPath(); ctx.ellipse(pool.x + 14 * z, pool.y - 3 * z, 22 * z, 8 * z, -.2, 0, Math.PI); ctx.stroke();
    ellipse(pool.x + 35 * z, pool.y - 22 * z, 13 * z, 6 * z, '#7fab72', -.15);
    ellipse(pool.x + 28 * z, pool.y + 20 * z, 14 * z, 8 * z, '#b7b79c', -.4);
    ellipse(pool.x + 57 * z, pool.y + 10 * z, 10 * z, 6 * z, '#cccaab', -.4);
    for (let i = 0; i < 5; i++) grass(pool.x + (42 + i * 9) * z, pool.y + (25 - i * 11) * z, z * 1.2, '#789d6f');
    // Rounded leafy hedges frame the glade, while flowers earned by the child draw on top.
    for (const [wx, wy, scale] of [[1687, 1435, 1], [1700, 1580, .85], [1390, 1705, .7]]) {
      const p = screenPoint(wx, wy), s = z * scale;
      ellipse(p.x, p.y + 7 * s, 50 * s, 15 * s, '#879e7533');
      ellipse(p.x - 20 * s, p.y - 8 * s, 28 * s, 26 * s, '#9fba78', -.25);
      ellipse(p.x + 15 * s, p.y - 13 * s, 35 * s, 31 * s, '#86aa73', .2);
      ellipse(p.x, p.y - 31 * s, 29 * s, 26 * s, '#adc883', -.2);
      for (let i = 0; i < 5; i++) ellipse(p.x + (i * 12 - 25) * s, p.y - (16 + i % 2 * 14) * s, 4 * s, 2 * s, '#d7dea177', -.5);
    }
  }
  function terrain() {
    const zoom = cameras.zoom, left = screenPoint(0, 0), right = screenPoint(WORLD, WORLD);
    ctx.fillStyle = '#d5c5a3'; ctx.fillRect(0, 0, width, height);
    // The pond and border path are scenery outside the plantable meadow. Saved coordinates stay untouched.
    ctx.strokeStyle = '#eadaba'; ctx.lineWidth = 88 * zoom; ctx.strokeRect(left.x - 44 * zoom, left.y - 44 * zoom, WORLD * zoom + 88 * zoom, WORLD * zoom + 88 * zoom);
    const pond = screenPoint(-240, 950);
    ellipse(pond.x, pond.y, 220 * zoom, 330 * zoom, '#91bdb1', -.15);
    ellipse(pond.x, pond.y, 178 * zoom, 287 * zoom, '#b9e0dc', -.15);
    ellipse(pond.x - 42 * zoom, pond.y - 65 * zoom, 65 * zoom, 17 * zoom, '#e6f5de', -.2);
    ctx.fillStyle = colors.ground; ctx.fillRect(left.x, left.y, WORLD * zoom, WORLD * zoom);
    ctx.save(); ctx.beginPath(); ctx.rect(left.x, left.y, WORLD * zoom, WORLD * zoom); ctx.clip();
    const cell = 170;
    const startX = Math.max(0, Math.floor((cameras.x - width / 2 / zoom) / cell));
    const startY = Math.max(0, Math.floor((cameras.y - height / 2 / zoom) / cell));
    const endX = Math.min(18, Math.ceil((cameras.x + width / 2 / zoom) / cell));
    const endY = Math.min(18, Math.ceil((cameras.y + height / 2 / zoom) / cell));
    for (let x = startX; x <= endX; x++) for (let y = startY; y <= endY; y++) {
      const seed = (x * 397 + y * 271 + 19) % 997;
      const p = screenPoint(x * cell + seed % 89, y * cell + seed % 61);
      ellipse(p.x, p.y, (48 + seed % 40) * zoom, (19 + seed % 26) * zoom, seed % 3 ? '#bed5a927' : '#fff9cd3b', seed % 7 / 9);
      if (zoom < .25) continue;
      ctx.strokeStyle = '#91b17b66'; ctx.lineWidth = Math.max(1, 1.7 * zoom); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - 5 * zoom, p.y + 6 * zoom); ctx.quadraticCurveTo(p.x - 8 * zoom, p.y - 5 * zoom, p.x - 12 * zoom, p.y - 5 * zoom); ctx.moveTo(p.x - 5 * zoom, p.y + 6 * zoom); ctx.quadraticCurveTo(p.x - 2 * zoom, p.y - 6 * zoom, p.x + 2 * zoom, p.y - 7 * zoom); ctx.stroke();
      if (seed % 4 === 0) {
        const fx = p.x + 32 * zoom, fy = p.y + 17 * zoom;
        for (let petal = 0; petal < 5; petal++) ellipse(fx + Math.cos(petal * 1.257) * 3 * zoom, fy + Math.sin(petal * 1.257) * 3 * zoom, 2.8 * zoom, 2.8 * zoom, '#fffdf4c9');
        ellipse(fx, fy, 1.8 * zoom, 1.8 * zoom, '#e1bd6d');
      }
    }
    if (zoom > .3) {
      const spacing = 74;
      const tx = Math.max(0, Math.floor((cameras.x - width / 2 / zoom) / spacing)), ty = Math.max(0, Math.floor((cameras.y - height / 2 / zoom) / spacing));
      const maxX = Math.min(41, Math.ceil((cameras.x + width / 2 / zoom) / spacing)), maxY = Math.min(41, Math.ceil((cameras.y + height / 2 / zoom) / spacing));
      for (let x = tx; x <= maxX; x++) for (let y = ty; y <= maxY; y++) {
        const seed = (x * 331 + y * 199) % 877, p = screenPoint(x * spacing + seed % 45, y * spacing + seed % 31);
        if (seed % 3 !== 0) grass(p.x, p.y, zoom * (.65 + seed % 3 * .1), '#8fa9778c');
        for (let grain = 0; grain < 3; grain++) ellipse(p.x + (grain * 13 - 15) * zoom, p.y + (seed % 17 + grain * 3) * zoom, 1.2 * zoom, .8 * zoom, grain % 2 ? '#fff7d5a1' : '#a8b88d6b');
        if (seed % 7 === 0) for (let leaf = 0; leaf < 3; leaf++) ellipse(p.x + Math.cos(leaf * 2.09) * 4 * zoom, p.y + Math.sin(leaf * 2.09) * 4 * zoom, 4 * zoom, 3 * zoom, '#8cad738f', leaf * 2.09);
      }
    }
    starterGlade();
    ctx.restore();
    ctx.strokeStyle = '#96b381'; ctx.lineWidth = Math.max(1, 5 * zoom); ctx.strokeRect(left.x, left.y, right.x - left.x, right.y - left.y);
    const fenceSpacing = 115;
    if (zoom > .16) {
      ctx.strokeStyle = '#f8efce'; ctx.lineWidth = 9 * zoom; ctx.lineCap = 'round';
      for (let x = 0; x <= WORLD; x += fenceSpacing) {
        const top = screenPoint(x, -30), bottom = screenPoint(x, WORLD + 30);
        ctx.beginPath(); ctx.moveTo(top.x, top.y - 17 * zoom); ctx.lineTo(top.x, top.y + 12 * zoom); ctx.moveTo(bottom.x, bottom.y - 17 * zoom); ctx.lineTo(bottom.x, bottom.y + 12 * zoom); ctx.stroke();
      }
    }
  }
  function draw() {
    frame = 0;
    if (disposed) return;
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    terrain();
    if (!plants.length) {
      const point = screenPoint(1500, 1500);
      ellipse(point.x, point.y + 10, Math.min(83, width * .28), Math.min(43, height * .2), '#eddbb4');
      for (let i = 0; i < 20; i++) {const angle = i * 2.4, radius = 12 + i % 5 * 13; ellipse(point.x + Math.cos(angle) * radius, point.y + 10 + Math.sin(angle) * radius * .4, 1.7, 1, '#c7aa794f');}
      ctx.strokeStyle = '#cfab62'; ctx.lineWidth = 2; ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.ellipse(point.x, point.y + 10, Math.min(89, width * .3), Math.min(49, height * .23), 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = colors.text; ctx.font = '36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(garden.inventory?.seeds > 0 ? '🌱' : '🎒', point.x, point.y + 3);
      ctx.font = 'bold 12px sans-serif'; ctx.fillText(garden.inventory?.seeds > 0 ? '种在这里吧' : '等种子回家', point.x, point.y + 28);
    }
    const now = Date.now();
    for (const plant of plants) {
      const point = screenPoint(plant.wx, plant.wy);
      const ratio = clamp(plant.growth / (plant.growthGoal || 5), 0, 1);
      const variant = Number(plant.variant) || hash(plant.id) % 6;
      const grown = (.55 + ratio * .45) * (1 + variant * .018);
      const effect = !reduceMotion && celebration && celebration.id === plant.id && now - celebration.time < 900;
      const pop = effect ? 1 + Math.sin((now - celebration.time) / 900 * Math.PI) * .18 : 1;
      const size = 78 * cameras.zoom * grown * pop;
      if (point.x < -size || point.x > width + size || point.y < -10 || point.y > height + size) continue;
      const {image} = sprite(plant);
      if (focused?.id === plant.id && cameras.zoom > .3) {
        ellipse(point.x, point.y + 3, size * .55 + 6, size * .18 + 3, selected === 'water' ? '#9cdbdf5c' : '#f8dc7957');
        ctx.strokeStyle = selected === 'water' ? '#74b8c9' : '#d8b969'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(point.x, point.y + 3, size * .55 + 6, size * .18 + 3, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (image.complete && image.naturalWidth) {
        ctx.save(); ctx.translate(point.x, point.y); ctx.rotate((variant - 2.5) * .025);
        if (variant % 2) ctx.scale(-1, 1);
        ctx.drawImage(image, -size / 2, -size * .92, size, size * 1.1); ctx.restore();
      } else {ctx.fillStyle = colors.text; ctx.beginPath(); ctx.arc(point.x, point.y - 5, Math.max(2, size / 8), 0, Math.PI * 2); ctx.fill(); if (!image.complete) schedule();}
      if (selected === 'water' && plant.canWater !== false && plant.growth < plant.growthGoal && cameras.zoom > .4) {
        ctx.fillStyle = '#ffffffc9'; ctx.beginPath(); ctx.arc(point.x, point.y + 6, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.text; ctx.textAlign = 'center'; ctx.font = '10px sans-serif'; ctx.fillText(`${plant.growth}/${plant.growthGoal}`, point.x, point.y + 9);
      }
    }
    if (celebration && now - celebration.time < (reduceMotion ? 450 : 1200)) {
      const point = screenPoint(celebration.x, celebration.y), elapsed = (now - celebration.time) / 1100;
      ctx.globalAlpha = Math.max(0, 1 - elapsed); ctx.font = '30px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(celebration.symbol, point.x, point.y - 45 - (reduceMotion ? 0 : elapsed * 40));
      if (!reduceMotion) for (let index = 0; index < 10; index++) {
        const angle = index / 10 * Math.PI * 2, radius = 16 + elapsed * 66;
        ellipse(point.x + Math.cos(angle) * radius, point.y - 30 + Math.sin(angle) * radius * .65, 2.5 + (1 - elapsed) * 2, 2.5 + (1 - elapsed) * 2, index % 2 ? '#f5ce62' : '#8fcad8');
      }
      ctx.globalAlpha = 1; schedule();
    }
  }
  function resize() {
    if (disposed) return;
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, box.width); height = Math.max(1, box.height);
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    schedule();
  }
  async function act(type, clientX, clientY) {
    if (pending || disposed || !inside(clientX, clientY)) return;
    const point = worldPoint(clientX, clientY);
    if (point.x < 0 || point.y < 0 || point.x > WORLD || point.y > WORLD) { report('这里是小路，种在绿色花田里吧'); return; }
    const resource = type === 'plant' ? garden.inventory?.seeds : garden.inventory?.water;
    if (!(resource > 0)) { report(type === 'plant' ? '去跟读评星，领一包种子吧' : '去跟读评星，领一壶水吧'); return; }
    let action, plant, symbol;
    if (type === 'plant') {
      if (plants.length >= (garden.worldCapacity || 1600)) { report('花田种满啦，照顾小苗，让它们开花吧'); return; }
      const neighbor = plants.find(item => Math.hypot(point.x - item.wx, point.y - item.wy) < 36);
      if (neighbor) {focusPlant(neighbor); schedule(); report('这里住着小苗啦，种在旁边吧'); return;}
      const id = uniqueId(win), kinds = PLANTS.map(item => item.id);
      action = {type: 'world-plant', id, kind: kinds[hash(id) % kinds.length], x: Math.round(point.x / WORLD * 9999), y: Math.round(point.y / WORLD * 9999)};
      plant = {id, wx: point.x, wy: point.y}; symbol = '🌱✨';
    } else {
      const radius = Math.max(45, 34 / cameras.zoom);
      plant = plants.filter(item => item.canWater !== false && item.growth < item.growthGoal).reduce((nearest, item) => {
        // The picture rises above its soil coordinates: a child can tap leaves as well as the soil.
        const centerY = item.wy - 25 * (.55 + clamp(item.growth / item.growthGoal, 0, 1) * .45);
        const distance = Math.hypot(point.x - item.wx, point.y - centerY);
        return distance <= radius && (!nearest || distance < nearest.distance) ? {...item, distance} : nearest;
      }, null);
      if (!plant) { report('把水壶放到还没开花的小苗上吧'); return; }
      action = {type: 'world-water', id: plant.id, actionId: uniqueId(win)};
      symbol = plant.growth + 1 >= plant.growthGoal ? '🌸✨' : '💧✨';
    }
    pending = true;
    cameras.focused = plant.id;
    // The caller can synchronously replace this DOM after saving. Keep the effect for the next binding.
    celebration = {id: plant.id, x: plant.wx, y: plant.wy, symbol, time: Date.now()};
    try {
      const result = await onAction(action);
      if (result === false) celebration = null;
      else if (!disposed) {say(type === 'plant' ? '种下啦！用水壶照顾它吧' : symbol === '🌸✨' ? '开花啦！你把小苗养大了' : '咕嘟咕嘟，小苗长大一点啦'); schedule();}
    } catch (_) { celebration = null; if (!disposed) report('这次没有保存成功，请再试一下'); }
    finally { pending = false; }
  }
  function finishGesture() {
    const previous = gesture; gesture = null;
    if (previous) { try { previous.target.releasePointerCapture(previous.id); } catch (_) {} }
    ghost?.remove(); ghost = null;
    container.classList.remove('is-world-dragging');
    return previous;
  }
  function begin(event, type, target) {
    if (event.button !== undefined && event.button !== 0 || disposed || pending || gesture || activePointers.size > 1) return;
    if (type && target.disabled) return;
    event.preventDefault();
    if (type) select(type);
    gesture = {id: event.pointerId, type, target, x: event.clientX, y: event.clientY, moved: false, cameraX: cameras.x, cameraY: cameras.y};
    try { target.setPointerCapture(event.pointerId); } catch (_) {}
  }
  listen(container, 'pointerdown', event => {activePointers.add(event.pointerId); if (activePointers.size > 1) finishGesture();}, {capture: true});
  listen(win, 'pointerup', event => activePointers.delete(event.pointerId));
  listen(win, 'pointercancel', event => {activePointers.delete(event.pointerId); if (gesture?.id === event.pointerId) finishGesture();});
  listen(win, 'blur', () => {activePointers.clear(); finishGesture();});
  listen(doc, 'visibilitychange', () => {if (doc.hidden) {activePointers.clear(); finishGesture();}});
  listen(container, 'keydown', event => {if (event.key === 'Escape') {event.preventDefault(); finishGesture(); select(null); schedule();}});
  tools.forEach(tool => {
    listen(tool, 'pointerdown', event => begin(event, tool.dataset.worldTool, tool));
    listen(tool, 'click', event => {if (Date.now() - lastPointer < 400) return; event.preventDefault(); select(selected === tool.dataset.worldTool ? null : tool.dataset.worldTool); schedule();});
  });
  listen(canvas, 'pointerdown', event => begin(event, null, canvas));
  listen(win, 'pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) > 8) gesture.moved = true;
    if (!gesture.moved) return;
    event.preventDefault();
    if (gesture.type) {
      if (!ghost) {ghost = doc.createElement('div'); ghost.className = 'garden-world-ghost'; ghost.innerHTML = gardenToolArt(gesture.type); ghost.setAttribute('aria-hidden', 'true'); doc.body.appendChild(ghost); container.classList.add('is-world-dragging');}
      ghost.style.transform = `translate(${Math.round(event.clientX)}px,${Math.round(event.clientY)}px)`;
    } else {cameras.x = gesture.cameraX - dx / cameras.zoom; cameras.y = gesture.cameraY - dy / cameras.zoom; constrainCamera(); schedule();}
  }, {passive: false});
  listen(win, 'pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const previous = finishGesture(); lastPointer = Date.now();
    if (activePointers.size > 0) return;
    if (previous.type) {if (previous.moved) act(previous.type, event.clientX, event.clientY); else schedule();}
    else if (!previous.moved && selected) act(selected, event.clientX, event.clientY);
    else if (!previous.moved) {
      const point = worldPoint(event.clientX, event.clientY), radius = Math.max(45, 24 / cameras.zoom);
      const near = plants.reduce((best, plant) => {const distance = Math.hypot(point.x - plant.wx, point.y - plant.wy); return distance < radius && (!best || distance < best.distance) ? {...plant, distance} : best;}, null);
      if (near) {focusPlant(near); if (cameras.zoom < .4) {cameras.x = near.wx; cameras.y = near.wy; cameras.zoom = .9;} select(near.growth < near.growthGoal && garden.inventory?.water > 0 ? 'water' : null);}
      else select(plants.length && garden.inventory?.water > 0 ? 'water' : garden.inventory?.seeds > 0 ? 'plant' : null);
      schedule();
    }
  });
  listen(canvas, 'keydown', event => {
    const movement = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[event.key];
    if (movement) {event.preventDefault(); cameras.x += movement[0] * 70 / cameras.zoom; cameras.y += movement[1] * 70 / cameras.zoom; constrainCamera(); schedule();}
    else if ((event.key === 'Enter' || event.key === ' ') && selected) {event.preventDefault(); const box = canvas.getBoundingClientRect(); act(selected, box.left + width / 2, box.top + height / 2);}
  });
  container.querySelectorAll('[data-world-zoom]').forEach(button => listen(button, 'click', () => {
    const action = button.dataset.worldZoom;
    if (action === 'all') {cameras.x = WORLD / 2; cameras.y = WORLD / 2; cameras.zoom = Math.min(width, height) / (WORLD + 180); select(null);}
    else if (action === 'home') {const anchor = plants.find(item => item.id === cameras.focused && item.canWater !== false && item.growth < item.growthGoal) || plants.find(item => item.canWater !== false && item.growth < item.growthGoal) || plants[plants.length - 1]; cameras.x = anchor?.wx || WORLD / 2; cameras.y = anchor?.wy || WORLD / 2; cameras.zoom = .9; focusPlant(anchor);}
    else cameras.zoom *= action === 'in' ? 1.5 : 1 / 1.5;
    constrainCamera(); schedule(); if (hint) hint.textContent = action === 'all' ? '整片花园都在这里 · 点 🌱 回到小苗' : '拖动花田，看看更多小苗';
  }));
  listen(container.querySelector('[data-world-practice]'), 'click', () => onPractice?.());
  listen(container.querySelector('[data-world-collection]'), 'click', () => onCollection?.());
  listen(win, 'resize', resize);
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null;
  observer?.observe(canvas);
  select(selected); focusPlant(focused); resize();
  const cleanup = () => {disposed = true; finishGesture(); observer?.disconnect(); cleanupListeners.forEach(remove => remove()); if (frame) win.cancelAnimationFrame(frame); if (bindings.get(root) === cleanup) bindings.delete(root);};
  bindings.set(root, cleanup);
  return cleanup;
}
