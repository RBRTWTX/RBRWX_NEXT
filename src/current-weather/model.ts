export type Product = 'map' | 'observations' | 'radar' | 'satellite';
export type Units = 'imperial' | 'metric';
export type Status = 'off' | 'loading' | 'fresh' | 'cached' | 'stale' | 'unavailable' | 'setup';
export interface Observation { id: string; name: string; lng: number; lat: number; time: number; temperature: number | null; dewpoint: number | null; wind: number | null; gust: number | null; humidity: number | null; description: string; cached: boolean }
export interface Options { units: Units; opacity: number; loop: boolean }
export interface Snapshot { status: Status; message: string; time: number | null; times: number[]; selectedTime: number | null; observations: Observation[]; playing: boolean }
export const initialSnapshot = (): Snapshot => ({ status: 'off', message: '', time: null, times: [], selectedTime: null, observations: [], playing: false });
export const defaultOptions = (): Options => ({ units: 'imperial', opacity: .85, loop: true });
export const productTitles: Record<Product, string> = { map: 'Broadcast Map', observations: 'Current Conditions', radar: 'Current Radar', satellite: 'Current Satellite' };
export function freshness(time: number | null, ageMinutes: number, cached = false, now = Date.now()): Status {
  if (time === null || !Number.isFinite(time) || time > now + 300000) return 'unavailable';
  return now - time > ageMinutes * 60000 ? 'stale' : cached ? 'cached' : 'fresh';
}
export function temperature(c: number | null, units: Units): string { return c === null ? '—' : `${Math.round(units === 'metric' ? c : c * 9 / 5 + 32)}°${units === 'metric' ? 'C' : 'F'}`; }
export function wind(kmh: number | null, units: Units): string { return kmh === null ? '—' : `${Math.round(units === 'metric' ? kmh : kmh / 1.609344)} ${units === 'metric' ? 'km/h' : 'mph'}`; }
export function frameTimes(values: unknown): number[] { return Array.isArray(values) ? [...new Set(values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0).map(v => v < 1e12 ? v * 1000 : v))].sort((a,b)=>a-b) : []; }
export function nextFrame(times: number[], selected: number | null, direction: 1 | -1, loop: boolean): number | null {
  if (!times.length) return null;
  const i = selected === null ? times.length - 1 : times.indexOf(selected), next = i + direction;
  if (next < 0 || next >= times.length) return loop ? times[(next + times.length) % times.length] : null;
  return times[next];
}
