// A separate channel keeps the looping garden track out of narration and mic sessions.
export const GARDEN_MUSIC_VOLUME = 0.5;
export const GARDEN_MUSIC_FILE = 'xiaoya/audio/v3/garden-piano.mp3';
export function gardenMusicSettings(value) {
  return {enabled: value?.enabled !== false, volume: typeof value?.volume === 'number' && Number.isFinite(value.volume)
    ? Math.max(0, Math.min(1, value.volume)) : GARDEN_MUSIC_VOLUME};
}

// Slider percentages describe listening level, not raw waveform amplitude. A
// quadratic curve gives the low end useful range with this near-full-scale MP3:
// 5% -> .0025 (-52 dB), 50% -> .25 (-12 dB), 100% -> original amplitude.
// Keep stored preferences unchanged; garden and GM previews share this mapping.
export function gardenMusicGain(volume) {
  const level = gardenMusicSettings({volume}).volume;
  return level * level;
}
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
  function ramp(volume, immediate, ducked) {
    if (!player) return;
    if (target === volume && !immediate) return;
    clearTimer(timer); timer = null; target = volume;
    const from = player.volume, start = now(), duration = immediate ? 0 : ducked ? 120 : 300;
    function step() {
      const progress = duration ? Math.min(1, (now() - start) / duration) : 1;
      player.volume = progress === 1 ? volume : Math.max(0, Math.min(1, from + (volume - from) * progress));
      if (progress < 1) timer = setTimer(step, 16);
      else { timer = null; if (!active && volume === 0) player.pause(); }
    }
    step();
  }
  return {
    setState({active: next, ducked = false, immediate = false, volume = GARDEN_MUSIC_VOLUME, enabled = true}) {
      const settings = gardenMusicSettings({volume, enabled});
      next = Boolean(next && settings.enabled && settings.volume > 0);
      if (next && !active) blocked = false;
      active = Boolean(next);
      if (active) play();
    const gain = gardenMusicGain(settings.volume);
      ramp(active ? ducked ? Math.min(0.12, gain * 0.24) : gain : 0, immediate, ducked);
    },
    retry() { if (active) { blocked = false; play(); } },
    status() { return {playing: Boolean(player && !player.paused && !pending), blocked}; },
  };
}
