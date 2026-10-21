export const GUIDANCE_IDLE_MS = 60000;

/** A single idle reminder clock. Rendering may schedule it without postponing it. */
export function createGuidanceClock({
  delay = GUIDANCE_IDLE_MS,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onDue = () => {},
} = {}) {
  const interval = Number.isFinite(delay) && delay > 0 ? delay : GUIDANCE_IDLE_MS;
  let lastActivity = now(), timer = null, generation = 0, timerGeneration = 0;
  let paused = false, stopped = false, pending = null;

  function clearScheduled() {
    timerGeneration++;
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function invalidate() {
    generation++;
    clearScheduled();
    pending = null;
  }

  function complete(token) {
    if (token !== generation || paused || stopped) return;
    pending = null;
    // Count the next quiet interval from the end of this reminder, not its start.
    lastActivity = now();
    schedule();
  }

  function schedule() {
    if (paused || stopped || pending !== null) return;
    clearScheduled();
    const token = generation, scheduledToken = timerGeneration;
    timer = setTimer(() => {
      // A canceled callback may already be queued; it must not clear its replacement.
      if (scheduledToken !== timerGeneration || token !== generation || paused || stopped) return;
      timer = null;
      // A clock adjustment or an early timer must not shorten the idle period.
      if (now() < lastActivity + interval) {
        schedule();
        return;
      }
      pending = token;
      try {
        const result = onDue();
        if (result && typeof result.then === 'function') {
          Promise.resolve(result).then(() => complete(token), () => complete(token));
        } else {
          complete(token);
        }
      } catch {
        // Playback failures should not create a retry loop or an unhandled rejection.
        complete(token);
      }
    }, Math.max(0, lastActivity + interval - now()));
  }

  function activity() {
    if (stopped) return;
    invalidate();
    lastActivity = now();
    schedule();
  }

  function pause() {
    if (stopped) return;
    invalidate();
    paused = true;
  }

  function resume() {
    if (stopped) return;
    invalidate();
    paused = false;
    lastActivity = now();
    schedule();
  }

  function stop() {
    invalidate();
    stopped = true;
  }

  return {
    activity, pause, resume, schedule, stop,
    status: () => ({
      paused, stopped, pending: pending !== null,
      scheduled: timer !== null,
      lastActivity,
      nextDue: timer !== null ? lastActivity + interval : null,
      delay: interval,
    }),
  };
}
