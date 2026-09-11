import type { ChangeEvent, DragEvent } from 'react';
import { useBroadcast } from './BroadcastProvider';
import type { BroadcastTransitionKind } from './broadcastTypes';

const TRANSITIONS: { value: BroadcastTransitionKind; label: string }[] = [
  { value: 'cut', label: 'CUT' },
  { value: 'dissolve', label: 'DISSOLVE' },
  { value: 'fade', label: 'FADE' },
];

export function RundownDock() {
  const broadcast = useBroadcast();
  const { state } = broadcast;

  return (
    <section className="broadcast-rundown" aria-label="Broadcast rundown">
      <div className="broadcast-transport">
        <div className="broadcast-transport__status">
          <span><b>PROGRAM</b>{broadcast.programScene?.title ?? '—'}</span>
          <span><b>PREVIEW</b>{broadcast.previewScene?.title ?? '—'}</span>
        </div>

        <div className="broadcast-transport__buttons">
          <button type="button" onClick={broadcast.previous} title="Previous scene">|◀</button>
          {state.transport === 'playing' ? (
            <button className="transport-primary" type="button" onClick={broadcast.pause} title="Pause automatic rundown">Ⅱ</button>
          ) : (
            <button className="transport-primary" type="button" onClick={broadcast.play} disabled={!broadcast.canPlay} title="Play automatic rundown">▶</button>
          )}
          <button type="button" onClick={broadcast.next} title="Next / skip scene">▶|</button>
          <button className="take-button" type="button" onClick={broadcast.takePreview} disabled={!state.previewItemId}>TAKE</button>
        </div>

        <div className="broadcast-transition-row">
          <label>
            <span>TRANSITION</span>
            <select value={state.transition.kind} onChange={(event: ChangeEvent<HTMLSelectElement>) => broadcast.setTransitionKind(event.target.value as BroadcastTransitionKind)}>
              {TRANSITIONS.map((transition) => <option key={transition.value} value={transition.value}>{transition.label}</option>)}
            </select>
          </label>
          <label>
            <span>MS</span>
            <input
              type="number"
              min="0"
              max="3000"
              step="50"
              disabled={state.transition.kind === 'cut'}
              value={state.transition.durationMs}
              onChange={(event: ChangeEvent<HTMLInputElement>) => broadcast.setTransitionDuration(Number(event.target.value))}
            />
          </label>
          <button
            className={`loop-button ${state.loop ? 'loop-button--on' : ''}`}
            type="button"
            aria-pressed={state.loop}
            onClick={() => broadcast.setLoop(!state.loop)}
          >
            LOOP {state.loop ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="rundown-strip" aria-label="Selected scenes">
        <div className="rundown-strip__heading">
          <span>SELECTED SCENES</span>
          <small>drag to reorder · click to preview</small>
        </div>
        <div className="rundown-strip__items">
          {state.rundown.length === 0 ? (
            <div className="rundown-empty">Add a scene from the Scene Library.</div>
          ) : state.rundown.map((item, index) => {
            const scene = broadcast.scenes.find((candidate) => candidate.id === item.sceneId);
            if (!scene) return null;
            const isPreview = state.previewItemId === item.id;
            const isProgram = state.programItemId === item.id;
            return (
              <article
                key={item.id}
                className={`rundown-card ${isPreview ? 'rundown-card--preview' : ''} ${isProgram ? 'rundown-card--program' : ''}`}
                draggable
                onDragStart={(event: DragEvent<HTMLElement>) => event.dataTransfer.setData('text/plain', item.id)}
                onDragOver={(event: DragEvent<HTMLElement>) => event.preventDefault()}
                onDrop={(event: DragEvent<HTMLElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const sourceId = event.dataTransfer.getData('text/plain');
                  if (!sourceId) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const dropAfter = event.clientX >= bounds.left + bounds.width / 2;
                  const beforeItemId = dropAfter ? state.rundown[index + 1]?.id ?? null : item.id;
                  broadcast.moveItem(sourceId, beforeItemId);
                }}
              >
                <button className="rundown-card__select" type="button" onClick={() => broadcast.selectPreview(item.id)}>
                  <span className="rundown-card__number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="rundown-card__category">{scene.category}</span>
                  <strong>{scene.title}</strong>
                  <small>{Math.round(item.holdMs / 1000)}s hold</small>
                </button>
                <div className="rundown-card__flags">
                  {isProgram && <span className="program-flag">PGM</span>}
                  {isPreview && <span className="preview-flag">PVW</span>}
                  <button
                    type="button"
                    className="rundown-card__remove"
                    title={isProgram ? 'Program scene cannot be removed while on air' : 'Remove from rundown'}
                    disabled={isProgram}
                    onClick={() => broadcast.removeItem(item.id)}
                  >
                    ×
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
