/** Word matching from a local speech transcript, never a pronunciation score. */
const CONTRACTIONS = Object.freeze({
  "i'm":"i am", "you're":"you are", "we're":"we are", "they're":"they are",
  "it's":"it is", "that's":"that is", "what's":"what is", "where's":"where is",
  "here's":"here is", "he's":"he is", "she's":"she is", "let's":"let us",
  "don't":"do not", "doesn't":"does not", "didn't":"did not", "can't":"can not",
  "cannot":"can not", "won't":"will not", "isn't":"is not", "aren't":"are not",
  "i'll":"i will", "you'll":"you will", "we'll":"we will", "i've":"i have",
  "you've":"you have", "we've":"we have", "i'd":"i would"
});

export function speechWords(value) {
  if(typeof value!=='string')return [];
  return value.toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z'\s]/g,' ')
    .split(/\s+/).filter(Boolean).flatMap(word=>
      Object.prototype.hasOwnProperty.call(CONTRACTIONS,word)?CONTRACTIONS[word].split(' '):[word.replace(/^'+|'+$/g,'')]
    ).filter(word=>word&&word!=='um'&&word!=='uh').slice(0,100);
}

export function scoreSpeech(expected,heard) {
  const target=speechWords(expected), actual=speechWords(heard);
  // Ordered matching penalizes missing, reordered and inserted words. One shared
  // word, silence, and a long unrelated sentence must never award a pass.
  let previous=new Array(actual.length+1).fill(0);
  for(const word of target){
    const next=[0];
    for(let j=1;j<=actual.length;j++)next[j]=word===actual[j-1]?previous[j-1]+1:Math.max(previous[j],next[j-1]);
    previous=next;
  }
  const matchedWords=previous[actual.length]||0;
  const coverage=target.length?matchedWords/target.length:0;
  const precision=actual.length?matchedWords/actual.length:0;
  const required=target.length<=4?target.length:Math.ceil(target.length*.8);
  const matched=target.length>0&&matchedWords>=required&&precision>=.8;
  const stars=matched?3:coverage>=.5&&precision>=.5?2:actual.length?1:0;
  return {matched,stars,coverage,precision,heard:typeof heard==='string'?heard.trim().slice(0,500):'',matchedWords,expectedWords:target.length};
}
