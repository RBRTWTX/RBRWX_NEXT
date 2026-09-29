import {useCurrentWeather} from '../current-weather/CurrentWeather';
import {imageryPresentation} from '../current-weather/imagery-presentation';
import type { ReactNode } from 'react';
import { useBroadcast } from '../broadcast';
import palettes from '../current-weather/palettes.json';
import { GraphicsProvider } from '../broadcast-graphics/Graphics';
export { GraphicsOverlay, GraphicsControls } from '../broadcast-graphics/Graphics';
export function GraphicsHost({ children }: { children: ReactNode }) {
  const weather=useCurrentWeather();
  const presentation=imageryPresentation(weather.product,weather.options,weather.snapshot.primaryRadarId??undefined);
  const { programScene, state } = useBroadcast();
  return <GraphicsProvider extraKeys={palettes.keys} scene={programScene ? { id: state.programItemId ?? programScene.id, title: programScene.title, weatherKeyId: programScene.weatherKeyId,...presentation } : null}>{children}</GraphicsProvider>;
}
