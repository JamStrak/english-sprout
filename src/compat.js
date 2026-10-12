/** Small local helpers for iPads without the newer JavaScript built-ins. */
export function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function last(items) {
  return items[items.length - 1];
}

/** Progress is validated JSON data; keep copies independent without structuredClone. */
export function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}
