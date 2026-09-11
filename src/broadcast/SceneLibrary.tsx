import { useBroadcast } from './BroadcastProvider';

export function SceneLibrary() {
  const broadcast = useBroadcast();

  return (
    <aside className="scene-rail broadcast-scene-library" aria-label="Scene library">
      <div className="rail-heading">SCENE LIBRARY</div>
      <div className="scene-library__scroll">
        {broadcast.scenes.map((scene) => {
          const selected = broadcast.state.selectedLibrarySceneId === scene.id;
          return (
            <article key={scene.id} className={`scene-card ${selected ? 'scene-card--active' : ''}`}>
              <button
                className="scene-card__select"
                type="button"
                aria-pressed={selected}
                onClick={() => broadcast.selectLibraryScene(scene.id)}
                onDoubleClick={() => broadcast.addScene(scene.id)}
              >
                <span className="scene-card__eyebrow">{scene.category}</span>
                <strong>{scene.title}</strong>
                <small>{scene.subtitle}</small>
              </button>
              <button className="scene-card__add" type="button" onClick={() => broadcast.addScene(scene.id)}>
                + ADD
              </button>
            </article>
          );
        })}
      </div>
      <div className="rail-note">Library scenes are presets. Adding or selecting a scene does not put it on air; TAKE or transport controls change Program.</div>
    </aside>
  );
}
