import type { CurrentObservation, ForecastGraphicsData, NwsForecastPeriod, NwsHourlyPeriod } from './model';

const HOME_LAT = 29.4317;
const HOME_LON = -98.8063;
const API_ROOT = 'https://api.weather.gov';

interface NwsPointResponse {
  properties?: {
    forecast?: string;
    forecastHourly?: string;
    observationStations?: string;
    relativeLocation?: {
      properties?: { city?: string; state?: string };
    };
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function quantity(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  return asNumber((raw as { value?: unknown }).value);
}

function cToF(value: number | null): number | null {
  return value === null ? null : value * 9 / 5 + 32;
}

function kmhToMph(value: number | null): number | null {
  return value === null ? null : value / 1.609344;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/geo+json, application/json;q=0.9' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function parsePeriods(raw: unknown): NwsForecastPeriod[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((candidate): NwsForecastPeriod[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const p = candidate as Record<string, unknown>;
    if (typeof p.name !== 'string' || typeof p.startTime !== 'string' || typeof p.endTime !== 'string' || typeof p.temperature !== 'number') return [];
    const pop = p.probabilityOfPrecipitation && typeof p.probabilityOfPrecipitation === 'object'
      ? asNumber((p.probabilityOfPrecipitation as { value?: unknown }).value)
      : null;
    return [{
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      isDaytime: Boolean(p.isDaytime),
      temperature: p.temperature,
      temperatureUnit: typeof p.temperatureUnit === 'string' ? p.temperatureUnit : 'F',
      probabilityOfPrecipitation: pop,
      windSpeed: typeof p.windSpeed === 'string' ? p.windSpeed : '',
      windDirection: typeof p.windDirection === 'string' ? p.windDirection : '',
      shortForecast: typeof p.shortForecast === 'string' ? p.shortForecast : 'Forecast unavailable',
    }];
  });
}

function parseHourly(raw: unknown): NwsHourlyPeriod[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((candidate): NwsHourlyPeriod[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const p = candidate as Record<string, unknown>;
    if (typeof p.startTime !== 'string' || typeof p.temperature !== 'number') return [];
    const pop = p.probabilityOfPrecipitation && typeof p.probabilityOfPrecipitation === 'object'
      ? asNumber((p.probabilityOfPrecipitation as { value?: unknown }).value)
      : null;
    return [{
      startTime: p.startTime,
      temperature: p.temperature,
      temperatureUnit: typeof p.temperatureUnit === 'string' ? p.temperatureUnit : 'F',
      probabilityOfPrecipitation: pop,
      windSpeed: typeof p.windSpeed === 'string' ? p.windSpeed : '',
      windDirection: typeof p.windDirection === 'string' ? p.windDirection : '',
      shortForecast: typeof p.shortForecast === 'string' ? p.shortForecast : 'Forecast unavailable',
    }];
  });
}

async function loadObservation(stationsUrl: string | undefined, signal?: AbortSignal): Promise<CurrentObservation | null> {
  if (!stationsUrl) return null;
  try {
    const stations = await getJson<{ features?: Array<{ id?: string; properties?: { stationIdentifier?: string } }> }>(stationsUrl, signal);
    const stationUrl = stations.features?.find(feature => typeof feature.id === 'string')?.id;
    if (!stationUrl) return null;
    const latest = await getJson<{ properties?: Record<string, unknown> }>(`${stationUrl}/observations/latest`, signal);
    const p = latest.properties ?? {};
    return {
      temperatureF: cToF(quantity(p.temperature)),
      humidity: quantity(p.relativeHumidity),
      windMph: kmhToMph(quantity(p.windSpeed)),
      windDirection: typeof p.windDirection === 'object' && p.windDirection !== null
        ? (() => {
            const degrees = quantity(p.windDirection);
            if (degrees === null) return '';
            const dirs = ['N','NE','E','SE','S','SW','W','NW'];
            return dirs[Math.round(degrees / 45) % 8];
          })()
        : '',
      description: typeof p.textDescription === 'string' ? p.textDescription : '',
      time: typeof p.timestamp === 'string' ? p.timestamp : null,
    };
  } catch {
    return null;
  }
}

export async function loadForecastGraphicsData(signal?: AbortSignal): Promise<ForecastGraphicsData> {
  const point = await getJson<NwsPointResponse>(`${API_ROOT}/points/${HOME_LAT.toFixed(4)},${HOME_LON.toFixed(4)}`, signal);
  const properties = point.properties ?? {};
  if (!properties.forecast || !properties.forecastHourly) throw new Error('NWS point metadata did not provide forecast endpoints.');

  const [forecastResponse, hourlyResponse, observation] = await Promise.all([
    getJson<{ properties?: { periods?: unknown } }>(properties.forecast, signal),
    getJson<{ properties?: { periods?: unknown } }>(properties.forecastHourly, signal),
    loadObservation(properties.observationStations, signal),
  ]);

  const periods = parsePeriods(forecastResponse.properties?.periods);
  const hourly = parseHourly(hourlyResponse.properties?.periods);
  if (!periods.length || !hourly.length) throw new Error('NWS forecast response did not contain usable forecast periods.');

  const relative = properties.relativeLocation?.properties;
  const locationName = [relative?.city, relative?.state].filter(Boolean).join(', ') || 'San Antonio, TX';
  return { locationName, periods, hourly, observation, updatedAt: Date.now() };
}
