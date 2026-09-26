import type { ReactNode } from 'react';
import { useBroadcast } from '../broadcast';
import {
  ForecastGraphicsProvider,
  ForecastGraphicEditorStage,
  ForecastGraphicSnapshotStage,
  ForecastGraphicProperties,
  ForecastGraphicTools,
  ForecastGraphicObjectList,
  useForecastGraphics,
} from '../forecast-graphics/ForecastGraphics';
export type { ForecastGraphicsSnapshot } from '../forecast-graphics/model';
export { isForecastGraphicContent } from '../forecast-graphics/model';

export function ForecastGraphicsHost({ children }: { children: ReactNode }) {
  const { programScene, state } = useBroadcast();
  return <ForecastGraphicsProvider
    sceneId={programScene ? (state.programItemId ?? programScene.id) : null}
    contentKey={programScene?.contentKey}
    title={programScene?.title ?? 'Graphic Scene'}
  >{children}</ForecastGraphicsProvider>;
}

export {
  ForecastGraphicEditorStage,
  ForecastGraphicSnapshotStage,
  ForecastGraphicProperties,
  ForecastGraphicTools,
  ForecastGraphicObjectList,
  useForecastGraphics,
};
