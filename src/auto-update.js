// Download updates in the background; reload only at an idle point in this tab.
export function createUpdateGate({isSafe,reload,timers=globalThis,delay=1500}) {
  let pending=false,done=false,timer=null,safeSince=null;
  function tick(){
    timer=null;if(!pending||done)return;
    if(isSafe()){
      if(safeSince===null)safeSince=timers.performance.now();
      if(timers.performance.now()-safeSince>=delay){done=true;reload();return;}
    }else safeSince=null;
    timer=timers.setTimeout(tick,250);
  }
  return {
    request(){if(done||pending)return;pending=true;tick();},
    cancel(){pending=false;safeSince=null;if(timer!==null)timers.clearTimeout(timer);timer=null;},
  };
}

export function startAutomaticUpdates({build,isSafe,onUnavailable=()=>{},onState=()=>{}}){
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return ()=>{};
  const valid=value=>/^[a-f0-9]{12}$/.test(value||'');
  const workers=navigator.serviceWorker;
  let repairingStyles=false;
  const gate=createUpdateGate({isSafe,reload:()=>{
    if(repairingStyles)try{const history=globalThis.history;history.replaceState({...history.state,sproutStyleRecovery:build},'');}catch{}
    location.reload();
  }});
  let registration=null,lastCheck=-Infinity,checking=false,stopped=false,timer=null;
  let targetBuild=null,targetVersion=null,retrySoon=false,updatePromise=null,manifestAbort=null,registrationPromise=null,manifestFresh=false,checkFailed=false,unavailableNotified=false;
  const deadlines=new Map(),channels=new Set();
  function state(value,extra={}){
    if(stopped)return;
    try{onState({state:value,build,targetBuild,version:targetVersion,...extra});}catch{}
  }
  function available(){return !stopped&&!document.hidden&&navigator.onLine!==false;}
  function deadline(promise,ms){
    return new Promise((resolve,reject)=>{
      const id=setTimeout(()=>{deadlines.delete(id);reject(new Error('Update check timed out'));},ms);
      deadlines.set(id,()=>reject(new Error('Update check cancelled')));
      Promise.resolve(promise).then(value=>{clearTimeout(id);deadlines.delete(id);resolve(value);},error=>{clearTimeout(id);deadlines.delete(id);reject(error);});
    });
  }
  function readBuild(worker){
    return new Promise(resolve=>{
      const channel=new MessageChannel();let settled=false;
      const finish=value=>{if(settled)return;settled=true;clearTimeout(timeout);deadlines.delete(timeout);channels.delete(channel);channel.port1.close();channel.port2.close();resolve(value);};
      const timeout=setTimeout(()=>finish(null),3000);deadlines.set(timeout,()=>finish(null));channels.add(channel);
      channel.port1.onmessage=event=>finish(event.data?.type==='APP_BUILD'?event.data.build:null);
      try{worker.postMessage('GET_BUILD',[channel.port2]);}catch{finish(null);}
    });
  }
  async function inspectController(changed=false){
    const controller=workers.controller;
    if(stopped||!controller||!valid(build))return;
    const activeBuild=await readBuild(controller);
    if(stopped||workers.controller!==controller||!valid(activeBuild))return;
    if(activeBuild===build){
      // HTML/JS may already be current while an initial stylesheet failed.
      // Once the complete verified cache is ready, recover at the same safe
      // point instead of labelling a half-styled page current indefinitely.
      const styles=typeof document.querySelectorAll==='function'?[...document.querySelectorAll('link[rel="stylesheet"]')]:[];
      // Chromium may create an empty CSSStyleSheet even for HTTP 503/CSP
      // failure. Every bundled stylesheet has rules; object presence alone
      // cannot establish that the visual feedback actually loaded.
      const missingStyles=styles.some(link=>{try{return !link.sheet||link.sheet.cssRules.length===0;}catch{return true;}});
      if(missingStyles){
        retrySoon=true;
        // Persist across this same-document reload. A permanently blocked
        // stylesheet must not turn recovery into an endless navigation loop.
        if(globalThis.history?.state?.sproutStyleRecovery===build){gate.cancel();state('preparing',{error:'stylesheet-blocked'});return;}
        repairingStyles=true;state('waiting');gate.request();return;
      }
      repairingStyles=false;
      if(globalThis.history?.state?.sproutStyleRecovery===build)try{const {sproutStyleRecovery,...rest}=history.state;history.replaceState(rest,'');}catch{}
      gate.cancel();
      try{controller.postMessage('PRUNE_RELEASES');}catch{}
      if(targetBuild&&targetBuild!==build){retrySoon=true;state('preparing');}
      else if(navigator.onLine===false)state('offline');
      else if(targetBuild===build&&manifestFresh&&!checkFailed)state('current');
      return;
    }
    // A freshly loaded release can still be controlled by the previous worker.
    // Do not send that fresh page backwards to the worker's old cached HTML.
    if(targetBuild===build||(targetBuild&&activeBuild!==targetBuild)){
      gate.cancel();retrySoon=true;state('preparing');return;
    }
    if(targetBuild===activeBuild||changed){state('waiting');gate.request();}
  }
  async function manifest(){
    const controller=new AbortController();manifestAbort=controller;
    try{
      const url=new URL('./version.json',location.href);url.searchParams.set('check',`${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const value=await deadline(fetch(url,{cache:'no-store',signal:controller.signal}).then(response=>{
        if(!response.ok)throw new Error('Release manifest unavailable');
        return response.json();
      }),8000);
      if(!valid(value?.build))throw new Error('Invalid release manifest');
      targetBuild=value.build;targetVersion=typeof value.version==='string'?value.version:null;
      manifestFresh=true;retrySoon=targetBuild!==build;
    }finally{controller.abort();if(manifestAbort===controller)manifestAbort=null;}
  }
  function schedule(){
    clearTimeout(timer);
    if(!stopped)timer=setTimeout(()=>{timer=null;check(false);},retrySoon?5000:15000);
  }
  async function updateWorker(){
    // registration.update() has no AbortSignal. Reuse a pending native check
    // after our deadline rather than creating an unbounded pile of requests.
    if(!updatePromise){
      const pending=Promise.resolve().then(()=>registration.update());
      updatePromise=pending;
      pending.then(()=>{if(updatePromise===pending)updatePromise=null;},()=>{if(updatePromise===pending)updatePromise=null;});
    }
    await deadline(updatePromise,8000);
  }
  async function ensureRegistration(){
    if(registration)return;
    if(!registrationPromise){
      const pending=Promise.resolve().then(()=>workers.register('./sw.js',{updateViaCache:'none'}));
      registrationPromise=pending;
      pending.then(()=>{if(registrationPromise===pending)registrationPromise=null;},()=>{if(registrationPromise===pending)registrationPromise=null;});
    }
    registration=await deadline(registrationPromise,8000);
  }
  async function activateWaiting(){
    const waiting=registration?.waiting;if(!waiting||stopped)return;
    const waitingBuild=await readBuild(waiting);
    // An installed worker has finished its integrity-checked install. Some
    // offline/reconnect sequences still leave it waiting despite skipWaiting.
    if(!stopped&&registration.waiting===waiting&&valid(waitingBuild)&&waitingBuild===targetBuild){
      try{waiting.postMessage('ACTIVATE_UPDATE');}catch{}
    }
  }
  async function check(force=false){
    if(stopped)return;
    if(!available()){if(navigator.onLine===false)state('offline');schedule();return;}
    const elapsed=performance.now()-lastCheck;
    if(checking||elapsed<(force?1000:(retrySoon?5000:15000))){schedule();return;}
    checking=true;lastCheck=performance.now();manifestFresh=false;checkFailed=false;state('checking');
    try{
      await manifest();
      if(stopped)return;
      if(targetBuild!==build)state('preparing');
      await ensureRegistration();
      if(stopped)return;
      await activateWaiting();
      await updateWorker();
      await activateWaiting();
      await inspectController();
    }catch(error){
      if(!stopped){
        retrySoon=true;checkFailed=true;state(navigator.onLine===false?'offline':'preparing',{error:'retrying'});
        if(!registration&&!unavailableNotified){unavailableNotified=true;try{onUnavailable(error);}catch{}}
        await activateWaiting();
        await inspectController();
      }
    }finally{checking=false;schedule();}
  }
  const attention=()=>check(true);
  const visibility=()=>{if(!document.hidden){inspectController();check(true);}};
  const changed=()=>inspectController(true);
  const message=event=>{
    if(event.data==='GET_PAGE_BUILD'||event.data?.type==='GET_PAGE_BUILD'){
      try{event.ports?.[0]?.postMessage({type:'APP_PAGE_BUILD',build});}catch{}
    }
  };
  const pagehide=event=>{if(!event.persisted)cleanup();};
  function cleanup(){
    if(stopped)return;stopped=true;clearTimeout(timer);gate.cancel();manifestAbort?.abort();
    for(const [id,cancel] of [...deadlines]){clearTimeout(id);cancel();}deadlines.clear();
    for(const channel of channels){channel.port1.close();channel.port2.close();}channels.clear();
    workers.removeEventListener('controllerchange',changed);workers.removeEventListener('message',message);
    window.removeEventListener('online',attention);window.removeEventListener('focus',attention);window.removeEventListener('pageshow',attention);window.removeEventListener('pagehide',pagehide);
    document.removeEventListener('visibilitychange',visibility);
  }
  workers.addEventListener('controllerchange',changed);workers.addEventListener('message',message);
  window.addEventListener('online',attention);window.addEventListener('focus',attention);window.addEventListener('pageshow',attention);window.addEventListener('pagehide',pagehide);
  document.addEventListener('visibilitychange',visibility);
  state(navigator.onLine===false?'offline':'checking');
  check(true);
  return cleanup;
}
