import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../broadcast/vendor/typescript/typescript.cjs');
const code = ts.transpileModule(fs.readFileSync(new URL('../../src/broadcast-graphics/barStyles.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { BAR_DESIGNS, barPresentation, resolveBarAppearance } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('older scenes retain original appearance without an implicit preset', () => {
  assert.deepEqual(barPresentation(undefined), {});
});
test('all four presets produce distinct presentation and can override colors and fonts', () => {
  assert.equal(new Set(BAR_DESIGNS.map(p => p.id)).size, 4);
  for (const preset of BAR_DESIGNS) {
    const rendered = barPresentation({ design: preset.id, top: '#123456', bottom: '#654321', accent: '#ff00ff', text: '#eeeeee', font: 'verdana', weight: '600' });
    assert.equal(rendered.design, preset.id);
    assert.equal(rendered.style['--bar-top'], '#123456');
    assert.equal(rendered.style['--bar-bottom'], '#654321');
    assert.equal(rendered.style['--bar-accent'], '#ff00ff');
    assert.equal(rendered.style['--bar-text'], '#eeeeee');
    assert.match(rendered.style['--bar-font'], /Verdana/);
    assert.equal(rendered.style['--bar-weight'], '600');
  }
});
test('invalid saved style values fall back to safe defaults', () => {
  const result = resolveBarAppearance({ design: 'removed', top: 'url(example)', bottom: 'invalid', text: '#fff', font: 'url(remote)', weight: '99999' });
  assert.deepEqual(result, resolveBarAppearance());
});
test('JSON capture round trip preserves selected styles without changing scene copy/layout', () => {
  const before = { title: '', subtitle: '', lower: 'LOCAL ALERT', titleLayout: { x: 3, y: 8, width: 65 }, textOverrides: { time: '6 PM' } };
  const scene = { ...before, barStyles: { title: { design: 'studio', accent: '#ff4400' }, lower: { design: 'cp3a', font: 'impact' } } };
  const restored = JSON.parse(JSON.stringify(scene));
  const { barStyles, ...rest } = restored;
  assert.deepEqual(rest, before);
  assert.deepEqual(barPresentation(barStyles.title), barPresentation(scene.barStyles.title));
  assert.equal(barPresentation(barStyles.lower).design, 'cp3a');
});
