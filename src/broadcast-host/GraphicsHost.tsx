import {useRadarOverlay} from './RadarOverlay';
import {useCurrentWeather} from '../current-weather/CurrentWeather';
import {imageryPresentation} from '../current-weather/imagery-presentation';
import type { ReactNode } from 'react';
import { useBroadcast } from '../broadcast';
import palettes from '../current-weather/palettes.json';
import { GraphicsProvider } from '../broadcast-graphics/Graphics';
export { GraphicsOverlay, GraphicsControls } from '../broadcast-graphics/Graphics';
export function GraphicsHost({ children }: { children: ReactNode }) {
  const weather=useCurrentWeather();
  const radar=useRadarOverlay();
  const { programScene, state } = useBroadcast();
  const presentation=programScene?.contentKey==='current.radar'?imageryPresentation('radar',radar.options,radar.snapshot.primaryRadarId??undefined):imageryPresentation(weather.product,weather.options,weather.snapshot.primaryRadarId??undefined);
  return <GraphicsProvider extraKeys={palettes.keys} scene={programScene ? { id: `${programScene.id}:${state.programItemId ?? 'direct'}`, title: programScene.title, weatherKeyId: programScene.weatherKeyId,...presentation } : null}>{children}</GraphicsProvider>;
}
