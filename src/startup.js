// iPadOS 15.1 predates dynamic viewport units; its toolbar can overlap 100vh.
export function installViewportFallback(host=globalThis.window){
  if(!host||host.CSS?.supports?.('height','100dvh'))return()=>{};
  const update=()=>{
    host.document.documentElement.style.setProperty('--app-vh',host.innerHeight/100+'px');
    host.document.documentElement.style.setProperty('--app-viewport-height',host.innerHeight+'px');
  };
  update();host.addEventListener('resize',update);host.addEventListener('orientationchange',update);
  return()=>{host.removeEventListener('resize',update);host.removeEventListener('orientationchange',update);};
}

// The published page carries its matching course data; no extra request gates entry.
export function parseCurriculum(text){
  const data=JSON.parse(text);
  if(!Array.isArray(data?.themes)||!data.themes.length||!Array.isArray(data?.lessons)||!data.lessons.length)throw new Error('Invalid curriculum');
  const themes=new Set(data.themes.map(theme=>theme?.id));
  if(themes.size!==data.themes.length||data.themes.some(theme=>typeof theme.id!=='string'||typeof theme.name!=='string'))throw new Error('Invalid themes');
  const ids=new Set();
  for(const lesson of data.lessons){
    if(typeof lesson?.id!=='string'||!lesson.id||ids.has(lesson.id)||!themes.has(lesson.theme)||typeof lesson.english!=='string'||typeof lesson.chinese!=='string'||!/^audio\/[a-z0-9-]+\.mp3$/.test(lesson.audio)||!Array.isArray(lesson.choices)||!lesson.choices.length||!Number.isInteger(lesson.answerIndex)||!lesson.choices[lesson.answerIndex]||lesson.choices.some(choice=>typeof choice?.label!=='string'))throw new Error('Invalid lesson');
    ids.add(lesson.id);
  }
  return data;
}

// JSON inside HTML must not be able to end its non-executable script element.
export function serializeCurriculum(text){
  return JSON.stringify(parseCurriculum(text)).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}

export async function loadCurriculum({embedded=globalThis.document?.querySelector('#curriculum-data')?.textContent,fetcher=globalThis.fetch,attempts=3,timeout=5000,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  if(embedded){try{return parseCurriculum(embedded);}catch{}}
  // Retain raw-source/older-page support, with bounded automatic retries.
  let failure;
  for(let attempt=0;attempt<attempts;attempt++){
    const controller=new AbortController();let timer;
    try{
      return await Promise.race([
        (async()=>{
          const response=await fetcher('./data/curriculum.json',{signal:controller.signal,cache:'no-cache'});
          if(!response.ok)throw new Error('Course request failed: '+response.status);
          return parseCurriculum(await response.text());
        })(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Course request timed out'));},timeout);}),
      ]);
    }catch(error){failure=error;}
    finally{clearTimeout(timer);}
    if(attempt+1<attempts)await wait(400*(attempt+1));
  }
  throw failure||new Error('Course unavailable');
}
