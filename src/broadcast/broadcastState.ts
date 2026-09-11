import type {
  BroadcastRundownItem,
  BroadcastRundownItemId,
  BroadcastSceneDefinition,
  BroadcastSceneId,
  BroadcastState,
  BroadcastTransition,
  BroadcastTransportState,
} from './broadcastTypes';

export const MIN_SCENE_HOLD_MS = 500;
export const MAX_SCENE_HOLD_MS = 86_400_000;

export function normalizeSceneHoldMs(value: number): number {
  if (!Number.isFinite(value)) return 8000;
  return Math.min(MAX_SCENE_HOLD_MS, Math.max(MIN_SCENE_HOLD_MS, Math.round(value)));
}


export function validateBroadcastSceneDefinitions(scenes: readonly BroadcastSceneDefinition[]): void {
  const ids = new Set<BroadcastSceneId>();
  for (const scene of scenes) {
    if (!scene.id.trim()) throw new Error('Broadcast scene id must not be empty.');
    if (scene.id !== scene.id.trim()) throw new Error(`Broadcast scene id must not contain surrounding whitespace: ${JSON.stringify(scene.id)}.`);
    if (ids.has(scene.id)) throw new Error(`Broadcast scene id is duplicated: ${scene.id}.`);
    if (!scene.title.trim()) throw new Error(`Broadcast scene ${scene.id} has an empty title.`);
    if (!scene.category.trim()) throw new Error(`Broadcast scene ${scene.id} has an empty category.`);
    if (!scene.contentKey.trim()) throw new Error(`Broadcast scene ${scene.id} has an empty contentKey.`);
    if (scene.contentKey !== scene.contentKey.trim()) throw new Error(`Broadcast scene ${scene.id} contentKey must not contain surrounding whitespace.`);
    if (!Number.isSafeInteger(scene.defaultHoldMs) || scene.defaultHoldMs < MIN_SCENE_HOLD_MS || scene.defaultHoldMs > MAX_SCENE_HOLD_MS) {
      throw new Error(`Broadcast scene ${scene.id} has invalid defaultHoldMs ${String(scene.defaultHoldMs)}.`);
    }
    ids.add(scene.id);
  }
}

export type BroadcastAction =
  | { type: 'select-library-scene'; sceneId: BroadcastSceneId }
  | { type: 'add-scene'; sceneId: BroadcastSceneId; holdMs: number }
  | { type: 'select-preview'; itemId: BroadcastRundownItemId }
  | { type: 'set-program'; itemId: BroadcastRundownItemId }
  | { type: 'remove-item'; itemId: BroadcastRundownItemId }
  | { type: 'move-item'; itemId: BroadcastRundownItemId; beforeItemId: BroadcastRundownItemId | null }
  | { type: 'set-transport'; transport: BroadcastTransportState }
  | { type: 'set-loop'; loop: boolean }
  | { type: 'set-transition'; transition: BroadcastTransition };

export function createInitialBroadcastState(initialSceneIds: readonly BroadcastSceneId[], holdMsByScene: ReadonlyMap<BroadcastSceneId, number>): BroadcastState {
  const rundown: BroadcastRundownItem[] = initialSceneIds.map((sceneId, index) => ({
    id: `rundown-${index + 1}`,
    sceneId,
    holdMs: normalizeSceneHoldMs(holdMsByScene.get(sceneId) ?? 8000),
  }));
  const firstItem = rundown[0] ?? null;

  return {
    selectedLibrarySceneId: firstItem?.sceneId ?? null,
    rundown,
    previewItemId: firstItem?.id ?? null,
    programItemId: firstItem?.id ?? null,
    transport: 'stopped',
    loop: false,
    transition: { kind: 'cut', durationMs: 0 },
    nextSequence: rundown.length + 1,
  };
}

function findIndex(state: BroadcastState, itemId: BroadcastRundownItemId | null): number {
  if (!itemId) return -1;
  return state.rundown.findIndex((item) => item.id === itemId);
}

export function adjacentProgramItemId(state: BroadcastState, direction: 1 | -1): BroadcastRundownItemId | null {
  if (state.rundown.length === 0) return null;
  const currentIndex = findIndex(state, state.programItemId);
  const fallbackIndex = direction === 1 ? 0 : state.rundown.length - 1;
  if (currentIndex < 0) return state.rundown[fallbackIndex]?.id ?? null;

  const candidate = currentIndex + direction;
  if (candidate >= 0 && candidate < state.rundown.length) return state.rundown[candidate]?.id ?? null;
  if (!state.loop) return null;
  return state.rundown[direction === 1 ? 0 : state.rundown.length - 1]?.id ?? null;
}


export function canPlayBroadcastState(state: BroadcastState): boolean {
  if (state.rundown.length < 2) return false;
  if (!state.programItemId) return state.previewItemId !== null;
  return adjacentProgramItemId(state, 1) !== null;
}

export function broadcastReducer(state: BroadcastState, action: BroadcastAction): BroadcastState {
  switch (action.type) {
    case 'select-library-scene':
      return { ...state, selectedLibrarySceneId: action.sceneId };

    case 'add-scene': {
      const item: BroadcastRundownItem = {
        id: `rundown-${state.nextSequence}`,
        sceneId: action.sceneId,
        holdMs: normalizeSceneHoldMs(action.holdMs),
      };
      return {
        ...state,
        rundown: [...state.rundown, item],
        selectedLibrarySceneId: action.sceneId,
        previewItemId: item.id,
        nextSequence: state.nextSequence + 1,
      };
    }

    case 'select-preview':
      return state.rundown.some((item) => item.id === action.itemId)
        ? { ...state, previewItemId: action.itemId }
        : state;

    case 'set-program':
      return state.rundown.some((item) => item.id === action.itemId)
        ? { ...state, programItemId: action.itemId, previewItemId: action.itemId }
        : state;

    case 'remove-item': {
      if (action.itemId === state.programItemId) return state;
      const removeIndex = findIndex(state, action.itemId);
      if (removeIndex < 0) return state;
      const rundown = state.rundown.filter((item) => item.id !== action.itemId);
      let previewItemId = state.previewItemId;
      if (previewItemId === action.itemId) {
        previewItemId = rundown[Math.min(removeIndex, Math.max(0, rundown.length - 1))]?.id ?? state.programItemId ?? null;
      }
      return { ...state, rundown, previewItemId };
    }

    case 'move-item': {
      if (action.itemId === action.beforeItemId) return state;
      const sourceIndex = findIndex(state, action.itemId);
      if (sourceIndex < 0) return state;
      const rundown = [...state.rundown];
      const [moved] = rundown.splice(sourceIndex, 1);
      if (!moved) return state;
      if (action.beforeItemId === null) {
        rundown.push(moved);
        return { ...state, rundown };
      }
      const targetIndex = rundown.findIndex((item) => item.id === action.beforeItemId);
      if (targetIndex < 0) return state;
      rundown.splice(targetIndex, 0, moved);
      return { ...state, rundown };
    }

    case 'set-transport':
      return { ...state, transport: action.transport };

    case 'set-loop':
      return { ...state, loop: action.loop };

    case 'set-transition':
      return { ...state, transition: action.transition };

    default:
      return state;
  }
}
