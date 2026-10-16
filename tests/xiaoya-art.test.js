import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneArt } from '../xiaoya/art.js';
import { EVENTS } from '../xiaoya/content.js';

const contexts = EVENTS.flatMap(event => event.contexts.map(context => ({
  ...event, ...context, sceneId: context.scene, context,
})));

// Ignore IDs, labels and decorative paper grain: different names alone must
// never make two otherwise identical pictures pass the distinctness checks.
function geometry(svg) {
  return svg
    .replace(/<defs>[\s\S]*?<\/defs>/g, '')
    .replace(/<rect\b[^>]*fill="url\(#xygrain\d+\)"[^>]*\/>/g, '')
    .replace(/\s(?:class|data-[\w-]+|aria-hidden|focusable)="[^"]*"/g, '')
    .replace(/\s+/g, ' ').trim();
}

function cue(svg, name) {
  const start = svg.indexOf(`<g data-cue="${name}">`);
  assert.notEqual(start, -1, `Missing painted cue: ${name}`);
  const groups = /<g\b[^>]*>|<\/g>/g;
  groups.lastIndex = start;
  let depth = 0;
  for (let match; (match = groups.exec(svg));) {
    depth += match[0] === '</g>' ? -1 : 1;
    if (depth === 0) {
      const group = svg.slice(start, groups.lastIndex);
      assert.match(group, /<(?:path|circle|ellipse|rect)\b/, `${name} must contain visible geometry`);
      return geometry(group);
    }
  }
  assert.fail(`Unclosed painted cue: ${name}`);
}

test('all 18 events, 36 contexts and answer scenes resolve by their actual setting', () => {
  assert.equal(EVENTS.length, 18);
  assert.equal(contexts.length, 36);
  for (const context of contexts) {
    const svg = sceneArt(context);
    assert.ok(svg.includes(`data-scene="${context.settingId}"`), context.id);
    assert.doesNotMatch(svg, /data-scene="unknown"/);
    // Titles and the generic theme must not override the actual transfer object.
    assert.equal(geometry(sceneArt({ ...context, title: 'ball book morning', theme: 'play' })), geometry(svg));
  }
  for (const event of EVENTS) {
    assert.equal(geometry(sceneArt(event.id)), geometry(sceneArt({ ...event, ...event.contexts[0] })), event.id);
    for (const choice of event.choices) {
      assert.doesNotMatch(sceneArt(choice.scene), /data-scene="unknown"/, `${event.id}/${choice.scene}`);
    }
  }
});

test('the only duplicate context artwork is the deliberately shared stuck-coat situation', () => {
  const byGeometry = new Map();
  for (const context of contexts) {
    const picture = geometry(sceneArt(context));
    const previous = byGeometry.get(picture);
    if (previous) {
      assert.equal(context.settingId, 'coat-zip', `${previous.settingId} and ${context.settingId} share a picture`);
      assert.equal(previous.settingId, 'coat-zip');
    } else byGeometry.set(picture, context);
  }
  assert.equal(byGeometry.size, 35);
  assert.equal(new Set(EVENTS.map(event => geometry(sceneArt(event.id)))).size, 18);
  for (const event of EVENTS) {
    const [first, transfer] = event.contexts;
    assert.notEqual(geometry(sceneArt({ ...event, ...first })), geometry(sceneArt({ ...event, ...transfer })), `${event.id} transfer is only a relabelled picture`);
  }
});

test('waking, meeting and leaving have different people, actions and time cues', () => {
  const morning = sceneArt('hello-morning');
  const meeting = sceneArt('hello-welcome');
  const leaving = sceneArt('hello-goodbye');
  cue(morning, 'dawn-window'); cue(morning, 'waking-bed');
  cue(meeting, 'new-friend'); cue(meeting, 'meeting-greeting');
  cue(leaving, 'departing-backpack-friend'); cue(leaving, 'leaving-path');
  assert.doesNotMatch(morning, /data-cue="departing-backpack-friend"/);
  assert.doesNotMatch(meeting, /data-cue="waking-bed"/);
  assert.notEqual(cue(meeting, 'new-friend'), cue(leaving, 'departing-backpack-friend'));
});

test('each situation paints the concrete communication cue, including transfer scenes', () => {
  const expected = {
    'garden-morning':['morning-garden','morning-greeting'],
    'park-new-friend':['new-friend','meeting-greeting'],
    'park-goodbye':['departing-backpack-friend','leaving-path'],
    'food-water':['empty-water-cup','water-jug','reaching-for-water'],
    'bed-water':['bedside-table','empty-water-cup','water-jug'],
    'food-more':['empty-bowl','spare-fruit','upturned-request-hand'],
    'drawing-more':['empty-bowl','spare-drawing-paper','drawing-tools'],
    'food-no-thanks':['offered-biscuit','polite-stop-palm','finished-meal'],
    'park-decline':['offered-juice','polite-stop-palm'],
    'play-box':['stuck-toy-box','pulling-box-lid','box-helper'],
    'coat-zip':['wearing-coat','stuck-zipper','zipper-helper'],
    'play-ball':['shared-ball','inviting-friend','playmate'],
    'blocks-invite':['shared-building-blocks','inviting-friend','playmate'],
    'play-bridge':['river-gap','unplaced-bridge-plank','lifting-plank-together'],
    'basket-lift':['heavy-basket-on-floor','basket-handles','basket-helper'],
    'care-hands':['muddy-hands','washbasin'],
    'picnic-wash':['painty-hands','outdoor-water-bowl'],
    'backpack-buckle':['closed-backpack-buckle','pulling-buckle'],
    'care-socks':['rain-puddle','wet-socks-on-feet','dry-replacement-socks'],
    'spilled-water-socks':['spilled-cup','wet-socks-on-feet'],
    'outside-cat':['cat-in-bush','curious-pointing-hand'],
    'window-snail':['snail-on-sill','curious-pointing-hand'],
    'outside-bird':['bird-on-branch','pointing-out-the-bird'],
    'window-bird':['bird-on-windowsill','pointing-out-the-bird'],
    'outside-dog':['dog-behind-bush','barking-sound','cupped-ear-listener'],
    'window-dog':['dog-outside-window','barking-sound','cupped-ear-listener'],
    'bed-book':['two-readers','waiting-picture-book','reading-cushions'],
    'garden-book':['two-readers','waiting-picture-book','reading-bench'],
    'bed-story':['story-listener','storyteller','listener-blanket','story-request-bubble'],
    'rain-story':['rainy-day-chairs','story-listener','storyteller','story-request-bubble'],
    'bed-night':['night-window','night-bed','tucked-in-blanket'],
    'camp-night':['night-tent','sleeping-bag'],
  };
  for (const [setting, names] of Object.entries(expected)) {
    const svg = sceneArt(setting);
    for (const name of names) cue(svg, name);
  }
  assert.doesNotMatch(sceneArt('bed-story'), /data-cue="(?:waiting-picture-book|shared-open-picture-book)"/);
  assert.notEqual(cue(sceneArt('care-hands'), 'muddy-hands'), cue(sceneArt('picnic-wash'), 'painty-hands'));
});

test('resolution changes the actual object or relationship, not just a celebration label', () => {
  for (const context of contexts) {
    assert.notEqual(geometry(sceneArt(context, 'before')), geometry(sceneArt(context, 'resolved')), context.settingId);
  }
  const transitions = [
    ['food-water','empty-water-cup','filled-water-cup'],
    ['food-more','empty-bowl','refilled-bowl'],
    ['drawing-more','empty-bowl','refilled-bowl'],
    ['food-no-thanks','offered-biscuit','offered-biscuit'],
    ['park-decline','offered-juice','offered-juice'],
    ['play-box','stuck-toy-box','opened-toy-box'],
    ['coat-zip','wearing-coat','wearing-coat'],
    ['backpack-buckle','closed-backpack-buckle','opened-backpack-buckle'],
    ['play-bridge','unplaced-bridge-plank','placed-bridge-plank'],
    ['basket-lift','heavy-basket-on-floor','lifted-heavy-basket'],
    ['care-hands','muddy-hands','clean-hands'],
    ['picnic-wash','painty-hands','clean-hands'],
    ['care-socks','wet-socks-on-feet','dry-socks-on-feet'],
    ['bed-book','waiting-picture-book','shared-open-picture-book'],
    ['bed-story','story-request-bubble','imagined-bird-story'],
    ['bed-night','tucked-in-blanket','tucked-in-blanket'],
    ['camp-night','sleeping-bag','sleeping-bag'],
  ];
  for (const [setting, beforeCue, afterCue] of transitions) {
    assert.notEqual(cue(sceneArt(setting, 'before'), beforeCue), cue(sceneArt(setting, 'resolved'), afterCue), setting);
  }
});

test('all scene phases stay self-contained, text-free SVG, and unknown IDs stay neutral', () => {
  for (const context of contexts) {
    for (const phase of ['before','request','resolved']) {
      const svg = sceneArt(context, phase);
      assert.match(svg, /^<svg\b[^>]*viewBox="0 0 400 300"/);
      assert.match(svg, /aria-hidden="true"/);
      assert.doesNotMatch(svg, /NaN|undefined|Infinity|<text\b|<image\b|<script\b|on(?:click|load)=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    }
  }
  const unknown = sceneArt({ settingId: 'future-unmapped-situation' });
  assert.match(unknown, /data-action="neutral"/);
  assert.doesNotMatch(unknown, /data-cue="stuck-toy-box"/);
});
