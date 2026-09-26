export type ForecastGraphicTemplate =
  | 'right-now'
  | 'today'
  | 'tonight'
  | 'today-tonight'
  | 'hourly'
  | 'seven-day'
  | 'planner'
  | 'weekend'
  | 'need-to-know'
  | 'blank';

export type ForecastGraphicObjectKind = 'text' | 'textbox' | 'icon' | 'shape' | 'asset';
export type ForecastGraphicStyle =
  | 'headline'
  | 'subheadline'
  | 'day'
  | 'temperature'
  | 'condition'
  | 'metric'
  | 'body'
  | 'icon'
  | 'panel'
  | 'accent'
  | 'circle';

export interface ForecastGraphicObject {
  id: string;
  label: string;
  kind: ForecastGraphicObjectKind;
  style: ForecastGraphicStyle;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  scale?: number;
  autoKey?: string;
  text?: string;
  textOverride?: string;
  assetPath?: string;
  assetKind?: 'png' | 'svg';
}

export interface ForecastGraphicRenderObject extends ForecastGraphicObject {
  displayText?: string;
}

export interface ForecastGraphicsSnapshot {
  active: boolean;
  sceneId: string | null;
  template: ForecastGraphicTemplate | null;
  title: string;
  objects: ForecastGraphicRenderObject[];
}

export interface NwsForecastPeriod {
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  probabilityOfPrecipitation: number | null;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
}

export interface NwsHourlyPeriod {
  startTime: string;
  temperature: number;
  temperatureUnit: string;
  probabilityOfPrecipitation: number | null;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
}

export interface CurrentObservation {
  temperatureF: number | null;
  humidity: number | null;
  windMph: number | null;
  windDirection: string;
  description: string;
  time: string | null;
}

export interface ForecastGraphicsData {
  locationName: string;
  periods: NwsForecastPeriod[];
  hourly: NwsHourlyPeriod[];
  observation: CurrentObservation | null;
  updatedAt: number;
}

export interface GraphicAssetEntry {
  path: string;
  name: string;
  kind: 'png' | 'svg';
}

const CONTENT_TO_TEMPLATE: Record<string, ForecastGraphicTemplate> = {
  'graphic.right-now': 'right-now',
  'graphic.today': 'today',
  'graphic.tonight': 'tonight',
  'graphic.today-tonight': 'today-tonight',
  'graphic.hourly': 'hourly',
  'graphic.seven-day': 'seven-day',
  'graphic.planner': 'planner',
  'graphic.weekend': 'weekend',
  'graphic.need-to-know': 'need-to-know',
  'graphic.blank': 'blank',
};

export function isForecastGraphicContent(contentKey: string | undefined | null): boolean {
  return Boolean(contentKey && Object.hasOwn(CONTENT_TO_TEMPLATE, contentKey));
}

export function templateForContent(contentKey: string | undefined | null): ForecastGraphicTemplate | null {
  return contentKey ? CONTENT_TO_TEMPLATE[contentKey] ?? null : null;
}

const object = (
  id: string,
  label: string,
  kind: ForecastGraphicObjectKind,
  style: ForecastGraphicStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  autoKey?: string,
  text?: string,
): ForecastGraphicObject => ({ id, label, kind, style, x, y, w, h, z, scale: 1, autoKey, text });

const text = (id: string, label: string, style: ForecastGraphicStyle, x: number, y: number, w: number, h: number, z: number, autoKey?: string, value?: string) =>
  object(id, label, 'text', style, x, y, w, h, z, autoKey, value);
const icon = (id: string, label: string, x: number, y: number, w: number, h: number, z: number, autoKey?: string, value?: string) =>
  object(id, label, 'icon', 'icon', x, y, w, h, z, autoKey, value);
const panel = (id: string, label: string, x: number, y: number, w: number, h: number, z = 1) =>
  object(id, label, 'shape', 'panel', x, y, w, h, z);
const accent = (id: string, label: string, x: number, y: number, w: number, h: number, z = 2) =>
  object(id, label, 'shape', 'accent', x, y, w, h, z);

function commonHeader(title: string): ForecastGraphicObject[] {
  return [
    panel('header-panel', 'Header panel', 70, 58, 1780, 142, 2),
    accent('header-accent', 'Header accent', 70, 188, 1780, 12, 3),
    text('header-title', 'Scene title', 'headline', 108, 80, 900, 80, 6, undefined, title),
    text('header-location', 'Forecast location', 'subheadline', 1110, 94, 690, 48, 6, 'location'),
    text('header-updated', 'Forecast update time', 'metric', 1110, 143, 690, 32, 6, 'updated'),
  ];
}

function singlePeriod(templateTitle: string, binding: 'today' | 'tonight'): ForecastGraphicObject[] {
  return [
    ...commonHeader(templateTitle),
    panel('period-panel', 'Forecast panel', 150, 260, 1620, 650, 1),
    text('period-name', 'Period name', 'day', 210, 310, 600, 82, 5, `${binding}.name`),
    icon('period-icon', 'Weather icon', 230, 430, 280, 280, 6, `${binding}.icon`),
    text('period-temperature', 'Temperature', 'temperature', 600, 390, 500, 210, 6, `${binding}.temperature`),
    text('period-condition', 'Forecast condition', 'condition', 610, 610, 950, 78, 6, `${binding}.condition`),
    text('period-rain', 'Rain chance', 'metric', 610, 718, 420, 55, 6, `${binding}.pop`),
    text('period-wind', 'Wind', 'metric', 1080, 718, 520, 55, 6, `${binding}.wind`),
  ];
}

function todayTonight(): ForecastGraphicObject[] {
  const out = [...commonHeader('TODAY & TONIGHT')];
  const bindings = ['today', 'tonight'] as const;
  bindings.forEach((binding, index) => {
    const x = index === 0 ? 115 : 985;
    out.push(panel(`panel-${binding}`, `${binding} panel`, x, 255, 820, 680, 1));
    out.push(text(`${binding}-name`, `${binding} name`, 'day', x + 45, 300, 500, 70, 5, `${binding}.name`));
    out.push(icon(`${binding}-icon`, `${binding} icon`, x + 60, 430, 240, 240, 6, `${binding}.icon`));
    out.push(text(`${binding}-temperature`, `${binding} temperature`, 'temperature', x + 340, 405, 400, 190, 6, `${binding}.temperature`));
    out.push(text(`${binding}-condition`, `${binding} condition`, 'condition', x + 350, 610, 390, 80, 6, `${binding}.condition`));
    out.push(text(`${binding}-pop`, `${binding} rain chance`, 'metric', x + 70, 745, 320, 48, 6, `${binding}.pop`));
    out.push(text(`${binding}-wind`, `${binding} wind`, 'metric', x + 400, 745, 350, 48, 6, `${binding}.wind`));
  });
  return out;
}

function rightNow(): ForecastGraphicObject[] {
  return [
    ...commonHeader('RIGHT NOW'),
    panel('now-main', 'Current conditions panel', 135, 250, 1050, 680, 1),
    panel('now-side', 'Current details panel', 1235, 250, 550, 680, 1),
    text('now-kicker', 'Current conditions label', 'day', 210, 310, 650, 60, 5, undefined, 'CURRENT CONDITIONS'),
    text('now-temp', 'Current temperature', 'temperature', 210, 385, 600, 230, 6, 'obs.temperature'),
    icon('now-icon', 'Current weather icon', 800, 390, 280, 280, 6, 'obs.icon'),
    text('now-condition', 'Current condition', 'condition', 220, 665, 870, 80, 6, 'obs.condition'),
    text('now-humidity-label', 'Humidity label', 'subheadline', 1300, 330, 410, 44, 5, undefined, 'HUMIDITY'),
    text('now-humidity', 'Humidity value', 'temperature', 1300, 378, 410, 115, 6, 'obs.humidity'),
    text('now-wind-label', 'Wind label', 'subheadline', 1300, 545, 410, 44, 5, undefined, 'WIND'),
    text('now-wind', 'Wind value', 'condition', 1300, 595, 410, 90, 6, 'obs.wind'),
    text('now-time', 'Observation time', 'metric', 1300, 755, 410, 45, 6, 'obs.time'),
  ];
}

function hourly(): ForecastGraphicObject[] {
  const out = [...commonHeader('HOURLY FORECAST')];
  const count = 10;
  const gap = 12;
  const totalWidth = 1740;
  const cardWidth = (totalWidth - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++) {
    const x = 90 + i * (cardWidth + gap);
    out.push(panel(`hour-${i}-panel`, `Hour ${i + 1} panel`, x, 280, cardWidth, 640, 1));
    out.push(text(`hour-${i}-time`, `Hour ${i + 1} time`, 'day', x + 8, 315, cardWidth - 16, 52, 5, `hour:${i}:time`));
    out.push(icon(`hour-${i}-icon`, `Hour ${i + 1} icon`, x + 22, 400, cardWidth - 44, 150, 6, `hour:${i}:icon`));
    out.push(text(`hour-${i}-temp`, `Hour ${i + 1} temperature`, 'temperature', x + 8, 565, cardWidth - 16, 110, 6, `hour:${i}:temperature`));
    out.push(text(`hour-${i}-pop`, `Hour ${i + 1} rain chance`, 'metric', x + 8, 700, cardWidth - 16, 42, 6, `hour:${i}:pop`));
    out.push(text(`hour-${i}-condition`, `Hour ${i + 1} condition`, 'body', x + 10, 770, cardWidth - 20, 95, 6, `hour:${i}:condition`));
  }
  return out;
}

function sevenDay(): ForecastGraphicObject[] {
  const out = [...commonHeader('7-DAY FORECAST')];
  const count = 7;
  const gap = 18;
  const totalWidth = 1740;
  const cardWidth = (totalWidth - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++) {
    const x = 90 + i * (cardWidth + gap);
    out.push(panel(`day-${i}-panel`, `Day ${i + 1} panel`, x, 260, cardWidth, 675, 1));
    out.push(text(`day-${i}-name`, `Day ${i + 1} name`, 'day', x + 10, 300, cardWidth - 20, 64, 5, `day:${i}:name`));
    out.push(icon(`day-${i}-icon`, `Day ${i + 1} icon`, x + 30, 405, cardWidth - 60, 175, 6, `day:${i}:icon`));
    out.push(text(`day-${i}-high`, `Day ${i + 1} high`, 'temperature', x + 10, 600, cardWidth - 20, 115, 6, `day:${i}:high`));
    out.push(text(`day-${i}-low`, `Day ${i + 1} low`, 'condition', x + 10, 720, cardWidth - 20, 58, 6, `day:${i}:low`));
    out.push(text(`day-${i}-pop`, `Day ${i + 1} rain chance`, 'metric', x + 10, 800, cardWidth - 20, 42, 6, `day:${i}:pop`));
    out.push(text(`day-${i}-condition`, `Day ${i + 1} condition`, 'body', x + 10, 855, cardWidth - 20, 60, 6, `day:${i}:condition`));
  }
  return out;
}

function planner(): ForecastGraphicObject[] {
  const out = [...commonHeader('PLANNER')];
  const labels = ['MORNING', 'MIDDAY', 'EVENING', 'LATE'];
  for (let i = 0; i < 4; i++) {
    const x = 105 + i * 440;
    out.push(panel(`planner-${i}-panel`, `${labels[i]} panel`, x, 270, 405, 655, 1));
    out.push(text(`planner-${i}-label`, `${labels[i]} label`, 'day', x + 35, 320, 335, 58, 5, undefined, labels[i]));
    out.push(text(`planner-${i}-time`, `${labels[i]} time`, 'metric', x + 35, 390, 335, 42, 5, `planner:${i}:time`));
    out.push(icon(`planner-${i}-icon`, `${labels[i]} icon`, x + 90, 465, 225, 190, 6, `planner:${i}:icon`));
    out.push(text(`planner-${i}-temp`, `${labels[i]} temperature`, 'temperature', x + 40, 665, 325, 115, 6, `planner:${i}:temperature`));
    out.push(text(`planner-${i}-condition`, `${labels[i]} condition`, 'body', x + 35, 805, 335, 85, 6, `planner:${i}:condition`));
  }
  return out;
}

function weekend(): ForecastGraphicObject[] {
  const out = [...commonHeader('WEEKEND FORECAST')];
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? 140 : 990;
    out.push(panel(`weekend-${i}-panel`, `Weekend day ${i + 1} panel`, x, 260, 790, 680, 1));
    out.push(text(`weekend-${i}-name`, `Weekend day ${i + 1} name`, 'day', x + 60, 315, 500, 70, 5, `weekend:${i}:name`));
    out.push(icon(`weekend-${i}-icon`, `Weekend day ${i + 1} icon`, x + 65, 440, 245, 245, 6, `weekend:${i}:icon`));
    out.push(text(`weekend-${i}-high`, `Weekend day ${i + 1} high`, 'temperature', x + 340, 410, 360, 150, 6, `weekend:${i}:high`));
    out.push(text(`weekend-${i}-low`, `Weekend day ${i + 1} low`, 'condition', x + 350, 570, 330, 65, 6, `weekend:${i}:low`));
    out.push(text(`weekend-${i}-condition`, `Weekend day ${i + 1} condition`, 'condition', x + 350, 655, 330, 85, 6, `weekend:${i}:condition`));
    out.push(text(`weekend-${i}-pop`, `Weekend day ${i + 1} rain chance`, 'metric', x + 80, 790, 270, 50, 6, `weekend:${i}:pop`));
    out.push(text(`weekend-${i}-wind`, `Weekend day ${i + 1} wind`, 'metric', x + 365, 790, 320, 50, 6, `weekend:${i}:wind`));
  }
  return out;
}

function needToKnow(): ForecastGraphicObject[] {
  const out = [...commonHeader('NEED TO KNOW')];
  const defaults = [
    ['HEADLINE 1', 'Double-click this text to type your first key weather message.'],
    ['HEADLINE 2', 'Add or remove text, icons, PNGs and SVGs directly on the canvas.'],
    ['HEADLINE 3', 'Select any item and press Delete to remove it from this scene.'],
  ];
  defaults.forEach(([headline, detail], index) => {
    const y = 285 + index * 210;
    out.push(panel(`ntk-${index}-panel`, `Need to Know item ${index + 1} panel`, 180, y, 1560, 170, 1));
    out.push(accent(`ntk-${index}-accent`, `Need to Know item ${index + 1} accent`, 180, y, 18, 170, 3));
    out.push(text(`ntk-${index}-headline`, `Need to Know headline ${index + 1}`, 'day', 245, y + 28, 610, 55, 6, undefined, headline));
    out.push(object(`ntk-${index}-detail`, `Need to Know detail ${index + 1}`, 'textbox', 'body', 245, y + 88, 1370, 56, 6, undefined, detail));
  });
  return out;
}

export function freshSceneObjects(template: ForecastGraphicTemplate): ForecastGraphicObject[] {
  switch (template) {
    case 'right-now': return rightNow();
    case 'today': return singlePeriod('TODAY', 'today');
    case 'tonight': return singlePeriod('TONIGHT', 'tonight');
    case 'today-tonight': return todayTonight();
    case 'hourly': return hourly();
    case 'seven-day': return sevenDay();
    case 'planner': return planner();
    case 'weekend': return weekend();
    case 'need-to-know': return needToKnow();
    case 'blank': return [];
  }
}

export function nextObjectId(existing: readonly ForecastGraphicObject[], prefix: string): string {
  let index = existing.length + 1;
  let id = `${prefix}-${index}`;
  const used = new Set(existing.map(item => item.id));
  while (used.has(id)) id = `${prefix}-${++index}`;
  return id;
}

export function weatherSymbol(description: string | null | undefined): string {
  const value = String(description ?? '').toLowerCase();
  if (/thunder|storm/.test(value)) return '⚡';
  if (/snow|sleet|ice|freez/.test(value)) return '❄';
  if (/rain|shower|drizzle/.test(value)) return '☂';
  if (/fog|mist|haze|smoke/.test(value)) return '≋';
  if (/cloud|overcast/.test(value)) return '☁';
  if (/night|clear/.test(value)) return '☾';
  return '☀';
}

function asDegrees(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}°` : '—';
}

function percent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '—';
}

function shortTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
}

function periodFor(data: ForecastGraphicsData | null, which: 'today' | 'tonight'): NwsForecastPeriod | null {
  if (!data) return null;
  const daytime = which === 'today';
  return data.periods.find(period => period.isDaytime === daytime) ?? null;
}

interface DailySummary {
  name: string;
  high: number | null;
  low: number | null;
  pop: number | null;
  condition: string;
}

function dailySummaries(data: ForecastGraphicsData | null): DailySummary[] {
  if (!data) return [];
  const buckets = new Map<string, { date: Date; day?: NwsForecastPeriod; night?: NwsForecastPeriod }>();
  for (const period of data.periods) {
    const date = new Date(period.startTime);
    if (!Number.isFinite(date.getTime())) continue;
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const bucket = buckets.get(key) ?? { date };
    if (period.isDaytime) bucket.day = period; else bucket.night = period;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].slice(0, 7).map(bucket => ({
    name: bucket.date.toLocaleDateString([], { weekday: 'short' }).toUpperCase(),
    high: bucket.day?.temperature ?? null,
    low: bucket.night?.temperature ?? null,
    pop: Math.max(bucket.day?.probabilityOfPrecipitation ?? 0, bucket.night?.probabilityOfPrecipitation ?? 0),
    condition: bucket.day?.shortForecast ?? bucket.night?.shortForecast ?? 'Forecast unavailable',
  }));
}

function weekendSummaries(data: ForecastGraphicsData | null): DailySummary[] {
  const days = dailySummaries(data);
  const weekend = days.filter(day => day.name === 'SAT' || day.name === 'SUN');
  if (weekend.length >= 2) return weekend.slice(0, 2);
  return days.slice(-2);
}

function hourlyForPlanner(data: ForecastGraphicsData | null, index: number): NwsHourlyPeriod | null {
  if (!data?.hourly.length) return null;
  const offsets = [0, 3, 6, 9];
  return data.hourly[offsets[index] ?? 0] ?? null;
}

function formatPeriodValue(period: NwsForecastPeriod | null, field: string): string {
  if (!period) return '—';
  if (field === 'name') return period.name.toUpperCase();
  if (field === 'temperature') return asDegrees(period.temperature);
  if (field === 'condition') return period.shortForecast.toUpperCase();
  if (field === 'pop') return `RAIN ${percent(period.probabilityOfPrecipitation)}`;
  if (field === 'wind') return `${period.windDirection} ${period.windSpeed}`.trim().toUpperCase();
  if (field === 'icon') return weatherSymbol(period.shortForecast);
  return '—';
}

export function resolveAutoText(autoKey: string | undefined, data: ForecastGraphicsData | null): string {
  if (!autoKey) return '';
  if (autoKey === 'location') return data?.locationName?.toUpperCase() || 'SAN ANTONIO, TX';
  if (autoKey === 'updated') return data ? `UPDATED ${new Date(data.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'UPDATING';

  if (autoKey.startsWith('obs.')) {
    const observation = data?.observation;
    const field = autoKey.slice(4);
    if (field === 'temperature') return asDegrees(observation?.temperatureF);
    if (field === 'humidity') return percent(observation?.humidity);
    if (field === 'condition') return (observation?.description || periodFor(data, 'today')?.shortForecast || 'CURRENT CONDITIONS').toUpperCase();
    if (field === 'icon') return weatherSymbol(observation?.description || periodFor(data, 'today')?.shortForecast);
    if (field === 'wind') return observation?.windMph === null || observation?.windMph === undefined ? '—' : `${observation.windDirection} ${Math.round(observation.windMph)} MPH`.trim().toUpperCase();
    if (field === 'time') return observation?.time ? `OBS ${shortTime(observation.time)}` : 'OBS —';
  }

  for (const which of ['today', 'tonight'] as const) {
    if (autoKey.startsWith(`${which}.`)) return formatPeriodValue(periodFor(data, which), autoKey.slice(which.length + 1));
  }

  const hourMatch = /^hour:(\d+):(time|temperature|condition|pop|icon)$/.exec(autoKey);
  if (hourMatch) {
    const period = data?.hourly[Number(hourMatch[1])] ?? null;
    const field = hourMatch[2];
    if (!period) return '—';
    if (field === 'time') return shortTime(period.startTime).toUpperCase();
    if (field === 'temperature') return asDegrees(period.temperature);
    if (field === 'condition') return period.shortForecast.toUpperCase();
    if (field === 'pop') return `RAIN ${percent(period.probabilityOfPrecipitation)}`;
    if (field === 'icon') return weatherSymbol(period.shortForecast);
  }

  const dayMatch = /^day:(\d+):(name|high|low|condition|pop|icon)$/.exec(autoKey);
  if (dayMatch) {
    const day = dailySummaries(data)[Number(dayMatch[1])];
    const field = dayMatch[2];
    if (!day) return '—';
    if (field === 'name') return day.name;
    if (field === 'high') return asDegrees(day.high);
    if (field === 'low') return `LOW ${asDegrees(day.low)}`;
    if (field === 'condition') return day.condition.toUpperCase();
    if (field === 'pop') return `RAIN ${percent(day.pop)}`;
    if (field === 'icon') return weatherSymbol(day.condition);
  }

  const weekendMatch = /^weekend:(\d+):(name|high|low|condition|pop|wind|icon)$/.exec(autoKey);
  if (weekendMatch) {
    const day = weekendSummaries(data)[Number(weekendMatch[1])];
    const field = weekendMatch[2];
    if (!day) return '—';
    if (field === 'name') return day.name === 'SAT' ? 'SATURDAY' : day.name === 'SUN' ? 'SUNDAY' : day.name;
    if (field === 'high') return asDegrees(day.high);
    if (field === 'low') return `LOW ${asDegrees(day.low)}`;
    if (field === 'condition') return day.condition.toUpperCase();
    if (field === 'pop') return `RAIN ${percent(day.pop)}`;
    if (field === 'wind') {
      const source = data?.periods.find(period => period.name.toUpperCase().startsWith(day.name === 'SAT' ? 'SAT' : 'SUN'));
      return source ? `${source.windDirection} ${source.windSpeed}`.trim().toUpperCase() : '—';
    }
    if (field === 'icon') return weatherSymbol(day.condition);
  }

  const plannerMatch = /^planner:(\d+):(time|temperature|condition|icon)$/.exec(autoKey);
  if (plannerMatch) {
    const period = hourlyForPlanner(data, Number(plannerMatch[1]));
    const field = plannerMatch[2];
    if (!period) return '—';
    if (field === 'time') return shortTime(period.startTime).toUpperCase();
    if (field === 'temperature') return asDegrees(period.temperature);
    if (field === 'condition') return period.shortForecast.toUpperCase();
    if (field === 'icon') return weatherSymbol(period.shortForecast);
  }

  return '—';
}

export function displayText(item: ForecastGraphicObject, data: ForecastGraphicsData | null): string {
  if (item.textOverride !== undefined) return item.textOverride;
  if (item.autoKey) return resolveAutoText(item.autoKey, data);
  return item.text ?? '';
}
