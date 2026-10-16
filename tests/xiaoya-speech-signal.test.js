import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSamples} from '../xiaoya/speech-signal.js';

function buffer(data, sampleRate=48000) {
  const channels=Array.isArray(data) ? data : [data];
  return {sampleRate,length:channels[0].length,numberOfChannels:channels.length,getChannelData:i=>channels[i]};
}
function utterance(gain=1, rate=48000) {
  return Float32Array.from({length:rate*2},(_,i)=>{
    const time=i/rate;
    if(time>.85 && time<1.2 || time>1.8) return 0;
    const envelope=.35+.65*Math.sin(time*13)**2;
    return gain*.18*envelope*(Math.sin(time*2*Math.PI*220)+.3*Math.sin(time*2*Math.PI*660));
  });
}
test('quiet speech stays usable across input rates, including its first syllable',()=>{
  for(const rate of [8000,16000,44100,48000]) for(const gain of [1,.12,.04]) {
    const {samples,quality}=prepareSamples(buffer(utterance(gain,rate),rate));
    assert.equal(samples.length,32000);
    assert.equal(quality.hasVoice,true,`${rate}Hz gain ${gain}`);
    assert.ok(quality.voicedMs>=120);
    assert.ok(samples.slice(0,640).some(x=>Math.abs(x)>.001),'No leading speech trimming');
    assert.ok(quality.gain<=16);
    assert.ok(samples.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));
  }
});
test('digital silence and DC offset cannot trigger invented recognition',()=>{
  for(const value of [0,.02,-.1]) {
    const {samples,quality}=prepareSamples(buffer(new Float32Array(48000).fill(value)));
    assert.equal(quality.hasVoice,false); assert.equal(quality.status,'silence');
    assert.ok(samples.every(x=>Math.abs(x)<.00001));
  }
});
test('steady seeded white noise is rejected rather than amplified into an answer',()=>{
  let seed=42;
  const noise=Float32Array.from({length:96000},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed/2**32-.5)*.12;});
  const {quality}=prepareSamples(buffer(noise));
  assert.equal(quality.hasVoice,false); assert.equal(quality.status,'noise'); assert.equal(quality.gain,1);
});
test('one transient click is insufficient and stereo capture is averaged',()=>{
  const click=new Float32Array(48000); click[200]=.8;
  assert.equal(prepareSamples(buffer(click)).quality.hasVoice,false);
  const speech=utterance(.04);
  const mono=prepareSamples(buffer(speech));
  const stereo=prepareSamples(buffer([speech,speech]));
  assert.deepEqual(stereo.samples,mono.samples);
  assert.equal(stereo.quality.hasVoice,true);
});
test('a short word followed by a long quiet tail is still considered usable sound',()=>{
  const recording=new Float32Array(48000*12);
  const word=utterance(.04).slice(0,48000*.5);
  recording.set(word);
  const {quality}=prepareSamples(buffer(recording));
  assert.equal(quality.hasVoice,true); assert.ok(quality.voicedMs>=400);
});
