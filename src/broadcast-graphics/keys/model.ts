import catalog from './catalog.json';
export interface WeatherKeyBin { label: string; display: string; value: string; rgba: number[] }
export interface WeatherKey { id: string; name: string; unit: string; source: string; bins: WeatherKeyBin[] }
export const weatherKeys: readonly WeatherKey[] = catalog;
export type KeySelection = 'auto' | 'none' | string;
/** A scene declares the palette used by its renderer; never infer it from a title. */
export function resolveWeatherKey(selection: KeySelection, weatherKeyId?: string): WeatherKey | undefined {
  const id = selection === 'auto' ? weatherKeyId : selection;
  return weatherKeys.find(key => key.id === id);
}
export function binColor(bin: WeatherKeyBin): string {
  return `rgba(${bin.rgba[0]},${bin.rgba[1]},${bin.rgba[2]},${bin.rgba[3] / 255})`;
}
