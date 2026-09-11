export type BroadcastSceneId = string;
export type BroadcastRundownItemId = string;

export interface BroadcastSceneDefinition {
  id: BroadcastSceneId;
  title: string;
  subtitle: string;
  category: string;
  contentKey: string;
  defaultHoldMs: number;
}

export interface BroadcastRundownItem {
  id: BroadcastRundownItemId;
  sceneId: BroadcastSceneId;
  holdMs: number;
}

export type BroadcastTransportState = 'stopped' | 'playing' | 'paused';
export type BroadcastTransitionKind = 'cut' | 'dissolve' | 'fade';
export type BroadcastTakeSource = 'take' | 'next' | 'previous' | 'playback';

export interface BroadcastTransition {
  kind: BroadcastTransitionKind;
  durationMs: number;
}

export interface BroadcastTakeCommand {
  source: BroadcastTakeSource;
  fromItemId: BroadcastRundownItemId | null;
  toItemId: BroadcastRundownItemId;
  fromScene: BroadcastSceneDefinition | null;
  toScene: BroadcastSceneDefinition;
  transition: BroadcastTransition;
}

export interface BroadcastState {
  selectedLibrarySceneId: BroadcastSceneId | null;
  rundown: BroadcastRundownItem[];
  previewItemId: BroadcastRundownItemId | null;
  programItemId: BroadcastRundownItemId | null;
  transport: BroadcastTransportState;
  loop: boolean;
  transition: BroadcastTransition;
  nextSequence: number;
}
