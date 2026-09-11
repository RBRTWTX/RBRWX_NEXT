export const BROADCAST_GRAPHICS_SCHEMA_VERSION = 1 as const;

export type BroadcastGraphicKind = 'title-bar' | 'lower-third' | 'ticker';
export type TitleTextMode = 'scene' | 'blank';

export interface BroadcastDesignSize {
  width: number;
  height: number;
}

export interface BroadcastGraphicRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BroadcastSceneReference {
  id: string;
  title: string;
}

export interface SceneTitleBinding {
  sceneId: string;
  mode: TitleTextMode;
  blankText: string;
}

export interface GraphicVisibility {
  titleBar: boolean;
  lowerThird: boolean;
  ticker: boolean;
}

export interface TitleBarSettings {
  scalePercent: number;
  fallbackBlankText: string;
}

export interface LowerThirdSettings {
  headline: string;
  subheadline: string;
}

export interface TickerSettings {
  label: string;
  text: string;
}

export interface BroadcastGraphicsDocument {
  schemaVersion: typeof BROADCAST_GRAPHICS_SCHEMA_VERSION;
  design: BroadcastDesignSize;
  activeSceneId: string | null;
  scenes: BroadcastSceneReference[];
  titleBindings: SceneTitleBinding[];
  visibility: GraphicVisibility;
  titleBar: TitleBarSettings;
  lowerThird: LowerThirdSettings;
  ticker: TickerSettings;
}

export interface ResolvedTitleText {
  sceneId: string | null;
  mode: TitleTextMode;
  text: string;
}

interface RenderGraphicBase {
  id: BroadcastGraphicKind;
  kind: BroadcastGraphicKind;
  rect: BroadcastGraphicRect;
  zIndex: number;
}

export interface RenderTitleBar extends RenderGraphicBase {
  id: 'title-bar';
  kind: 'title-bar';
  text: string;
  titleMode: TitleTextMode;
}

export interface RenderLowerThird extends RenderGraphicBase {
  id: 'lower-third';
  kind: 'lower-third';
  headline: string;
  subheadline: string;
}

export interface RenderTicker extends RenderGraphicBase {
  id: 'ticker';
  kind: 'ticker';
  label: string;
  text: string;
}

export type RenderBroadcastGraphic = RenderTitleBar | RenderLowerThird | RenderTicker;

export interface BroadcastGraphicsRenderModel {
  schemaVersion: typeof BROADCAST_GRAPHICS_SCHEMA_VERSION;
  design: BroadcastDesignSize;
  sceneId: string | null;
  graphics: RenderBroadcastGraphic[];
}

export type BroadcastGraphicsCommand =
  | { type: 'register-scene'; scene: BroadcastSceneReference }
  | { type: 'remove-scene'; sceneId: string }
  | { type: 'set-active-scene'; sceneId: string | null }
  | { type: 'set-visible'; graphic: BroadcastGraphicKind; visible: boolean }
  | { type: 'set-title-mode'; sceneId: string; mode: TitleTextMode }
  | { type: 'set-blank-title-text'; sceneId: string; text: string }
  | { type: 'set-fallback-blank-title-text'; text: string }
  | { type: 'set-title-scale'; scalePercent: number }
  | { type: 'set-lower-third-text'; headline?: string; subheadline?: string }
  | { type: 'set-ticker-text'; label?: string; text?: string };
