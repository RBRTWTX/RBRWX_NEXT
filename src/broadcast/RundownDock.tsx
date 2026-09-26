import type { DragEvent } from 'react';
import { useBroadcast } from './BroadcastProvider';

export function RundownDock() {
  const broadcast = useBroadcast();
  const { state } = broadcast;

  return <aside className="broadcast-rundown" aria-label="Live lineup">
    <div className="rundown-lineup__heading">
      <span>LIVE LINEUP</span>
      <small>drag to reorder · click to preview</small>
    </div>
    <div className="rundown-lineup__status">
      <span><b>PROGRAM</b>{broadcast.programScene?.title ?? '—'}</span>
      <span><b>PREVIEW</b>{broadcast.previewScene?.title ?? '—'}</span>
    </div>
    <div className="rundown-lineup__items">
      {state.rundown.length === 0 ? <div className="rundown-empty">Add a scene from the content browser.</div> : state.rundown.map((item, index) => {
        const scene = broadcast.scenes.find(candidate => candidate.id === item.sceneId);
        if (!scene) return null;
        const isPreview = state.previewItemId === item.id;
        const isProgram = state.programItemId === item.id;
        return <article
          key={item.id}
          className={`rundown-card ${isPreview ? 'rundown-card--preview' : ''} ${isProgram ? 'rundown-card--program' : ''}`}
          draggable
          onDragStart={(event: DragEvent<HTMLElement>) => event.dataTransfer.setData('text/plain', item.id)}
          onDragOver={(event: DragEvent<HTMLElement>) => event.preventDefault()}
          onDrop={(event: DragEvent<HTMLElement>) => {
            event.preventDefault(); event.stopPropagation();
            const sourceId = event.dataTransfer.getData('text/plain'); if (!sourceId) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const dropAfter = event.clientY >= bounds.top + bounds.height / 2;
            const beforeItemId = dropAfter ? state.rundown[index + 1]?.id ?? null : item.id;
            broadcast.moveItem(sourceId, beforeItemId);
          }}
        >
          <button className="rundown-card__select" type="button" onClick={() => broadcast.selectPreview(item.id)} onDoubleClick={broadcast.takePreview}>
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
              title={isProgram ? 'Program scene cannot be removed while on air' : 'Remove from lineup'}
              disabled={isProgram}
              onClick={() => broadcast.removeItem(item.id)}
            >×</button>
          </div>
        </article>;
      })}
    </div>
  </aside>;
}
