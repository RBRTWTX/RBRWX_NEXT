import { binColor, resolveWeatherKey, weatherKeys, type WeatherKey } from './model';
/** The title and its key share one transform and one font; no overlay controls. */
export function KeyStrip({ value, thumbnail = false }: { value: WeatherKey; thumbnail?: boolean }) {
  return <div className={`wxg-key-strip${thumbnail ? ' wxg-key-thumbnail' : ''}`} aria-label={`${value.name}${value.unit ? ` (${value.unit})` : ''}`}>
    {value.bins.map((bin, index) => <div className="wxg-key-bin" key={`${bin.value}:${index}`} title={bin.label}>
      <span className="wxg-key-color" style={{ backgroundColor: binColor(bin) }} />
      {!thumbnail && <span className="wxg-key-label">{bin.display}</span>}
    </div>)}
  </div>;
}
export function TitleKey({ value }: { value: WeatherKey }) {
  return <div className="wxg-title-key" data-weather-key={value.id}>
    <div className="wxg-key-heading">{value.name}{value.unit && ` · ${value.unit}`}</div>
    <KeyStrip value={value} />
  </div>;
}
export function KeysMenu({ selection, weatherKeyId, disabled, choose }: {
  selection: string; weatherKeyId?: string; disabled: boolean; choose: (id: string) => void;
}) {
  const automatic = resolveWeatherKey('auto', weatherKeyId);
  return <details className="wxg-keys-menu">
    <summary>Keys</summary>
    <div className="wxg-key-options" role="group" aria-label="Weather color keys">
      <button type="button" disabled={disabled} aria-pressed={selection === 'auto'} onClick={() => choose('auto')}>Match scene · {automatic?.name ?? 'No weather key'}</button>
      <button type="button" disabled={disabled} aria-pressed={selection === 'none'} onClick={() => choose('none')}>None</button>
      {weatherKeys.map(key => <button type="button" disabled={disabled} key={key.id} aria-pressed={selection === key.id} onClick={() => choose(key.id)}>
        <span>{key.name}{key.unit && ` · ${key.unit}`}</span><KeyStrip value={key} thumbnail />
      </button>)}
    </div>
    {disabled && <p>Add a scene to choose its key.</p>}
  </details>;
}
