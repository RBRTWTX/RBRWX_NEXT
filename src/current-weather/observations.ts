import type { Observation } from './model';
type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue => v !== null && typeof v === 'object' ? v as RecordValue : {};
function quantity(value: unknown, unit: string): number | null { const v = record(value); return v.unitCode === `wmoUnit:${unit}` && typeof v.value === 'number' && Number.isFinite(v.value) && !['X','Z'].includes(String(v.qualityControl)) ? v.value : null; }
export function parseObservation(raw: unknown, station: {id:string;name:string;lng:number;lat:number}): Observation | null {
  const p = record(record(raw).properties), time = Date.parse(String(p.timestamp));
  if (!Number.isFinite(time)) return null;
  return { ...station, time, temperature: quantity(p.temperature,'degC'), dewpoint: quantity(p.dewpoint,'degC'), wind: quantity(p.windSpeed,'km_h-1'), gust: quantity(p.windGust,'km_h-1'), humidity: quantity(p.relativeHumidity,'percent'), description: typeof p.textDescription === 'string' ? p.textDescription : 'Conditions unavailable', cached: false };
}
async function json(url: string, signal: AbortSignal): Promise<RecordValue> {
  if (new URL(url).origin !== 'https://api.weather.gov') throw Error('Unexpected observation service');
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { Accept: 'application/geo+json' } });
  if (!response.ok) throw Error(`NWS observations unavailable (${response.status})`);
  return record(await response.json());
}
export class ObservationsClient {
  private areas = new Map<string, Observation[]>();
  private cache = new Map<string, { received: number; data: Observation }>();
  private stations = new Map<string, { received: number; url: string }>();
  async load(lng: number, lat: number, signal: AbortSignal): Promise<Observation[]> {
    const area = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    try { const data = await this.loadFresh(lng, lat, signal); this.areas.set(area, data); if (this.areas.size > 50) this.areas.delete(this.areas.keys().next().value!); return data; }
    catch (error) { if (signal.aborted) throw error; const cached = this.areas.get(area); if (cached?.length) return cached.map(o => ({ ...o, cached: true })); throw error; }
  }
  private async loadFresh(lng: number, lat: number, signal: AbortSignal): Promise<Observation[]> {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    let lookup = this.stations.get(key);
    if (!lookup || Date.now() - lookup.received > 3600000) { const point = await json(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`, signal); const url = record(point.properties).observationStations; if (typeof url !== 'string') throw Error('No NWS observation stations for this location'); lookup = { received: Date.now(), url }; this.stations.set(key, lookup); if(this.stations.size>100)this.stations.delete(this.stations.keys().next().value!); }
    const list = await json(lookup.url, signal);
    const stations = (Array.isArray(list.features) ? list.features : []).flatMap(f => { const p = record(record(f).properties), coordinates = record(record(f).geometry).coordinates; if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) || typeof p.stationIdentifier !== 'string' || !/^[A-Z0-9_-]{3,12}$/.test(p.stationIdentifier)) return []; return [{ id:p.stationIdentifier,name:String(p.name ?? p.stationIdentifier),lng:Number(coordinates[0]),lat:Number(coordinates[1]) }]; }).sort((a,b)=>Math.hypot((a.lng-lng)*Math.cos(lat*Math.PI/180),a.lat-lat)-Math.hypot((b.lng-lng)*Math.cos(lat*Math.PI/180),b.lat-lat)).slice(0,12);
    const results: Observation[] = [];
    // Four requests at a time; retain a station's original timestamp on failure.
    for(let offset=0;offset<stations.length;offset+=4){await Promise.all(stations.slice(offset,offset+4).map(async station=>{
      if(signal.aborted)return; const cached=this.cache.get(station.id);
      if(cached && Date.now()-cached.received<60000){results.push({...cached.data,cached:true});return;}
      try { const raw=await json(`https://api.weather.gov/stations/${station.id}/observations/latest`,signal);const data=parseObservation(raw,station);if(!data)throw Error('Missing observation timestamp');this.cache.set(station.id,{received:Date.now(),data});results.push(data); }
      catch { if(!signal.aborted&&cached)results.push({...cached.data,cached:true}); }
    }));}
    while(this.cache.size>500){const first=this.cache.keys().next().value;if(first)this.cache.delete(first);else break;}
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    if(!results.length)throw Error('No station observations available near the map center');
    return results.sort((a,b)=>a.id.localeCompare(b.id));
  }
}
