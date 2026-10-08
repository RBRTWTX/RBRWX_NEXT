import { useState } from 'react';
import { BAR_DESIGNS, BAR_FONTS, barAttributes, resolveBarAppearance, type BarAppearance, type BarStyles, type BarTarget } from './barStyles';
import './barLibrary.css';

const labels: Record<BarTarget, string> = { title: 'Title bar', lower: 'Lower third', ticker: 'Ticker', status: 'Status / alert bar' };
export function BarLibrary({ value, onChange, targets, disabled = false }: {
  value?: BarStyles; onChange: (next: BarStyles) => void; targets: readonly BarTarget[]; disabled?: boolean;
}) {
  const [selection, select] = useState<BarTarget>('title');
  const target = targets.includes(selection) ? selection : targets[0];
  const selected = value?.[target];
  const resolved = resolveBarAppearance(selected);
  const edit = (patch: Partial<BarAppearance>) => onChange({ ...value, [target]: { ...resolved, textSizing:selected?.textSizing, ...patch } });
  return <details className="wx-bar-library">
    <summary>BAR LIBRARY</summary>
    <div className="wx-bar-library-body">
      <label>Style this bar<select aria-label="Style this bar" disabled={disabled} value={target} onChange={e => select(e.target.value as BarTarget)}>
        {targets.map(kind => <option key={kind} value={kind}>{labels[kind]}</option>)}
      </select></label>
      <div className="wx-bar-designs" aria-label="Broadcast bar designs">
        {BAR_DESIGNS.map(preset => <button type="button" key={preset.id} disabled={disabled} aria-pressed={!!selected && resolved.design === preset.id}
          onClick={() => onChange({ ...value, [target]: { design: preset.id } })}>
          <span className="wx-bar-preview" {...barAttributes({ design: preset.id })}><b>WEATHER</b><small>6:00 PM</small></span>
          <strong>{preset.name}</strong><span>{preset.description}</span>
        </button>)}
      </div>
      <p>{selected ? `${labels[target]} · ${BAR_DESIGNS.find(item => item.id === resolved.design)!.name}` : 'Existing scene appearance · choose a design to customize.'}</p>
      <fieldset disabled={disabled || !selected}>
        <legend>Customize selected bar</legend>
        <div className="wx-bar-colors">{([['top', 'Top color'], ['bottom', 'Bottom color'], ['accent', 'Accent color'], ['text', 'Text color']] as const).map(([key, label]) =>
          <label key={key}>{label}<input type="color" aria-label={label} value={resolved[key]} onChange={e => edit({ [key]: e.target.value })}/></label>)}</div>
        <label>Font<select aria-label="Bar font" value={resolved.font} onChange={e => edit({ font: e.target.value })}>
          {BAR_FONTS.map(font => <option key={font.id} value={font.id}>{font.name}</option>)}
        </select></label>
        <label>Weight<select aria-label="Bar font weight" value={resolved.weight} onChange={e => edit({ weight: e.target.value })}>
          <option value="400">Regular</option><option value="600">Semibold</option><option value="700">Bold</option><option value="900">Heavy</option>
        </select></label>
      </fieldset>
      <button type="button" disabled={disabled || !selected} onClick={() => {
        const next = { ...value }; delete next[target]; onChange(next);
      }}>Restore original appearance</button>
      <small>Saved for this scene. Choosing a design resets its colors and font; your text and position stay unchanged.</small>
    </div>
  </details>;
}
