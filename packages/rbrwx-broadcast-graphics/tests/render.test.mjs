import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  applyBroadcastGraphicsCommand,
  createBroadcastGraphicsDocument,
} from '../dist/index.js';
import { GraphicsMenu, GraphicsStage } from '../dist/react/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function visibleTitleDocument() {
  let document = createBroadcastGraphicsDocument();
  document = applyBroadcastGraphicsCommand(document, { type: 'register-scene', scene: { id: 'radar', title: 'Local Radar' } });
  document = applyBroadcastGraphicsCommand(document, { type: 'set-active-scene', sceneId: 'radar' });
  return applyBroadcastGraphicsCommand(document, { type: 'set-visible', graphic: 'title-bar', visible: true });
}

test('rendered graphics contain scene title and no editing markers or controls', () => {
  const html = renderToStaticMarkup(createElement(GraphicsStage, { document: visibleTitleDocument() }));
  assert.match(html, /Local Radar/);
  assert.doesNotMatch(html, /<button|contenteditable|resize|remove|handle|is-selected/i);
});

test('graphics menu exposes exactly the three visibility switches', () => {
  const html = renderToStaticMarkup(createElement(GraphicsMenu, {
    document: visibleTitleDocument(),
    onCommand() {},
  }));
  const switches = html.match(/type="checkbox"/g) ?? [];
  assert.equal(switches.length, 3);
  assert.match(html, />Title bar</);
  assert.match(html, />Lower third</);
  assert.match(html, />Ticker</);
  assert.match(html, /Match scene/);
  assert.match(html, /Blank \/ add text/);
  assert.match(html, /Title bar size/);
});

test('graphics stylesheet contains no visible drag, resize, or remove affordance', async () => {
  const css = await readFile(path.join(root, 'styles/broadcast-graphics.css'), 'utf8');
  assert.doesNotMatch(css, /cursor\s*:\s*(?:move|grab|nwse-resize)|graphic-(?:remove|resize)|is-selected/i);
});
