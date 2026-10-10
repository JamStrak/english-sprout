export const AVATAR_STORAGE_KEY = 'english-sprout-avatar-v1';
export const MAX_AVATAR_BYTES = 200 * 1024;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const ANIMALS = Object.freeze([
  {id:'rabbit',name:'软软兔',color:'#ead6d2',background:'#f9e9dd'},
  {id:'cat',name:'奶糖猫',color:'#eabb78',background:'#f9edce'},
  {id:'bear',name:'抱抱熊',color:'#aa795d',background:'#e8efdf'},
  {id:'fox',name:'小橘狐',color:'#dc8960',background:'#f9e6d8'},
  {id:'panda',name:'糯米熊猫',color:'#fff9ec',background:'#e4eddf'},
  {id:'frog',name:'泡泡蛙',color:'#98b783',background:'#e7f0e1'},
]);
const DEFAULT_AVATAR = Object.freeze({version:1,kind:'preset',animal:'rabbit'});
const validAnimal = id => ANIMALS.some(animal => animal.id === id);
const byteLength = text => new TextEncoder().encode(text).length;
const PHOTO_TYPE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

export function validateAvatarRecord(value) {
  if (!value || value.version !== 1 || !validAnimal(value.animal)) return null;
  if (value.kind === 'preset') return {version:1,kind:'preset',animal:value.animal};
  if (value.kind !== 'photo' || typeof value.image !== 'string' || !PHOTO_TYPE.test(value.image)) return null;
  const record = {version:1,kind:'photo',animal:value.animal,image:value.image};
  return byteLength(JSON.stringify(record)) <= MAX_AVATAR_BYTES ? record : null;
}

function localStore() { try { return globalThis.localStorage; } catch { return null; } }
export function readAvatar(storage = localStore()) {
  try { return validateAvatarRecord(JSON.parse(storage?.getItem(AVATAR_STORAGE_KEY))) || {...DEFAULT_AVATAR}; }
  catch { return {...DEFAULT_AVATAR}; }
}
export function saveAvatar(record, storage = localStore()) {
  const clean = validateAvatarRecord(record);
  if (!clean) return {ok:false,message:'这张头像还不能保存，请重新选一张。'};
  try {
    if (!storage) throw new Error('Storage unavailable');
    storage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(clean));
    return {ok:true,avatar:clean};
  } catch { return {ok:false,message:'这台设备暂时存不下头像。原来的头像还在，请腾出一点空间后再试。'}; }
}
export function validatePhotoFile(file) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) return '请选择 JPG、PNG 或 WebP 照片。';
  if (!Number.isFinite(file.size) || file.size <= 0) return '这张照片是空的，请重新选择。';
  if (file.size > MAX_PHOTO_BYTES) return '照片有点大，请选择 10 MB 以内的照片。';
  return '';
}
export function cropGeometry(width, height, zoom = 1, x = 0, y = 0, diameter = 98) {
  if (![width,height,diameter].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid photo dimensions');
  const clamp = (n,min,max,fallback) => Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback;
  const scale = Math.max(diameter/width,diameter/height) * clamp(zoom,1,3,1);
  const w = width*scale, h = height*scale;
  return {width:w,height:h,x:100-w/2+clamp(x,-1,1,0)*(w-diameter)/2,y:113-h/2+clamp(y,-1,1,0)*(h-diameter)/2};
}

// The six original animal hoods share one face opening, so a local photo fits any hood.
export function animalSvg(id, frameOnly = false) {
  const animal = ANIMALS.find(item => item.id === id) || ANIMALS[0];
  const stroke = '#4b5146';
  const ears = {
    rabbit:'<ellipse cx="69" cy="36" rx="18" ry="31" fill="#ead6d2"/><ellipse cx="131" cy="36" rx="18" ry="31" fill="#ead6d2"/><ellipse cx="69" cy="34" rx="8" ry="21" fill="#d99e9d"/><ellipse cx="131" cy="34" rx="8" ry="21" fill="#d99e9d"/>',
    cat:'<path d="M38 69 37 21q24 2 40 23m46 0q16-21 40-23l-1 48" fill="#eabb78"/><path d="m47 48-1-13 18 13m72 0 18-13-1 13" fill="#d99781"/>',
    bear:'<circle cx="49" cy="52" r="25" fill="#aa795d"/><circle cx="151" cy="52" r="25" fill="#aa795d"/><circle cx="49" cy="52" r="13" fill="#deb797"/><circle cx="151" cy="52" r="13" fill="#deb797"/>',
    fox:'<path d="m32 77 7-59q28 7 43 36m36 0q15-29 43-36l7 59" fill="#dc8960"/><path d="m44 53 2-18 21 23m66 0 21-23 2 18" fill="#ffe4c6"/>',
    panda:'<circle cx="48" cy="48" r="25" fill="#4b5146"/><circle cx="152" cy="48" r="25" fill="#4b5146"/><circle cx="48" cy="48" r="12" fill="#7b8072"/><circle cx="152" cy="48" r="12" fill="#7b8072"/>',
    frog:'<circle cx="57" cy="45" r="28" fill="#98b783"/><circle cx="143" cy="45" r="28" fill="#98b783"/><circle cx="57" cy="42" r="17" fill="#fff9e7"/><circle cx="143" cy="42" r="17" fill="#fff9e7"/><ellipse cx="60" cy="43" rx="6" ry="8" fill="#4b5146"/><ellipse cx="140" cy="43" rx="6" ry="8" fill="#4b5146"/>',
  };
  const spots = animal.id === 'cat' ? '<path d="m89 35 5 16m12-16-1 16m-40 52-12 4m82-4 12 4" stroke="#ca915b" stroke-width="7" stroke-linecap="round"/>' : animal.id === 'fox' ? '<path d="M28 99 53 122 43 146q-15-18-15-47m144 0-25 23 10 24q15-18 15-47" fill="#ffebd0"/>' : '';
  const face = frameOnly ? '' : `<circle cx="100" cy="113" r="49" fill="#fff0d9"/>${animal.id === 'panda' ? '<ellipse cx="79" cy="105" rx="14" ry="18" fill="#666b5d" transform="rotate(20 79 105)"/><ellipse cx="121" cy="105" rx="14" ry="18" fill="#666b5d" transform="rotate(-20 121 105)"/>' : ''}<ellipse cx="79" cy="105" rx="4.5" ry="6" fill="${animal.id === 'panda' ? '#fff8e8' : stroke}"/><ellipse cx="121" cy="105" rx="4.5" ry="6" fill="${animal.id === 'panda' ? '#fff8e8' : stroke}"/><ellipse cx="67" cy="121" rx="10" ry="5" fill="#eba89b" opacity=".7"/><ellipse cx="133" cy="121" rx="10" ry="5" fill="#eba89b" opacity=".7"/><path d="M96 118q4-4 8 0l-4 4Z" fill="#b88273"/><path d="M87 129q13 13 26 0" fill="none" stroke="${stroke}" stroke-width="3.5" stroke-linecap="round"/>`;
  return `<svg class="animal-avatar-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${frameOnly ? '' : `<circle cx="100" cy="100" r="98" fill="${animal.background}"/><path d="m22 119 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#e7c46b"/><circle cx="175" cy="99" r="4" fill="#d5b978"/>`}${ears[animal.id]}<path d="M100 32a76 76 0 1 0 0 152 76 76 0 1 0 0-152ZM100 64a49 49 0 1 1 0 98 49 49 0 1 1 0-98Z" fill="${animal.color}" fill-rule="evenodd"/>${spots}${face}<path d="M77 176q23-10 46 0l-4 15H81Z" fill="#6f956b"/><path d="M100 181v-13m0 8q-13 0-12-10 11-1 12 10m0-2q11-1 11-10-12 0-11 10" fill="#a7bd84" stroke="#527953" stroke-width="2" stroke-linecap="round"/></svg>`;
}

export function avatarMarkup(record = readAvatar()) {
  const avatar = validateAvatarRecord(record) || DEFAULT_AVATAR;
  const name = ANIMALS.find(animal => animal.id === avatar.animal).name;
  return avatar.kind === 'photo' ? `<img class="animal-avatar-image" src="${avatar.image}" alt="我的${name}头像" width="96" height="96">` : `<span class="animal-avatar" role="img" aria-label="${name}头像">${animalSvg(avatar.animal)}</span>`;
}

let currentPicker = null;
export function openAvatarPicker({onSave = () => {}, notify = () => {}} = {}) {
  if (currentPicker?.isConnected) { currentPicker.focus(); return currentPicker; }
  const originalFocus = document.activeElement;
  let saved = readAvatar(), animal = saved.animal, mode = 'preset', source = null, sourceUrl = '', frame = null, generation = 0, frameGeneration = 0, closed = false, pending = false;
  const dialog = document.createElement('dialog');
  dialog.className = 'avatar-picker';
  dialog.setAttribute('aria-labelledby','avatar-title');
  dialog.innerHTML = `<header class="avatar-picker-header"><div><small>这是我的小模样</small><h2 id="avatar-title">选一个动物伙伴</h2></div><button class="avatar-action avatar-close" id="avatar-close" aria-label="关闭头像选择">×</button></header><div class="avatar-modes" aria-label="头像方式"><button class="avatar-action" data-avatar-mode="preset" aria-pressed="true">动物伙伴</button><button class="avatar-action" data-avatar-mode="photo" aria-pressed="false">我的自拍</button></div><div class="avatar-preset-preview" id="avatar-current">${avatarMarkup(saved)}</div><div class="avatar-photo-panel" hidden><canvas id="avatar-canvas" width="400" height="400" aria-label="动物头套自拍预览"></canvas><p class="avatar-tip" id="avatar-photo-tip">选一张照片，把小脸放进头套里</p><div class="avatar-file-actions"><button class="avatar-action" id="avatar-take-photo">拍张照片</button><button class="avatar-action" id="avatar-choose-photo">选张照片</button></div><input type="file" id="avatar-camera-file" accept="image/jpeg,image/png,image/webp" capture="user" hidden><input type="file" id="avatar-photo-file" accept="image/jpeg,image/png,image/webp" hidden><div class="avatar-adjustments" hidden><label>大小<input id="avatar-zoom" type="range" min="1" max="3" step="0.01" value="1"></label><label>左右<input id="avatar-x" type="range" min="-1" max="1" step="0.01" value="0"></label><label>上下<input id="avatar-y" type="range" min="-1" max="1" step="0.01" value="0"></label></div></div><div class="avatar-animal-grid">${ANIMALS.map(item=>`<button class="avatar-action avatar-animal" data-avatar-animal="${item.id}" aria-pressed="${item.id===animal}" aria-label="选择${item.name}">${animalSvg(item.id)}<span>${item.name}</span><b aria-hidden="true">✓</b></button>`).join('')}</div><div class="avatar-photo-footer" hidden><button class="avatar-action avatar-save" id="avatar-save-photo" disabled>保存我的头像</button><button class="avatar-action avatar-delete" id="avatar-delete-photo" ${saved.kind==='photo'?'':'hidden'}>删除自拍，用动物头像</button></div><p id="avatar-message" role="status" aria-live="polite">点动物，马上换好</p><p class="avatar-privacy">照片只保存在这台设备，不上传，也不放入学习备份。</p>`;
  const $ = selector => dialog.querySelector(selector);
  const canvas = $('#avatar-canvas'), ctx = canvas.getContext('2d');
  const say = (message,error=false) => { $('#avatar-message').textContent=message; $('#avatar-message').classList.toggle('is-error',error); };
  const publish = (record,message) => {
    const result=saveAvatar(record);
    if (!result.ok) {say(result.message,true); return false;}
    saved=result.avatar; $('#avatar-current').innerHTML=avatarMarkup(saved); $('#avatar-delete-photo').hidden=saved.kind!=='photo';
    say(message); onSave(saved); notify(message); return true;
  };
  const draw = () => {
    if (!ctx || closed) return;
    ctx.clearRect(0,0,400,400); ctx.save(); ctx.scale(2,2);
    ctx.beginPath(); ctx.arc(100,100,98,0,Math.PI*2); ctx.clip();
    ctx.fillStyle=ANIMALS.find(item=>item.id===animal).background; ctx.fillRect(0,0,200,200);
    if(source){
      const crop=cropGeometry(source.naturalWidth,source.naturalHeight,Number($('#avatar-zoom').value),Number($('#avatar-x').value),Number($('#avatar-y').value));
      ctx.save(); ctx.beginPath();ctx.arc(100,113,49,0,Math.PI*2);ctx.clip();ctx.drawImage(source,crop.x,crop.y,crop.width,crop.height);ctx.restore();
    }
    if(frame)ctx.drawImage(frame,0,0,200,200);
    ctx.restore();
  };
  const updateFrame = () => {
    const id=animal, ticket=++frameGeneration, next=new Image();
    frame=null;
    $('#avatar-save-photo').disabled=true;
    next.onload=()=>{if(!closed && ticket===frameGeneration && id===animal){frame=next;draw();$('#avatar-save-photo').disabled=pending||!source;}};
    next.onerror=()=>{if(!closed && ticket===frameGeneration)say('头套还没准备好，请重新选择一次。',true);};
    next.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(animalSvg(animal,Boolean(source)))}`;
  };
  const setBusy = busy => {
    pending=busy;
    $('#avatar-save-photo').disabled=busy||!source||!frame;
    $('#avatar-take-photo').disabled=busy;$('#avatar-choose-photo').disabled=busy;
  };
  const loadPhoto = async file => {
    const error=validatePhotoFile(file); if(error){say(error,true);return;}
    const ticket=++generation, url=URL.createObjectURL(file), image=new Image();
    setBusy(true);say('正在准备照片…');
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
      if(closed||ticket!==generation){URL.revokeObjectURL(url);return;}
      if(image.naturalWidth*image.naturalHeight>40000000 || !image.naturalWidth || !image.naturalHeight) throw new Error('Photo dimensions');
      if(sourceUrl)URL.revokeObjectURL(sourceUrl);
      source=image;sourceUrl=url;
      $('#avatar-zoom').value='1';$('#avatar-x').value='0';$('#avatar-y').value='0';
      $('.avatar-adjustments').hidden=false; $('#avatar-photo-tip').textContent='调好小脸的位置，再点保存';
      say('照片准备好了，可以换头套、调位置。'); updateFrame();
    }catch{URL.revokeObjectURL(url);if(!closed&&ticket===generation)say('这张照片暂时打不开，请换一张 JPG、PNG 或 WebP 照片。',true);}
    finally{if(!closed&&ticket===generation)setBusy(false);}
  };
  dialog.querySelectorAll('[data-avatar-mode]').forEach(button=>button.onclick=()=>{
    mode=button.dataset.avatarMode;
    dialog.querySelectorAll('[data-avatar-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    $('#avatar-current').hidden=mode==='photo';$('.avatar-photo-panel').hidden=mode!=='photo';$('.avatar-photo-footer').hidden=mode!=='photo';
    $('#avatar-title').textContent=mode==='photo'?'戴上我的动物头套':'选一个动物伙伴';
    say(mode==='photo'?'先拍照或选照片，再挑喜欢的头套。':'点动物，马上换好');
    if(mode==='photo')updateFrame();
  });
  dialog.querySelectorAll('[data-avatar-animal]').forEach(button=>button.onclick=()=>{
    animal=button.dataset.avatarAnimal;
    dialog.querySelectorAll('[data-avatar-animal]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    if(mode==='preset')publish({version:1,kind:'preset',animal},`换好啦！现在是${ANIMALS.find(item=>item.id===animal).name}`);
    else{updateFrame();say(source?'头套换好了，点保存就可以带走。':'头套选好了，再拍照或选一张照片。');}
  });
  $('#avatar-take-photo').onclick=()=>$('#avatar-camera-file').click();
  $('#avatar-choose-photo').onclick=()=>$('#avatar-photo-file').click();
  for(const input of dialog.querySelectorAll('input[type="file"]'))input.onchange=()=>{const file=input.files?.[0];input.value='';if(file)loadPhoto(file);};
  for(const input of dialog.querySelectorAll('input[type="range"]'))input.oninput=draw;
  $('#avatar-save-photo').onclick=()=>{
    if(!source||pending||!frame)return;
    try{
      draw();
      const result=document.createElement('canvas');result.width=320;result.height=320;
      const context=result.getContext('2d');context.fillStyle='#fcf9f2';context.fillRect(0,0,320,320);context.drawImage(canvas,0,0,320,320);
      let record;
      for(const quality of [.88,.76,.62,.45]){record={version:1,kind:'photo',animal,image:result.toDataURL('image/jpeg',quality)};if(validateAvatarRecord(record))break;}
      if(!validateAvatarRecord(record)){say('这张照片暂时存不下，请换一张简单一些的照片。',true);return;}
      if(publish(record,'我的动物头像做好啦！'))dialog.close();
    }catch{say('头像还没保存好，原来的头像还在，请再试一次。',true);}
  };
  $('#avatar-delete-photo').onclick=()=>{
    if(publish({version:1,kind:'preset',animal},'自拍已删除，动物伙伴留下陪你。')){
      ++generation;source=null;if(sourceUrl){URL.revokeObjectURL(sourceUrl);sourceUrl='';}
      $('.avatar-adjustments').hidden=true;setBusy(false);updateFrame();
    }
  };
  $('#avatar-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{closed=true;++generation;if(sourceUrl)URL.revokeObjectURL(sourceUrl);source=null;frame=null;dialog.remove();currentPicker=null;if(originalFocus?.isConnected)originalFocus.focus();},{once:true});
  document.body.append(dialog);currentPicker=dialog;dialog.showModal();return dialog;
}
