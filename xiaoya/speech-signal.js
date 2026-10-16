// Local capture conditioning. This detects usable sound, not words or mastery.
// Keep the complete clip (including its first syllable); never trim by a gate.
export function prepareSamples(buffer) {
  const rate = 16000, channels = buffer.numberOfChannels || 1;
  const length = Math.round(buffer.length * rate / buffer.sampleRate);
  const samples = new Float32Array(length);
  const input = Array.from({length:channels}, (_, i) => buffer.getChannelData(i));
  let mean = 0;
  for (let i = 0; i < length; i++) {
    // Average each source interval when downsampling, instead of dropping most
    // samples. Interpolate only when a recording has a lower source rate.
    const start = i * buffer.sampleRate / rate, end = (i + 1) * buffer.sampleRate / rate;
    let value = 0;
    for (const channel of input) {
      if (buffer.sampleRate > rate) {
        let sum = 0;
        for (let k = Math.floor(start); k < Math.ceil(end); k++) {
          const weight = Math.max(0, Math.min(end, k + 1) - Math.max(start, k));
          sum += (channel[Math.min(k, buffer.length - 1)] || 0) * weight;
        }
        value += sum / (end - start) / channels;
      } else {
        const left = Math.floor(start), fraction = start - left;
        value += ((channel[left] || 0) * (1 - fraction) + (channel[Math.min(left + 1, buffer.length - 1)] || 0) * fraction) / channels;
      }
    }
    samples[i] = Number.isFinite(value) ? value : 0; mean += samples[i];
  }
  mean /= Math.max(1, length);
  let peak = 0, energy = 0;
  const frames = [];
  for (let offset = 0; offset < length; offset += 640) {
    const end = Math.min(length, offset + 640); let sum = 0;
    for (let i = offset; i < end; i++) {
      samples[i] -= mean;
      peak = Math.max(peak, Math.abs(samples[i]));
      sum += samples[i] * samples[i];
    }
    energy += sum; frames.push({rms:Math.sqrt(sum / (end - offset)),ms:(end-offset)/16});
  }
  const sorted = frames.map(frame => frame.rms).sort((a,b) => a-b);
  const percentile = p => sorted[Math.min(sorted.length-1, Math.floor(sorted.length*p))] || 0;
  const noiseFloor = percentile(.2), high = percentile(.98);
  const threshold = Math.max(.00035, noiseFloor * 2.2);
  const voicedMs = frames.reduce((sum,frame) => sum + (frame.rms > threshold ? frame.ms : 0), 0);
  const rms = Math.sqrt(energy / Math.max(1,length));
  // A fixed .022 gate excluded intelligible quiet speech. Use envelope contrast
  // and a much lower floor; reject stationary noise before Whisper can invent
  // words. No reference phrase is used here or in the model decoder.
  const silent = peak < .001 || rms < .00015;
  const stationary = high <= Math.max(.00035, noiseFloor * 1.65);
  const hasVoice = !silent && !stationary && voicedMs >= 120;
  const status = silent ? 'silence' : !hasVoice ? 'noise' : peak < .08 ? 'quiet' : 'ready';
  const gain = hasVoice ? Math.max(1, Math.min(16, .85 / Math.max(.001,peak))) : 1;
  if (gain > 1) for (let i=0;i<length;i++) samples[i] *= gain;
  return {samples,quality:{hasVoice,status,peak,rms,voicedMs,duration:length/rate,gain,noiseFloor}};
}
