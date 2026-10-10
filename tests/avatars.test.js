import test from 'node:test';
import assert from 'node:assert/strict';
import {ANIMALS,AVATAR_STORAGE_KEY,MAX_AVATAR_BYTES,MAX_PHOTO_BYTES,validateAvatarRecord,readAvatar,saveAvatar,validatePhotoFile,cropGeometry,animalSvg,avatarMarkup} from '../src/avatars.js';

const store = initial => {
  const map=new Map(Object.entries(initial||{}));
  return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),map};
};
test('six original animal avatars have bounded SVG markup and safe fallback',()=>{
  assert.equal(ANIMALS.length,6);assert.equal(new Set(ANIMALS.map(a=>animalSvg(a.id))).size,6);
  for(const animal of ANIMALS){const svg=animalSvg(animal.id);assert.match(svg,/viewBox="0 0 200 200"/);assert.doesNotMatch(svg,/<script|<image|href=|url\(/);assert.match(avatarMarkup({version:1,kind:'preset',animal:animal.id}),/role="img"/);}
  assert.equal(animalSvg('unknown'),animalSvg('rabbit'));
  assert.doesNotMatch(avatarMarkup({version:1,kind:'photo',animal:'rabbit',image:'" onerror="evil()'}),/onerror/);
});
test('malformed records, active image formats and oversized photos are rejected',()=>{
  for(const value of [null,{}, {version:2,kind:'preset',animal:'cat'}, {version:1,kind:'preset',animal:'bad'}, {version:1,kind:'photo',animal:'cat',image:'data:image/svg+xml,<svg/>'},{version:1,kind:'photo',animal:'cat',image:'https://example.test/photo.jpg'}, {version:1,kind:'photo',animal:'cat',image:'data:image/jpeg;base64,'+'a'.repeat(MAX_AVATAR_BYTES)}])assert.equal(validateAvatarRecord(value),null);
  const clean=validateAvatarRecord({version:1,kind:'preset',animal:'cat',privatePhoto:'hidden'});
  assert.deepEqual(clean,{version:1,kind:'preset',animal:'cat'});
});
test('avatar storage is separate, survives reload, strips unrelated fields and replaces photo on preset',()=>{
  const storage=store({'english-sprout-v1':'learning untouched'});
  const photo={version:1,kind:'photo',animal:'fox',image:'data:image/jpeg;base64,AAAA'};
  assert.equal(saveAvatar(photo,storage).ok,true);assert.deepEqual(readAvatar(storage),photo);
  assert.equal(saveAvatar({version:1,kind:'preset',animal:'panda'},storage).ok,true);
  assert.equal(readAvatar(storage).kind,'preset');assert.doesNotMatch(storage.getItem(AVATAR_STORAGE_KEY),/data:image/);
  assert.equal(storage.getItem('english-sprout-v1'),'learning untouched');
});
test('invalid or unavailable storage preserves the existing saved avatar',()=>{
  const storage=store();saveAvatar({version:1,kind:'preset',animal:'bear'},storage);
  assert.equal(saveAvatar({version:1,kind:'photo',animal:'bear',image:'broken'},storage).ok,false);assert.equal(readAvatar(storage).animal,'bear');
  const quota={getItem:storage.getItem,setItem:()=>{throw new Error('QuotaExceededError');}};
  assert.equal(saveAvatar({version:1,kind:'preset',animal:'cat'},quota).ok,false);assert.equal(readAvatar(quota).animal,'bear');
  assert.equal(saveAvatar({version:1,kind:'preset',animal:'cat'},null).ok,false);
  assert.equal(readAvatar({getItem:()=>{throw new Error('denied');}}).animal,'rabbit');
  assert.equal(readAvatar(store({[AVATAR_STORAGE_KEY]:'{broken'})).animal,'rabbit');
});
test('photo validation restricts type and size before decoding',()=>{
  for(const type of ['image/jpeg','image/png','image/webp'])assert.equal(validatePhotoFile({type,size:200}), '');
  assert.notEqual(validatePhotoFile({type:'image/svg+xml',size:200}),'');assert.notEqual(validatePhotoFile({type:'text/html',size:200}),'');
  for(const size of [0,-1,NaN,Infinity,MAX_PHOTO_BYTES+1])assert.notEqual(validatePhotoFile({type:'image/jpeg',size}),'');
});
test('crop always covers the circular face, permits bounded movement and rejects invalid dimensions',()=>{
  for(const [w,h] of [[100,100],[4000,3000],[600,1600]])for(const zoom of [1,2,3])for(const offset of [-1,0,1]){
    const crop=cropGeometry(w,h,zoom,offset,offset);
    assert.ok(crop.width>=98-1e-8 && crop.height>=98-1e-8);
    assert.ok(crop.x<=51+1e-8 && crop.y<=64+1e-8);
    assert.ok(crop.x+crop.width>=149-1e-8 && crop.y+crop.height>=162-1e-8);
  }
  assert.deepEqual(cropGeometry(100,100,NaN,NaN,NaN),cropGeometry(100,100));
  assert.deepEqual(cropGeometry(100,100,100,-100,100),cropGeometry(100,100,3,-1,1));
  assert.throws(()=>cropGeometry(0,100));assert.throws(()=>cropGeometry(100,Infinity));
});
