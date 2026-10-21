export const GUIDANCE_KEY = 'xiaoya-english:guidance:v1';

export function audioControls(input) {
  return {music: input?.music !== false, reminders: input?.reminders !== false};
}

/** Stores only onboarding familiarity; callers own learning evidence and audio playback. */
export function createGuidancePolicy({storage, returning = false} = {}) {
  let saved = null;
  try {
    const value = JSON.parse(storage?.getItem(GUIDANCE_KEY) || 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
  } catch { /* A denied or broken store must not interrupt the child's session. */ }

  const firstSession = saved?.visited !== true && !returning;
  const seen = new Set(Array.isArray(saved?.seen)
    ? saved.seen.filter(key => typeof key === 'string' && key.length > 0)
    : []);

  function persist() {
    try { storage?.setItem(GUIDANCE_KEY, JSON.stringify({visited: true, seen: [...seen]})); }
    catch { /* The in-memory set still suppresses repeated prompts this session. */ }
  }
  // Mark a visit at entry, so refresh does not replay the novice walkthrough.
  persist();

  return {
    allow(key, {manual = false, idle = false, enabled = true} = {}) {
      if (manual) return true;
      if (!enabled) return false;
      if (idle) return true;
      if (!firstSession || typeof key !== 'string' || !key || seen.has(key)) return false;
      seen.add(key);
      persist();
      return true;
    },
    status: () => ({firstSession, seen: [...seen]}),
  };
}
