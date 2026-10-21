/** A seed's colour is shared artwork, never its identity, price or rarity. */
export const SEED_COLORS = Object.freeze(Object.fromEntries([
  ['white','白色','#f2e4bf'],
  ['yellow','黄色','#e7b93f'],
  ['pink','粉色','#df8faa'],
  ['red','红色','#ca6556'],
  ['blue','蓝色','#79afce'],
  ['purple','紫色','#a68ac5'],
  ['natural','原色','#dfaa71'],
].map(([tag,name,color])=>[tag,Object.freeze({tag,name,color})])));

// Existing flower IDs stay unchanged. New flowers can declare seedColor using
// one of the tags above; no new seed image or saved-state field is required.
export const FLOWER_SEED_COLORS = Object.freeze({
  daisy:'white',tulip:'pink',sunflower:'yellow',bellflower:'blue',poppy:'red',violet:'purple',
  'bow-pink':'pink','bow-blue':'blue','bow-yellow':'yellow','bow-purple':'purple',
  'giant-daisy':'white','giant-sunflower':'yellow',
  'bow-rainbow':'pink','bow-starlight':'purple',
});

const own=(object,key)=>typeof key==='string'&&Object.prototype.hasOwnProperty.call(object,key);

/**
 * Names follow flower metadata; colour does not select or reroll the flower.
 * Unknown/missing colour tags use the existing ID mapping, then a natural seed.
 * The returned name is plain text: callers must escape it when writing HTML.
 */
export function seedAppearance(flower) {
  const colorTag=own(SEED_COLORS,flower?.seedColor)?flower.seedColor:
    own(FLOWER_SEED_COLORS,flower?.id)?FLOWER_SEED_COLORS[flower.id]:'natural';
  const palette=SEED_COLORS[colorTag];
  const name=typeof flower?.name==='string'&&flower.name.trim()?flower.name.trim():'小花';
  return Object.freeze({colorTag,colorName:palette.name,color:palette.color,seedName:`${flower?.giant&&!name.startsWith('巨型')?'巨型':''}${name}种子`});
}
