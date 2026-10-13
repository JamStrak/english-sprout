import {PLANTS} from './garden.js';
import {gardenToolArt, plantDrawing} from './garden-art.js';

const WORLD = 3000;
const cameras = {x: 1500, y: 1500, zoom: .9, selected: null, initialized: false};
const sprites = new Map();
const bindings = new WeakMap();
let celebration = null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const position = value => clamp(Number(value) || 0, 0, 9999) / 9999 * WORLD;
const hash = value => Array.from(String(value)).reduce((result, character) => (Math.imul(result, 31) + character.charCodeAt(0)) >>> 0, 0);
function uniqueId(win) {
  return win.crypto && typeof win.crypto.randomUUID === 'function' ? win.crypto.randomUUID() : `plant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function gardenWorldMarkup(garden) {
  const inventory = garden.inventory || {}, plants = garden.worldPlants || [];
  const mature = plants.filter(plant => plant.growth >= plant.growthGoal).length;
  return `<section class="garden-world" aria-label="我的大花园">
    <div class="garden-world-heading"><div><h2>我的大花园</h2><p>${plants.length ? `种下 ${plants.length} 棵 · ${mature} 棵开花啦` : '种在你喜欢的地方，养出一片花海'}</p></div><button class="text-button" type="button" data-world-collection aria-label="打开花园收藏">🌼 收藏</button></div>
    <div class="garden-world-stage"><canvas data-garden-world tabindex="0" role="application" aria-label="花园画布。先选种子，再点花田种下；选水壶，再点小苗浇水。拖动空地移动花园。"></canvas><div class="garden-world-camera" aria-label="花园视野"><button type="button" data-world-zoom="in" aria-label="放大花园">＋</button><button type="button" data-world-zoom="out" aria-label="缩小花园">−</button><button type="button" data-world-zoom="all" aria-label="看看整个花园">🗺️</button><button type="button" data-world-zoom="home" aria-label="回到小苗附近">🌱</button></div><div class="garden-world-hint" data-world-stage-hint>${plants.length ? '拖动花田，看看更多小苗' : '🌱 把种子拖到这里'}</div></div>
    <p class="garden-world-instruction" data-world-instruction aria-live="polite">拖种子到花田 · 拖水壶到小苗</p>
    <div class="garden-world-tools"><button type="button" data-world-tool="plant" aria-pressed="false" ${inventory.seeds > 0 ? '' : 'disabled'}><span class="garden-world-tool-art">${gardenToolArt('plant')}</span><strong>${inventory.seeds || 0}</strong><span>种子 · 拖到花田</span></button><button type="button" data-world-tool="water" aria-pressed="false" ${inventory.water > 0 ? '' : 'disabled'}><span class="garden-world-tool-art">${gardenToolArt('water')}</span><strong>${inventory.water || 0}</strong><span>水壶 · 拖到小苗</span></button></div>
    <button class="primary garden-world-practice" type="button" data-world-practice>⭐ 跟读评星，领种子和水</button>
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
  const plants = (garden.worldPlants || []).map(plant => ({...plant, wx: position(plant.x), wy: position(plant.y)}));
  if (!cameras.initialized) {
    const anchor = plants.find(plant => plant.growth < plant.growthGoal) || plants[0];
    if (anchor) { cameras.x = anchor.wx; cameras.y = anchor.wy; }
    cameras.initialized = true;
  }
  const tools = Array.from(container.querySelectorAll('[data-world-tool]'));
  const instruction = container.querySelector('[data-world-instruction]');
  const hint = container.querySelector('[data-world-stage-hint]');
  const cleanupListeners = [];
  let width = 1, height = 1, disposed = false, pending = false, gesture = null, ghost = null, frame = 0, lastPointer = 0;
  const activePointers = new Set();
  let selected = tools.some(tool => !tool.disabled && tool.dataset.worldTool === cameras.selected) ? cameras.selected : null;
  function listen(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    cleanupListeners.push(() => node.removeEventListener(type, handler, options));
  }
  function say(message) { if (instruction) instruction.textContent = message; }
  function report(message) { say(message); if (typeof notify === 'function') notify(message); }
  function palette(variable, fallback) { return win.getComputedStyle(container).getPropertyValue(variable).trim() || fallback; }
  const colors = {ground: palette('--skin-success-soft', '#edf2df'), line: palette('--skin-line', '#c8d9b1'), text: palette('--skin-primary', '#315e49')};
  function select(type) {
    selected = tools.some(tool => !tool.disabled && tool.dataset.worldTool === type) ? type : null;
    cameras.selected = selected;
    tools.forEach(tool => tool.setAttribute('aria-pressed', String(tool.dataset.worldTool === selected)));
    canvas.classList.toggle('is-world-tool-ready', Boolean(selected));
    say(selected === 'plant' ? '种子拿好啦！点花田种下，或拖种子过来' : selected === 'water' ? '水壶拿好啦！点小苗浇水，或拖水壶过来' : '拖种子到花田 · 拖水壶到小苗');
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
  function draw() {
    frame = 0;
    if (disposed) return;
    const dpr = Math.min(win.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, 0, width, height);
    const left = screenPoint(0, 0), right = screenPoint(WORLD, WORLD);
    ctx.fillStyle = '#e4d5b8';
    ctx.fillRect(0, 0, width, Math.max(0, left.y));
    ctx.fillRect(0, Math.max(0, right.y), width, height);
    ctx.fillRect(0, 0, Math.max(0, left.x), height);
    ctx.fillRect(Math.max(0, right.x), 0, width, height);
    const grid = 100;
    const firstX = Math.max(0, Math.floor((cameras.x - width / 2 / cameras.zoom) / grid) * grid);
    const firstY = Math.max(0, Math.floor((cameras.y - height / 2 / cameras.zoom) / grid) * grid);
    ctx.fillStyle = colors.line;
    for (let x = firstX; x <= Math.min(WORLD, cameras.x + width / 2 / cameras.zoom); x += grid) {
      for (let y = firstY; y <= Math.min(WORLD, cameras.y + height / 2 / cameras.zoom); y += grid) {
        const point = screenPoint(x, y);
        ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(1, 2 * cameras.zoom), 0, Math.PI * 2); ctx.fill();
      }
    }
    if (!plants.length) {
      const point = screenPoint(1500, 1500);
      ctx.strokeStyle = colors.line; ctx.lineWidth = 3; ctx.setLineDash([7, 8]);
      ctx.beginPath(); ctx.ellipse(point.x, point.y, Math.min(92, width * .3), Math.min(52, height * .22), 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = colors.text; ctx.font = '36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🌱', point.x, point.y + 7);
    }
    const now = Date.now();
    for (const plant of plants) {
      const point = screenPoint(plant.wx, plant.wy);
      const {image, ratio} = sprite(plant);
      const variant = Number(plant.variant) || hash(plant.id) % 6;
      const grown = (.55 + ratio * .45) * (1 + variant * .018);
      const effect = celebration && celebration.id === plant.id && now - celebration.time < 900;
      const pop = effect ? 1 + Math.sin((now - celebration.time) / 900 * Math.PI) * .18 : 1;
      const size = 78 * cameras.zoom * grown * pop;
      if (point.x < -size || point.x > width + size || point.y < -10 || point.y > height + size) continue;
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
    if (celebration && now - celebration.time < 1100) {
      const point = screenPoint(celebration.x, celebration.y), elapsed = (now - celebration.time) / 1100;
      ctx.globalAlpha = 1 - elapsed; ctx.font = '30px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(celebration.symbol, point.x, point.y - 45 - elapsed * 40); ctx.globalAlpha = 1; schedule();
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
      if (plants.some(item => Math.hypot(point.x - item.wx, point.y - item.wy) < 36)) { report('给小苗留一点空间，旁边也能种哦'); return; }
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
    else if (!previous.moved) {select(plants.length && garden.inventory?.water > 0 ? 'water' : garden.inventory?.seeds > 0 ? 'plant' : null); schedule();}
  });
  listen(canvas, 'keydown', event => {
    const movement = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[event.key];
    if (movement) {event.preventDefault(); cameras.x += movement[0] * 70 / cameras.zoom; cameras.y += movement[1] * 70 / cameras.zoom; constrainCamera(); schedule();}
    else if ((event.key === 'Enter' || event.key === ' ') && selected) {event.preventDefault(); const box = canvas.getBoundingClientRect(); act(selected, box.left + width / 2, box.top + height / 2);}
  });
  container.querySelectorAll('[data-world-zoom]').forEach(button => listen(button, 'click', () => {
    const action = button.dataset.worldZoom;
    if (action === 'all') {cameras.x = WORLD / 2; cameras.y = WORLD / 2; cameras.zoom = Math.min(width, height) / (WORLD + 180); select(null);}
    else if (action === 'home') {const anchor = plants.find(item => item.canWater !== false && item.growth < item.growthGoal) || plants[plants.length - 1]; cameras.x = anchor?.wx || WORLD / 2; cameras.y = anchor?.wy || WORLD / 2; cameras.zoom = .9;}
    else cameras.zoom *= action === 'in' ? 1.5 : 1 / 1.5;
    constrainCamera(); schedule(); if (hint) hint.textContent = action === 'all' ? '整片花园都在这里 · 点 🌱 回到小苗' : '拖动花田，看看更多小苗';
  }));
  listen(container.querySelector('[data-world-practice]'), 'click', () => onPractice?.());
  listen(container.querySelector('[data-world-collection]'), 'click', () => onCollection?.());
  listen(win, 'resize', resize);
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null;
  observer?.observe(canvas);
  select(selected); resize();
  const cleanup = () => {disposed = true; finishGesture(); observer?.disconnect(); cleanupListeners.forEach(remove => remove()); if (frame) win.cancelAnimationFrame(frame); if (bindings.get(root) === cleanup) bindings.delete(root);};
  bindings.set(root, cleanup);
  return cleanup;
}
