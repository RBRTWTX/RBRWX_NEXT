import { useEffect, useState } from 'react';
import { createBroadcastGraphicsDocument } from '../src/defaults.js';
import { applyBroadcastGraphicsCommand, registerBroadcastScenes } from '../src/state.js';
import type { BroadcastSceneReference } from '../src/types.js';
import { GraphicsMenu } from '../src/react/GraphicsMenu.js';
import { GraphicsStage } from '../src/react/GraphicsStage.js';
import { useBroadcastGraphics } from '../src/react/useBroadcastGraphics.js';

const STARTING_SCENES: BroadcastSceneReference[] = [
  { id: 'local-radar', title: 'Local Radar' },
  { id: 'satellite', title: 'Satellite' },
];

function demoDocument() {
  let document = registerBroadcastScenes(createBroadcastGraphicsDocument(), STARTING_SCENES);
  document = applyBroadcastGraphicsCommand(document, { type: 'set-active-scene', sceneId: 'local-radar' });
  document = applyBroadcastGraphicsCommand(document, {
    type: 'set-lower-third-text',
    headline: 'Weather Update',
    subheadline: 'RBRWX NEXT',
  });
  document = applyBroadcastGraphicsCommand(document, {
    type: 'set-ticker-text',
    label: 'LIVE',
    text: 'Broadcast ticker text',
  });
  return document;
}

export function Demo() {
  const [document, dispatch] = useBroadcastGraphics(demoDocument());
  const [nextScene, setNextScene] = useState(1);

  useEffect(() => {
    document.scenes.forEach((scene) => {
      if (!document.titleBindings.some((binding) => binding.sceneId === scene.id)) {
        dispatch({ type: 'register-scene', scene });
      }
    });
  }, [dispatch, document.scenes, document.titleBindings]);

  function addScene() {
    const number = nextScene;
    const scene = { id: `new-scene-${number}`, title: `New Scene ${number}` };
    dispatch({ type: 'register-scene', scene });
    dispatch({ type: 'set-active-scene', sceneId: scene.id });
    setNextScene(number + 1);
  }

  return (
    <main className="demo-shell">
      <header className="demo-topbar">
        <div><b>RBRWX NEXT</b><span>Standalone Broadcast Graphics</span></div>
        <small>No application module is attached</small>
      </header>
      <aside className="demo-sidebar">
        <GraphicsMenu document={document} onCommand={dispatch} />
        <section className="demo-scene-controls">
          <h2>Test Scenes</h2>
          {document.scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={document.activeSceneId === scene.id ? 'is-active' : ''}
              onClick={() => dispatch({ type: 'set-active-scene', sceneId: scene.id })}
            >
              {scene.title}
            </button>
          ))}
          <button type="button" onClick={addScene}>Add new scene</button>
        </section>
      </aside>
      <section className="demo-program">
        <div className="demo-map" aria-hidden="true">
          <span>Standalone graphics preview</span>
        </div>
        <GraphicsStage document={document} />
      </section>
    </main>
  );
}
