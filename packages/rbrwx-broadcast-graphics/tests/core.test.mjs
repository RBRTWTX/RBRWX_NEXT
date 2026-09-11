import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBroadcastGraphicsCommand,
  assertBroadcastGraphicsDocument,
  buildBroadcastGraphicsRenderModel,
  createBroadcastGraphicsDocument,
  parseBroadcastGraphicsDocument,
  registerBroadcastScenes,
  resolveTitleText,
  serializeBroadcastGraphicsDocument,
} from '../dist/index.js';

function withScenes() {
  let document = registerBroadcastScenes(createBroadcastGraphicsDocument(), [
    { id: 'local-radar', title: 'Local Radar' },
    { id: 'satellite', title: 'Satellite' },
  ]);
  return applyBroadcastGraphicsCommand(document, { type: 'set-active-scene', sceneId: 'local-radar' });
}

test('startup leaves title bar, lower third, and ticker off', () => {
  const document = createBroadcastGraphicsDocument();
  assert.deepEqual(document.visibility, { titleBar: false, lowerThird: false, ticker: false });
  assert.deepEqual(buildBroadcastGraphicsRenderModel(document).graphics, []);
});

test('every newly registered scene receives a matching scene-title binding', () => {
  let document = createBroadcastGraphicsDocument();
  document = applyBroadcastGraphicsCommand(document, {
    type: 'register-scene',
    scene: { id: 'radar-ewx', title: 'EWX Radar' },
  });
  document = applyBroadcastGraphicsCommand(document, { type: 'set-active-scene', sceneId: 'radar-ewx' });
  assert.deepEqual(document.titleBindings, [{ sceneId: 'radar-ewx', mode: 'scene', blankText: '' }]);
  assert.deepEqual(resolveTitleText(document), { sceneId: 'radar-ewx', mode: 'scene', text: 'EWX Radar' });
});

test('scene title follows the active scene and a renamed scene', () => {
  let document = withScenes();
  assert.equal(resolveTitleText(document).text, 'Local Radar');
  document = applyBroadcastGraphicsCommand(document, { type: 'set-active-scene', sceneId: 'satellite' });
  assert.equal(resolveTitleText(document).text, 'Satellite');
  document = applyBroadcastGraphicsCommand(document, {
    type: 'register-scene',
    scene: { id: 'satellite', title: 'Enhanced Satellite' },
  });
  assert.equal(resolveTitleText(document).text, 'Enhanced Satellite');
});

test('blank title mode supports an empty bar or added text per scene', () => {
  let document = withScenes();
  document = applyBroadcastGraphicsCommand(document, { type: 'set-title-mode', sceneId: 'local-radar', mode: 'blank' });
  assert.equal(resolveTitleText(document).text, '');
  document = applyBroadcastGraphicsCommand(document, { type: 'set-blank-title-text', sceneId: 'local-radar', text: 'Weather Update' });
  assert.deepEqual(resolveTitleText(document), { sceneId: 'local-radar', mode: 'blank', text: 'Weather Update' });
  document = applyBroadcastGraphicsCommand(document, { type: 'set-active-scene', sceneId: 'satellite' });
  assert.deepEqual(resolveTitleText(document), { sceneId: 'satellite', mode: 'scene', text: 'Satellite' });
});

test('three graphics toggles operate independently', () => {
  let document = withScenes();
  document = applyBroadcastGraphicsCommand(document, { type: 'set-visible', graphic: 'title-bar', visible: true });
  assert.deepEqual(buildBroadcastGraphicsRenderModel(document).graphics.map((graphic) => graphic.kind), ['title-bar']);
  document = applyBroadcastGraphicsCommand(document, { type: 'set-visible', graphic: 'lower-third', visible: true });
  document = applyBroadcastGraphicsCommand(document, { type: 'set-visible', graphic: 'ticker', visible: true });
  assert.deepEqual(buildBroadcastGraphicsRenderModel(document).graphics.map((graphic) => graphic.kind), ['title-bar', 'lower-third', 'ticker']);
  document = applyBroadcastGraphicsCommand(document, { type: 'set-visible', graphic: 'title-bar', visible: false });
  assert.deepEqual(buildBroadcastGraphicsRenderModel(document).graphics.map((graphic) => graphic.kind), ['lower-third', 'ticker']);
});

test('title bar scale is controlled without a render handle and stays inside its range', () => {
  let document = withScenes();
  document = applyBroadcastGraphicsCommand(document, { type: 'set-visible', graphic: 'title-bar', visible: true });
  const full = buildBroadcastGraphicsRenderModel(document).graphics[0];
  assert.equal(full.kind, 'title-bar');
  document = applyBroadcastGraphicsCommand(document, { type: 'set-title-scale', scalePercent: 60 });
  const smaller = buildBroadcastGraphicsRenderModel(document).graphics[0];
  assert.equal(smaller.kind, 'title-bar');
  assert.ok(smaller.rect.width < full.rect.width);
  assert.equal(smaller.rect.x, Math.round((1920 - smaller.rect.width) / 2));
  assert.equal('showResize' in smaller, false);
  document = applyBroadcastGraphicsCommand(document, { type: 'set-title-scale', scalePercent: 5 });
  assert.equal(document.titleBar.scalePercent, 50);
  document = applyBroadcastGraphicsCommand(document, { type: 'set-title-scale', scalePercent: 500 });
  assert.equal(document.titleBar.scalePercent, 100);
});

test('document serialization validates and round-trips', () => {
  const document = withScenes();
  assert.doesNotThrow(() => assertBroadcastGraphicsDocument(document));
  assert.deepEqual(parseBroadcastGraphicsDocument(serializeBroadcastGraphicsDocument(document)), document);
});

test('invalid or unknown scene operations do not corrupt state', () => {
  const document = withScenes();
  assert.equal(applyBroadcastGraphicsCommand(document, { type: 'set-active-scene', sceneId: 'missing' }), document);
  assert.equal(applyBroadcastGraphicsCommand(document, { type: 'register-scene', scene: { id: '', title: '' } }), document);
});
