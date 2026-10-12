import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreSpeech,speechWords} from '../src/speech-match.js';

test('same ordered sentence passes despite capitalization punctuation and contractions',()=>{
  assert.equal(scoreSpeech("I'm happy!",'i am happy').matched,true);
  assert.equal(scoreSpeech("Let's play together.",'let us play together').stars,3);
  assert.deepEqual(speechWords("I can’t do it."),['i','can','not','do','it']);
});
test('silence and unrelated speech never receive a pass',()=>{
  assert.equal(scoreSpeech('Good morning!','').matched,false);
  assert.equal(scoreSpeech('Good morning!','').stars,0);
  assert.equal(scoreSpeech('Good morning!','i want a banana').matched,false);
  assert.equal(scoreSpeech('Good morning!','morning').matched,false);
  assert.equal(scoreSpeech('Hello!','hello i want a banana').matched,false);
});
test('short phrases require every word; longer phrases allow one missing word',()=>{
  assert.equal(scoreSpeech('I want some water.','i want water').matched,false);
  assert.equal(scoreSpeech('Can I have some water please?','can i have water please').matched,true);
  assert.equal(scoreSpeech('Can I have some water please?','water please').matched,false);
});
test('reordering and repeated or inserted words count against matching',()=>{
  assert.equal(scoreSpeech('I like you.','you like i').matched,false);
  assert.equal(scoreSpeech('I like you.','i i i like you you you').matched,false);
  assert.equal(scoreSpeech('Good morning.','um good morning uh').matched,true);
});
test('result reports lexical coverage without pretending to assess pronunciation',()=>{
  const result=scoreSpeech('I want some water.','i want water');
  assert.equal(result.coverage,.75);assert.equal(result.precision,1);assert.equal(result.stars,2);
  assert.equal('pronunciation' in result,false);
  assert.equal(scoreSpeech(null,'hello').matched,false);
});
