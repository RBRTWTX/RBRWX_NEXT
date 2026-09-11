import { BROADCAST_GRAPHICS_SCHEMA_VERSION } from './types.js';
import { resolveTitleText } from './resolve.js';
import { assertBroadcastGraphicsDocument } from './validation.js';
import type {
  BroadcastGraphicRect,
  BroadcastGraphicsDocument,
  BroadcastGraphicsRenderModel,
} from './types.js';

const TITLE_BASE_RECT = Object.freeze({ x: 24, y: 27, width: 1872, height: 108 });
const LOWER_THIRD_RECT = Object.freeze({ x: 77, y: 842, width: 1766, height: 120 });
const TICKER_RECT = Object.freeze({ x: 77, y: 974, width: 1766, height: 56 });

function scaledTitleRect(scalePercent: number): BroadcastGraphicRect {
  const factor = scalePercent / 100;
  const width = Math.round(TITLE_BASE_RECT.width * factor);
  const height = Math.round(TITLE_BASE_RECT.height * factor);
  return {
    x: Math.round((1920 - width) / 2),
    y: TITLE_BASE_RECT.y,
    width,
    height,
  };
}

export function buildBroadcastGraphicsRenderModel(
  document: BroadcastGraphicsDocument,
  sceneId = document.activeSceneId,
): BroadcastGraphicsRenderModel {
  assertBroadcastGraphicsDocument(document);
  const graphics: BroadcastGraphicsRenderModel['graphics'] = [];
  if (document.visibility.titleBar) {
    const title = resolveTitleText(document, sceneId);
    graphics.push({
      id: 'title-bar',
      kind: 'title-bar',
      rect: scaledTitleRect(document.titleBar.scalePercent),
      zIndex: 100,
      text: title.text,
      titleMode: title.mode,
    });
  }
  if (document.visibility.lowerThird) {
    graphics.push({
      id: 'lower-third',
      kind: 'lower-third',
      rect: { ...LOWER_THIRD_RECT },
      zIndex: 200,
      headline: document.lowerThird.headline,
      subheadline: document.lowerThird.subheadline,
    });
  }
  if (document.visibility.ticker) {
    graphics.push({
      id: 'ticker',
      kind: 'ticker',
      rect: { ...TICKER_RECT },
      zIndex: 300,
      label: document.ticker.label,
      text: document.ticker.text,
    });
  }
  return {
    schemaVersion: BROADCAST_GRAPHICS_SCHEMA_VERSION,
    design: { ...document.design },
    sceneId,
    graphics,
  };
}
