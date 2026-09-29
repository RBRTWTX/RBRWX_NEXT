export type Product = 'map' | 'observations' | 'radar' | 'satellite';
export type Units = 'imperial' | 'metric';
export type CurrentConditionField = 'temperature' | 'humidity' | 'heatIndex';
export type Status = 'off' | 'loading' | 'fresh' | 'cached' | 'stale' | 'unavailable' | 'setup';

export interface Observation {
  id: string;
  name: string;
  lng: number;
  lat: number;
  time: number;
  temperature: number | null;
  dewpoint: number | null;
  wind: number | null;
  gust: number | null;
  humidity: number | null;
  heatIndex: number | null;
  description: string;
  cached: boolean;
}

export interface RadarSite {
  id: string;
  name: string;
  city: string;
  wfo: string;
  lng: number;
  lat: number;
}

export interface Options {
  radarField?: 'reflectivity'|'velocity'|'hydro';
  satelliteFeed?: 'longwave'|'shortwave'|'visible'|'water_vapor'|'snow_ice';
  units: Units;
  opacity: number;
  loop: boolean;
  mrmsEnabled: boolean;
  sweepsEnabled: boolean;
  currentField: CurrentConditionField;
}

export interface Snapshot {
  status: Status;
  message: string;
  time: number | null;
  times: number[];
  selectedTime: number | null;
  observations: Observation[];
  playing: boolean;
  radarSites: RadarSite[];
  activeRadarIds: string[];
  primaryRadarId: string | null;
}

export const initialSnapshot = (): Snapshot => ({
  status: 'off',
  message: '',
  time: null,
  times: [],
  selectedTime: null,
  observations: [],
  playing: false,
  radarSites: [],
  activeRadarIds: [],
  primaryRadarId: null,
});

export const defaultOptions = (): Options => ({
  units: 'imperial',
  opacity: .85,
  loop: true,
  mrmsEnabled: false,
  sweepsEnabled: true,
  currentField: 'temperature',
});

export const productTitles: Record<Product, string> = {
  map: 'Broadcast Map',
  observations: 'Current Conditions',
  radar: 'Current Radar',
  satellite: 'Current Satellite',
};

export const currentConditionTitles: Record<CurrentConditionField, string> = {
  temperature: 'Temperature',
  humidity: 'Humidity',
  heatIndex: 'Heat Index',
};

export function freshness(time: number | null, ageMinutes: number, cached = false, now = Date.now()): Status {
  if (time === null || !Number.isFinite(time) || time > now + 300000) return 'unavailable';
  return now - time > ageMinutes * 60000 ? 'stale' : cached ? 'cached' : 'fresh';
}

export function temperatureValue(c: number | null, units: Units): number | null {
  return c === null ? null : Math.round(units === 'metric' ? c : c * 9 / 5 + 32);
}

export function temperature(c: number | null, units: Units): string {
  const value = temperatureValue(c, units);
  return value === null ? '—' : `${value}°${units === 'metric' ? 'C' : 'F'}`;
}

export function temperatureLabel(c: number | null, units: Units): string {
  const value = temperatureValue(c, units);
  return value === null ? '' : `${value}°`;
}

export function relativeHumidityFromTemperatureDewpoint(temperatureC: number | null, dewpointC: number | null): number | null {
  if (temperatureC === null || dewpointC === null || !Number.isFinite(temperatureC) || !Number.isFinite(dewpointC)) return null;
  // NOAA/NWS vapor-pressure relationship: e = 6.112 * exp(17.67*T/(T+243.5)); RH = e(Td)/e(T)*100.
  const vapor = (c: number) => 6.112 * Math.exp(17.67 * c / (c + 243.5));
  const saturation = vapor(temperatureC);
  if (!Number.isFinite(saturation) || saturation <= 0) return null;
  return Math.max(0, Math.min(100, vapor(dewpointC) / saturation * 100));
}

export function observationHumidity(observation: Observation): number | null {
  if (observation.humidity !== null && Number.isFinite(observation.humidity)) return Math.max(0, Math.min(100, observation.humidity));
  return relativeHumidityFromTemperatureDewpoint(observation.temperature, observation.dewpoint);
}

export function humidityLabel(observation: Observation): string {
  const value = observationHumidity(observation);
  return value === null ? '' : `${Math.round(value)}%`;
}

export function nwsHeatIndexF(temperatureF: number | null, relativeHumidity: number | null): number | null {
  if (temperatureF === null || relativeHumidity === null || !Number.isFinite(temperatureF) || !Number.isFinite(relativeHumidity)) return null;
  const rh = Math.max(0, Math.min(100, relativeHumidity));
  const simple = 0.5 * (temperatureF + 61 + ((temperatureF - 68) * 1.2) + (rh * .094));
  let heatIndex = (simple + temperatureF) / 2;
  if (heatIndex < 80) return heatIndex;

  heatIndex = -42.379
    + 2.04901523 * temperatureF
    + 10.14333127 * rh
    - .22475541 * temperatureF * rh
    - .00683783 * temperatureF * temperatureF
    - .05481717 * rh * rh
    + .00122874 * temperatureF * temperatureF * rh
    + .00085282 * temperatureF * rh * rh
    - .00000199 * temperatureF * temperatureF * rh * rh;

  if (rh < 13 && temperatureF >= 80 && temperatureF <= 112) {
    heatIndex -= ((13 - rh) / 4) * Math.sqrt(Math.max(0, (17 - Math.abs(temperatureF - 95)) / 17));
  } else if (rh > 85 && temperatureF >= 80 && temperatureF <= 87) {
    heatIndex += ((rh - 85) / 10) * ((87 - temperatureF) / 5);
  }
  return heatIndex;
}

export function observationHeatIndexF(observation: Observation): number | null {
  if (observation.heatIndex !== null && Number.isFinite(observation.heatIndex)) return observation.heatIndex * 9 / 5 + 32;
  if (observation.temperature === null) return null;
  return nwsHeatIndexF(observation.temperature * 9 / 5 + 32, observationHumidity(observation));
}

export function heatIndexLabel(observation: Observation, units: Units): string {
  const fahrenheit = observationHeatIndexF(observation);
  if (fahrenheit === null) return '';
  const value = Math.round(units === 'metric' ? (fahrenheit - 32) * 5 / 9 : fahrenheit);
  return `${value}°`;
}

export function wind(kmh: number | null, units: Units): string {
  return kmh === null ? '—' : `${Math.round(units === 'metric' ? kmh : kmh / 1.609344)} ${units === 'metric' ? 'km/h' : 'mph'}`;
}

export function frameTimes(values: unknown): number[] {
  return Array.isArray(values)
    ? [...new Set(values
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
      .map(v => v < 1e12 ? v * 1000 : v))].sort((a, b) => a - b)
    : [];
}

export function nextFrame(times: number[], selected: number | null, direction: 1 | -1, loop: boolean): number | null {
  if (!times.length) return null;
  const i = selected === null ? times.length - 1 : times.indexOf(selected);
  const next = i + direction;
  if (next < 0 || next >= times.length) return loop ? times[(next + times.length) % times.length] : null;
  return times[next];
}
