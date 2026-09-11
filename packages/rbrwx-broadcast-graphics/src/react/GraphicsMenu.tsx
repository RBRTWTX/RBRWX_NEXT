import { activeSceneTitleBinding } from '../resolve.js';
import type {
  BroadcastGraphicKind,
  BroadcastGraphicsCommand,
  BroadcastGraphicsDocument,
  TitleTextMode,
} from '../types.js';

export interface GraphicsMenuProps {
  document: BroadcastGraphicsDocument;
  onCommand: (command: BroadcastGraphicsCommand) => void;
  className?: string;
}

interface ToggleProps {
  label: string;
  checked: boolean;
  graphic: BroadcastGraphicKind;
  onCommand: (command: BroadcastGraphicsCommand) => void;
}

function VisibilityToggle({ label, checked, graphic, onCommand }: ToggleProps) {
  return (
    <label className="rbrwx-graphics-menu__toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCommand({
          type: 'set-visible',
          graphic,
          visible: event.currentTarget.checked,
        })}
      />
    </label>
  );
}

export function GraphicsMenu({ document, onCommand, className = '' }: GraphicsMenuProps) {
  const sceneId = document.activeSceneId;
  const binding = activeSceneTitleBinding(document);
  const titleMode: TitleTextMode = binding?.mode ?? 'blank';
  const blankText = binding?.blankText ?? document.titleBar.fallbackBlankText;

  return (
    <section className={`rbrwx-graphics-menu ${className}`.trim()} aria-label="Graphics menu">
      <h2>Graphics</h2>

      <VisibilityToggle
        label="Title bar"
        checked={document.visibility.titleBar}
        graphic="title-bar"
        onCommand={onCommand}
      />

      <div className="rbrwx-graphics-menu__title-controls">
        <label>
          <span>Title text</span>
          <select
            value={titleMode}
            disabled={!sceneId}
            onChange={(event) => {
              if (!sceneId) return;
              onCommand({
                type: 'set-title-mode',
                sceneId,
                mode: event.currentTarget.value as TitleTextMode,
              });
            }}
          >
            <option value="scene">Match scene</option>
            <option value="blank">Blank / add text</option>
          </select>
        </label>

        {titleMode === 'blank' && (
          <label>
            <span>Title</span>
            <input
              type="text"
              value={blankText}
              placeholder="Leave blank or add title text"
              onChange={(event) => onCommand(sceneId
                ? { type: 'set-blank-title-text', sceneId, text: event.currentTarget.value }
                : { type: 'set-fallback-blank-title-text', text: event.currentTarget.value })}
            />
          </label>
        )}

        <label>
          <span>Title bar size</span>
          <div className="rbrwx-graphics-menu__range">
            <input
              type="range"
              min="50"
              max="100"
              step="1"
              value={document.titleBar.scalePercent}
              onChange={(event) => onCommand({
                type: 'set-title-scale',
                scalePercent: event.currentTarget.valueAsNumber,
              })}
            />
            <output>{document.titleBar.scalePercent}%</output>
          </div>
        </label>
      </div>

      <VisibilityToggle
        label="Lower third"
        checked={document.visibility.lowerThird}
        graphic="lower-third"
        onCommand={onCommand}
      />

      <VisibilityToggle
        label="Ticker"
        checked={document.visibility.ticker}
        graphic="ticker"
        onCommand={onCommand}
      />
    </section>
  );
}
