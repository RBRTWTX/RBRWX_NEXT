import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { RBR_TW_COLORS } from '../defaults.js';
import { buildBroadcastGraphicsRenderModel } from '../renderModel.js';
import type {
  BroadcastGraphicsDocument,
  RenderBroadcastGraphic,
} from '../types.js';

export interface GraphicsStageProps {
  document: BroadcastGraphicsDocument;
  sceneId?: string | null;
  className?: string;
  ariaLabel?: string;
}

function graphicBody(graphic: RenderBroadcastGraphic) {
  if (graphic.kind === 'title-bar') {
    return (
      <div className="rbrwx-title-bar" data-title-mode={graphic.titleMode}>
        <div className="rbrwx-title-bar__accent" aria-hidden="true" />
        <div className="rbrwx-title-bar__text">{graphic.text}</div>
      </div>
    );
  }
  if (graphic.kind === 'lower-third') {
    return (
      <div className="rbrwx-lower-third">
        <div className="rbrwx-lower-third__accent" aria-hidden="true" />
        <div className="rbrwx-lower-third__copy">
          <div className="rbrwx-lower-third__headline">{graphic.headline}</div>
          <div className="rbrwx-lower-third__subheadline">{graphic.subheadline}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="rbrwx-ticker">
      <div className="rbrwx-ticker__label">{graphic.label}</div>
      <div className="rbrwx-ticker__window">
        <div className={`rbrwx-ticker__track${graphic.text ? ' is-running' : ''}`}>
          <span>{graphic.text}</span>
          {graphic.text && <span aria-hidden="true">{graphic.text}</span>}
        </div>
      </div>
    </div>
  );
}

export function GraphicsStage({
  document: graphicsDocument,
  sceneId,
  className = '',
  ariaLabel = 'RBRWX broadcast graphics',
}: GraphicsStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const model = useMemo(
    () => buildBroadcastGraphicsRenderModel(graphicsDocument, sceneId),
    [graphicsDocument, sceneId],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setDisplayScale(container.clientWidth / model.design.width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [model.design.width]);

  const variables = {
    '--rbrtw-navy': RBR_TW_COLORS.navy,
    '--rbrtw-purple': RBR_TW_COLORS.purple,
    '--rbrtw-magenta': RBR_TW_COLORS.magenta,
    '--rbrtw-panel': RBR_TW_COLORS.panel,
    '--rbrtw-panel-deep': RBR_TW_COLORS.panelDeep,
    '--rbrtw-text': RBR_TW_COLORS.text,
    '--rbrtw-muted-text': RBR_TW_COLORS.mutedText,
    aspectRatio: `${model.design.width} / ${model.design.height}`,
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`rbrwx-graphics-stage ${className}`.trim()}
      style={variables}
      aria-label={ariaLabel}
      data-scene-id={model.sceneId ?? ''}
    >
      <div
        className="rbrwx-graphics-stage__design"
        style={{
          width: model.design.width,
          height: model.design.height,
          transform: `scale(${displayScale})`,
        }}
      >
        {model.graphics.map((graphic) => (
          <div
            key={graphic.id}
            className={`rbrwx-graphic rbrwx-graphic--${graphic.kind}`}
            data-graphic={graphic.kind}
            style={{
              left: graphic.rect.x,
              top: graphic.rect.y,
              width: graphic.rect.width,
              height: graphic.rect.height,
              zIndex: graphic.zIndex,
            }}
          >
            {graphicBody(graphic)}
          </div>
        ))}
      </div>
    </div>
  );
}
