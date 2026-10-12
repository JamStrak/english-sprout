// Safari on iPadOS 15.1 has <dialog> markup but no modal-dialog API.
// Keep the browser's native modal behavior whenever it is available.
const fallbackDialogs = [];
const focusSelector = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let previousOverflow = '';

function focus(element) {
  if (!element || !element.isConnected) return;
  try { element.focus({preventScroll:true}); } catch { element.focus(); }
}

function focusable(dialog) {
  return Array.from(dialog.querySelectorAll(focusSelector)).filter(element =>
    element.tabIndex >= 0 && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
}

function restoreAttribute(element, name, value) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

// An unknown dialog element on old Safari treats onclose as a plain property.
// Native event-handler accessors dispatch themselves; plain properties need a bridge.
function dispatch(dialog, type, cancelable = false) {
  const event = new Event(type, {cancelable});
  const handler = Object.getOwnPropertyDescriptor(dialog, 'on' + type);
  dialog.dispatchEvent(event);
  if (handler && typeof handler.value === 'function') {
    if (handler.value.call(dialog, event) === false && cancelable) event.preventDefault();
  }
  return !event.defaultPrevented;
}

export function showDialog(dialog) {
  if (typeof dialog.showModal === 'function') { dialog.showModal(); return dialog; }
  if (dialog.hasAttribute('open')) return dialog;
  if (!dialog.isConnected) document.body.append(dialog);

  const prior = document.activeElement;
  const attributes = ['role','aria-modal','tabindex'].map(name => [name,dialog.getAttribute(name)]);
  const oldClose = Object.getOwnPropertyDescriptor(dialog, 'close');
  const background = document.createElement('div');
  background.className = 'dialog-fallback-backdrop';
  background.setAttribute('aria-hidden','true');
  const hiddenSiblings = Array.from(document.body.children)
    .filter(element => element !== dialog && !['SCRIPT','STYLE','LINK'].includes(element.tagName))
    .map(element => [element,element.getAttribute('aria-hidden')]);
  hiddenSiblings.forEach(([element]) => element.setAttribute('aria-hidden','true'));

  if (!fallbackDialogs.length) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('dialog-fallback-open');
  }
  const depth = fallbackDialogs.length;
  background.style.zIndex = String(10000 + depth * 2);
  const previousZIndex = dialog.style.zIndex;
  dialog.style.zIndex = String(10001 + depth * 2);
  document.body.insertBefore(background, dialog);
  fallbackDialogs.push(dialog);
  dialog.classList.add('dialog-fallback');
  dialog.setAttribute('role','dialog');
  dialog.setAttribute('aria-modal','true');
  if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex','-1');
  dialog.setAttribute('open','');
  if (typeof dialog.returnValue !== 'string') dialog.returnValue = '';
  let closed = false;
  const isTop = () => fallbackDialogs[fallbackDialogs.length - 1] === dialog;
  const focusInside = () => focus(dialog.querySelector('[autofocus]') || focusable(dialog)[0] || dialog);
  const onFocus = event => { if (isTop() && !dialog.contains(event.target)) focusInside(); };
  const onKey = event => {
    if (!isTop()) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (dispatch(dialog,'cancel',true)) dialog.close();
    } else if (event.key === 'Tab') {
      const targets = focusable(dialog), index = targets.indexOf(document.activeElement);
      if (!targets.length) { event.preventDefault(); focus(dialog); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); focus(targets[targets.length-1]); }
      else if (!event.shiftKey && (index < 0 || index === targets.length-1)) { event.preventDefault(); focus(targets[0]); }
    }
  };
  const stopBackgroundScroll = event => { if (isTop() && !dialog.contains(event.target)) event.preventDefault(); };
  const cleanup = restoreFocus => {
    if (closed) return false;
    closed = true;
    observer.disconnect();
    document.removeEventListener('keydown',onKey,true);
    document.removeEventListener('focusin',onFocus,true);
    document.removeEventListener('touchmove',stopBackgroundScroll);
    background.remove();
    dialog.removeAttribute('open');
    dialog.style.zIndex = previousZIndex;
    const index = fallbackDialogs.indexOf(dialog);
    if (index >= 0) fallbackDialogs.splice(index,1);
    hiddenSiblings.forEach(([element,value]) => restoreAttribute(element,'aria-hidden',value));
    attributes.forEach(([name,value]) => restoreAttribute(dialog,name,value));
    if (oldClose) Object.defineProperty(dialog,'close',oldClose);
    else delete dialog.close;
    if (!fallbackDialogs.length) {
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove('dialog-fallback-open');
    }
    if (restoreFocus) focus(prior);
    return true;
  };
  // Existing callers use close(), addEventListener('close') and onclose.
  dialog.close = function(returnValue) {
    if (returnValue !== undefined) dialog.returnValue = String(returnValue);
    if (cleanup(true)) dispatch(dialog,'close');
  };
  const observer = new MutationObserver(() => { if (!dialog.isConnected) cleanup(true); });
  observer.observe(document.body,{childList:true});
  document.addEventListener('keydown',onKey,true);
  document.addEventListener('focusin',onFocus,true);
  document.addEventListener('touchmove',stopBackgroundScroll,{passive:false});
  focusInside();
  return dialog;
}
