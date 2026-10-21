/** Pure, root-anchored motion sampling shared by the internal tuning controls. */
export const MOTION_LIMITS = Object.freeze({
  duration:[700,2400], sway:[0,18], flex:[0,100], bounce:[0,24], crossfade:[120,600], particles:[0,100],
});
export const MOTION_PRESETS = Object.freeze({
  gentle:Object.freeze({duration:1700,sway:6,flex:70,bounce:8,crossfade:380,particles:45}),
  playful:Object.freeze({duration:1400,sway:10,flex:60,bounce:14,crossfade:300,particles:80}),
  bouncy:Object.freeze({duration:1200,sway:15,flex:80,bounce:21,crossfade:240,particles:100}),
});
export const MOTION_DEFAULTS = MOTION_PRESETS.playful;
const clamp = (v, min=0, max=1) => Math.min(max,Math.max(min,v));
const smooth = v => {const t=clamp(v);return t*t*(3-2*t);};
export const crossfadeLimit = duration => Math.min(MOTION_LIMITS.crossfade[1], Math.floor(duration/20)*10);

export function motionConfig(value) {
  const input=value && typeof value==='object' && !Array.isArray(value)?value:{};
  const result = Object.fromEntries(Object.entries(MOTION_LIMITS).map(([key,[min,max]])=>{
    const raw=input[key], n=(typeof raw==='number'||(typeof raw==='string'&&raw.trim()))?Number(raw):NaN;
    return [key,Number.isFinite(n)?clamp(Math.round(n),min,max):MOTION_DEFAULTS[key]];
  }));
  result.crossfade=Math.min(result.crossfade,crossfadeLimit(result.duration));
  return result;
}

/** Old/new artwork use the same transform and pivot throughout the crossfade. */
export function motionFrame(progress, fromScale, toScale, options=MOTION_DEFAULTS, reduced=false) {
  const t=clamp(Number.isFinite(progress)?progress:0), m=motionConfig(options);
  if(reduced) return {phase:t===1?'idle':'grow',scale:fromScale+(toScale-fromScale)*smooth(t),angle:0,bend:0,stretch:1,mix:smooth(t),drop:0,impact:0,spark:0,t};
  const grow=clamp((t-.48)/.52), mix=smooth((t-.48)/(m.crossfade/m.duration));
  const sway=clamp((t-.17)/.83), envelope=Math.sin(Math.PI*sway)*Math.exp(-2.1*sway);
  const wave=sway*Math.PI*(4.6-m.flex/160);
  const angle=m.sway*Math.sin(wave)*envelope;
  // A delayed shear and tiny squash make the tip follow the stem instead of a rigid swing.
  const bend=m.sway*m.flex/100*.55*Math.sin(wave-.8)*envelope;
  const pop=m.bounce/100*Math.sin(Math.PI*grow)*Math.exp(-1.5*grow);
  const scale=(fromScale+(toScale-fromScale)*smooth(grow))*(1+pop);
  const impact=clamp((t-.17)/.25), spark=clamp((t-.52)/.48);
  return {phase:t===1?'idle':t<.17?'drop':t<.48?'sway':t<.8?'grow':'settle',
    scale,angle:t===1?0:angle,bend:t===1?0:bend,stretch:1-.035*Math.sin(Math.PI*impact)+pop*.16,
    mix,drop:clamp(t/.17),impact,spark,t};
}
