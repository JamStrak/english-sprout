/* Touch-first garden tools. Resource checks and writes belong to the caller. */
const bindings = new WeakMap();
const labels = {plant: '种子', water: '水壶', fertilize: '营养'};
const validTypes = new Set(Object.keys(labels));

/** Bind tools to one large target; returns a cleanup function for screen changes. */
export function bindGardenInteraction(root, {onAction} = {}) {
  if (!root || typeof onAction !== 'function') return () => {};
  bindings.get(root)?.();
  const doc = root.ownerDocument, win = doc.defaultView;
  const target = root.querySelector('[data-garden-drop]');
  if (!target) return () => {};
  const instruction = root.querySelector('[data-garden-instruction]');
  const originalInstruction = instruction?.textContent || '';
  const tools = Array.from(root.querySelectorAll('[data-garden-tool]'));
  let selected = null, pointer = null, ghost = null, disposed = false;
  let busy = false, suppressClickUntil = 0;
  const removers = [];

  function listen(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    removers.push(() => node.removeEventListener(type, handler, options));
  }
  function enabled(tool) {
    return tool && root.contains(tool) && validTypes.has(tool.dataset.gardenTool)
      && !tool.disabled && tool.getAttribute('aria-disabled') !== 'true';
  }
  function availableTarget() {
    return root.contains(target) && !target.disabled
      && target.getAttribute('aria-disabled') !== 'true';
  }
  function say(message) { if (instruction) instruction.textContent = message; }
  function toolLabel(tool) { return tool.dataset.gardenLabel || labels[tool.dataset.gardenTool]; }
  function select(tool) {
    selected = enabled(tool) ? tool : null;
    tools.forEach(item => item.setAttribute('aria-pressed', String(item === selected)));
    root.classList.toggle('garden-has-tool', Boolean(selected));
    if (selected) root.dataset.gardenSelected = selected.dataset.gardenTool;
    else delete root.dataset.gardenSelected;
    say(selected ? `${toolLabel(selected)}拿好啦！拖到花田，或点一下花田` : originalInstruction);
  }
  function inside(x, y) {
    if (!availableTarget()) return false;
    const box = target.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && x >= box.left && x <= box.right
      && y >= box.top && y <= box.bottom;
  }
  function moveGhost(x, y) {
    if (ghost) ghost.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  }
  function startGhost(tool, x, y) {
    ghost = doc.createElement('div');
    ghost.className = 'garden-drag-ghost';
    ghost.dataset.gardenGhost = tool.dataset.gardenTool;
    ghost.setAttribute('aria-hidden', 'true');
    const art = tool.querySelector('.garden-tool-art');
    if (art) ghost.appendChild(art.cloneNode(true));
    else ghost.textContent = {plant: '🌰', water: '💧', fertilize: '✨'}[tool.dataset.gardenTool];
    // A cloned tool illustration must not duplicate accessibility or DOM IDs.
    ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    doc.body.appendChild(ghost);
    root.classList.add('garden-is-dragging');
    tool.classList.add('garden-tool-lifted');
    moveGhost(x, y);
  }
  function finishPointer() {
    const previous = pointer;
    pointer = null;
    if (previous) {
      previous.tool.classList.remove('garden-tool-lifted');
      try {
        if (previous.tool.hasPointerCapture(previous.id)) previous.tool.releasePointerCapture(previous.id);
      } catch (_) { /* The screen may have changed while a finger was down. */ }
    }
    ghost?.remove();
    ghost = null;
    root.classList.remove('garden-is-dragging', 'garden-over-target');
    return previous;
  }
  function cancel() {
    const wasDragging = pointer?.dragging;
    finishPointer();
    if (wasDragging) suppressClickUntil = Date.now() + 600;
    select(null);
  }
  function commit(tool, method) {
    if (disposed || busy || !enabled(tool) || !availableTarget()) return;
    const type = tool.dataset.gardenTool;
    select(null);
    busy = true;
    // Clear selection before handing over, so duplicate end/click events cannot spend twice.
    try {
      const result = onAction(type, {method, source: tool, target});
      Promise.resolve(result).catch(() => {}).finally(() => { busy = false; });
    } catch (error) {
      busy = false;
      throw error;
    }
  }
  function pointerDown(event) {
    const tool = event.target.closest?.('[data-garden-tool]');
    if (!enabled(tool) || busy || pointer || event.isPrimary === false
      || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointer = {id: event.pointerId, tool, x: event.clientX, y: event.clientY, dragging: false};
    // Pointer capture keeps dragging reliable if a child's finger leaves the illustration.
    try { tool.setPointerCapture(event.pointerId); } catch (_) { /* Window listeners still handle it. */ }
  }
  function pointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!root.isConnected || !enabled(pointer.tool)) { cancel(); return; }
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!pointer.dragging && dx * dx + dy * dy >= 64) {
      pointer.dragging = true;
      select(pointer.tool);
      startGhost(pointer.tool, event.clientX, event.clientY);
    }
    if (!pointer.dragging) return;
    if (event.cancelable) event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    const over = inside(event.clientX, event.clientY);
    root.classList.toggle('garden-over-target', over);
    say(over ? '到啦！松开小手' : '把它送到中间的花田里');
  }
  function pointerUp(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const over = inside(event.clientX, event.clientY), previous = finishPointer();
    if (!previous.dragging) return; // A tap is handled by the native button click below.
    if (event.cancelable) event.preventDefault();
    suppressClickUntil = Date.now() + 600;
    if (over) commit(previous.tool, 'drag');
    else {
      select(null);
      say('放回小篮子啦，东西还在哦');
    }
  }
  function pointerCancel(event) {
    if (pointer && event.pointerId === pointer.id) cancel();
  }
  function click(event) {
    const tool = event.target.closest?.('[data-garden-tool]');
    const onTarget = target === event.target || target.contains(event.target);
    if (!tool && !onTarget) return;
    // Browsers can synthesize a click after pointerup, including on touch screens.
    if (Date.now() < suppressClickUntil && event.detail !== 0) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (busy || pointer?.dragging) { event.preventDefault(); return; }
    if (tool) {
      if (enabled(tool)) select(tool);
      return;
    }
    if (onTarget && enabled(selected)) commit(selected, 'tap');
    else if (onTarget) say('先拿一件小工具，再来照顾花田吧');
  }
  function keyDown(event) {
    if (event.key === 'Escape' && (selected || pointer)) { event.preventDefault(); cancel(); }
  }
  function visibilityChange() { if (doc.hidden) cancel(); }
  function cleanup() {
    if (disposed) return;
    disposed = true;
    cancel();
    removers.forEach(remove => remove());
    if (bindings.get(root) === cleanup) bindings.delete(root);
  }
  tools.forEach(tool => tool.setAttribute('aria-pressed', 'false'));
  listen(root, 'pointerdown', pointerDown);
  listen(win, 'pointermove', pointerMove, {passive: false});
  listen(win, 'pointerup', pointerUp, {passive: false});
  listen(win, 'pointercancel', pointerCancel);
  listen(root, 'lostpointercapture', pointerCancel);
  listen(root, 'click', click, true);
  listen(root, 'keydown', keyDown);
  listen(win, 'blur', cancel);
  listen(doc, 'visibilitychange', visibilityChange);
  listen(root, 'contextmenu', event => {
    if (event.target.closest?.('[data-garden-tool], [data-garden-drop]')) event.preventDefault();
  });
  bindings.set(root, cleanup);
  return cleanup;
}
