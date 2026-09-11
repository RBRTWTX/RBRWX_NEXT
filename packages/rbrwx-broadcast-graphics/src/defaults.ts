import {
  BROADCAST_GRAPHICS_SCHEMA_VERSION,
  type BroadcastGraphicsDocument,
} from './types.js';

export const BROADCAST_DESIGN_SIZE = Object.freeze({ width: 1920, height: 1080 });
export const TITLE_SCALE_MIN = 50;
export const TITLE_SCALE_MAX = 100;

export const RBR_TW_COLORS = Object.freeze({
  navy: '#032568',
  purple: '#531e78',
  magenta: '#cb1678',
  panel: '#132230',
  panelDeep: '#07111a',
  text: '#f5f8fb',
  mutedText: '#a9bac8',
});

export function createBroadcastGraphicsDocument(): BroadcastGraphicsDocument {
  return {
    schemaVersion: BROADCAST_GRAPHICS_SCHEMA_VERSION,
    design: { ...BROADCAST_DESIGN_SIZE },
    activeSceneId: null,
    scenes: [],
    titleBindings: [],
    visibility: {
      titleBar: false,
      lowerThird: false,
      ticker: false,
    },
    titleBar: {
      scalePercent: 100,
      fallbackBlankText: '',
    },
    lowerThird: {
      headline: '',
      subheadline: '',
    },
    ticker: {
      label: 'LIVE',
      text: '',
    },
  };
}

export function cloneBroadcastGraphicsDocument(
  document: BroadcastGraphicsDocument,
): BroadcastGraphicsDocument {
  return structuredClone(document);
}
