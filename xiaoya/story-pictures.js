// A missing picture is an explicit recoverable resource error, never a reason
// to show a different illustration. Audio and the current teaching beat survive.
export function pictureFor(story,{frame=story.cueFrame,alternate=false,phase='request'}={},baseUrl){
  const intro=!alternate&&story.introFrame!=null&&frame===story.introFrame;
  const image=alternate?story.alternateImages?.[phase==='resolved'?'resolved':'request']:intro?story.introImage:story.image;
  if(!image)return null;
  return {url:new URL(`xiaoya/stories/${image}`,baseUrl).href,layout:alternate||intro?'single':story.imageLayout==='single'?'single':'grid',frame};
}

// Only this beat and its immediate successor are useful preloads. In
// particular, entering a story must not download every alternate or lesson.
export function pictureSequence(story,options={},baseUrl){
  const current=pictureFor(story,options,baseUrl),nextOptions=[];
  if(options.alternate&&options.phase!=='resolved')nextOptions.push({...options,phase:'resolved'});
  else if(options.phase==='story'){
    const frames=story.teachingFrames||[],index=frames.indexOf(options.frame);
    if(index>=0&&index+1<frames.length)nextOptions.push({...options,frame:frames[index+1]});
  }
  const pictures=[current,...nextOptions.map(next=>pictureFor(story,next,baseUrl))].filter(Boolean);
  return pictures.filter((picture,index)=>pictures.findIndex(other=>other.url===picture.url)===index);
}

export function createPictureLoader({createImage=()=>new Image(),timeoutMs=3000,setTimer=setTimeout,clearTimer=clearTimeout,onChange=()=>{},persist=()=>{}}={}){
  const entries=new Map();
  const status=url=>entries.get(url)?.status||'idle';
  function load(url,{retry=false}={}){
    if(!url)return Promise.resolve('missing');
    const previous=entries.get(url);
    if(retry&&previous&&['failed','slow'].includes(previous.status)){
      previous.cancel?.();entries.delete(url);
    }
    if(entries.has(url))return entries.get(url).promise;
    const entry={status:'pending',promise:null};
    entries.set(url,entry);
    entry.promise=new Promise(resolve=>{
      let picture,timer,settled=false;
      const finish=next=>{
        if(settled||entries.get(url)!==entry)return;
        settled=true;clearTimer(timer);
        if(picture){picture.onload=null;picture.onerror=null;}
        entry.status=next;resolve(next);onChange(url,next);
        // Offline persistence is independent of the visible decode. Storage
        // quota or a cache write failure cannot hide a successfully loaded image.
        if(next==='ready')Promise.resolve().then(()=>persist(url)).catch(()=>{});
      };
      // A slow download is still useful. Release callers at the deadline but
      // keep native load handlers so it may replace the placeholder when ready.
      timer=setTimer(()=>{clearTimer(timer);entry.status='slow';resolve('slow');onChange(url,'slow');},timeoutMs);
      entry.cancel=()=>{settled=true;clearTimer(timer);if(picture){picture.onload=null;picture.onerror=null;}resolve('cancelled');};
      try{picture=createImage();picture.onload=()=>finish('ready');picture.onerror=()=>finish('failed');picture.src=url;}
      catch{finish('failed');}
    });
    return entry.promise;
  }
  return {status,load};
}
