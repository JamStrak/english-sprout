// A separate channel keeps the looping garden track out of narration and mic sessions.
export const GARDEN_MUSIC_VOLUME = 0.5;
export const GARDEN_MUSIC_FILE = 'xiaoya/audio/v3/garden-piano.mp3';
export function createGardenMusic({
  createAudio = () => new Audio(new URL(GARDEN_MUSIC_FILE, document.baseURI).href),
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  let player = null, active = false, target = 0, timer = null, pending = false, blocked = false;
  function play() {
    if (!active || pending || blocked) return;
    try {
      if (!player) {
        player = createAudio(); player.loop = true; player.preload = 'auto'; player.volume = 0;
      }
      if (!player.paused) return;
      pending = true;
      Promise.resolve(player.play()).catch(() => {
        // Autoplay can be blocked after a restart. The next real gesture retries;
        // optional background music must not show a voice-playback error toast.
        blocked = true;
      }).finally(() => {
        pending = false;
        if (!active && player.volume === 0) player.pause();
      });
    } catch { pending = false; blocked = true; }
  }
  function ramp(volume, immediate) {
    if (!player) return;
    if (target === volume && !immediate) return;
    clearTimer(timer); timer = null; target = volume;
    const from = player.volume, start = now(), duration = immediate ? 0 : volume === 0.12 ? 120 : 300;
    function step() {
      const progress = duration ? Math.min(1, (now() - start) / duration) : 1;
      player.volume = Math.max(0, Math.min(GARDEN_MUSIC_VOLUME, from + (volume - from) * progress));
      if (progress < 1) timer = setTimer(step, 16);
      else { timer = null; if (!active && volume === 0) player.pause(); }
    }
    step();
  }
  return {
    setState({active: next, ducked = false, immediate = false}) {
      if (next && !active) blocked = false;
      active = Boolean(next);
      if (active) play();
      ramp(active ? ducked ? 0.12 : GARDEN_MUSIC_VOLUME : 0, immediate);
    },
    retry() { if (active) { blocked = false; play(); } },
  };
}
