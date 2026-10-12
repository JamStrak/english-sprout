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

export function startAutomaticUpdates({build,isSafe,onUnavailable=()=>{}}){
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  const workers=navigator.serviceWorker;
  const gate=createUpdateGate({isSafe,reload:()=>location.reload()});
  let registration=null,lastCheck=-Infinity,checking=false;
  function readBuild(worker){
    return new Promise(resolve=>{
      const channel=new MessageChannel();let settled=false;
      const finish=value=>{if(settled)return;settled=true;clearTimeout(timeout);channel.port1.close();channel.port2.close();resolve(value);};
      const timeout=setTimeout(()=>finish(null),3000);
      channel.port1.onmessage=event=>finish(event.data?.type==='APP_BUILD'?event.data.build:null);
      try{worker.postMessage('GET_BUILD',[channel.port2]);}catch{finish(null);}
    });
  }
  async function inspectController(){
    const controller=workers.controller;if(!controller||! /^[a-f0-9]{12}$/.test(build||''))return;
    const activeBuild=await readBuild(controller);
    if(workers.controller!==controller||! /^[a-f0-9]{12}$/.test(activeBuild||''))return;
    if(activeBuild===build)gate.cancel();else gate.request();
  }
  async function check(){
    if(!registration||checking||navigator.onLine===false||document.hidden||performance.now()-lastCheck<60000)return;
    checking=true;lastCheck=performance.now();
    try{await registration.update();}catch{} // Offline or failed installs keep the working version.
    finally{checking=false;inspectController();}
  }
  workers.addEventListener('controllerchange',inspectController);
  window.addEventListener('online',check);
  window.addEventListener('focus',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){inspectController();check();}});
  workers.register('./sw.js',{updateViaCache:'none'}).then(reg=>{
    registration=reg;inspectController();check();
  }).catch(onUnavailable);
}
