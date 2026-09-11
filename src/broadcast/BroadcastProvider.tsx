import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { adjacentProgramItemId, broadcastReducer, canPlayBroadcastState, createInitialBroadcastState, validateBroadcastSceneDefinitions } from './broadcastState';
import type {
  BroadcastRundownItemId,
  BroadcastSceneDefinition,
  BroadcastSceneId,
  BroadcastState,
  BroadcastTakeCommand,
  BroadcastTakeSource,
  BroadcastTransition,
  BroadcastTransitionKind,
} from './broadcastTypes';

interface BroadcastProviderProps {
  scenes: readonly BroadcastSceneDefinition[];
  initialRundownSceneIds?: readonly BroadcastSceneId[];
  onTake?: (command: BroadcastTakeCommand) => void;
  children: ReactNode;
}

export interface BroadcastRuntime {
  scenes: readonly BroadcastSceneDefinition[];
  state: BroadcastState;
  selectedLibraryScene: BroadcastSceneDefinition | null;
  previewScene: BroadcastSceneDefinition | null;
  programScene: BroadcastSceneDefinition | null;
  canPlay: boolean;
  selectLibraryScene: (sceneId: BroadcastSceneId) => void;
  addScene: (sceneId: BroadcastSceneId) => void;
  selectPreview: (itemId: BroadcastRundownItemId) => void;
  removeItem: (itemId: BroadcastRundownItemId) => void;
  moveItem: (itemId: BroadcastRundownItemId, beforeItemId: BroadcastRundownItemId | null) => void;
  takePreview: () => void;
  previous: () => void;
  next: () => void;
  play: () => void;
  pause: () => void;
  setLoop: (loop: boolean) => void;
  setTransitionKind: (kind: BroadcastTransitionKind) => void;
  setTransitionDuration: (durationMs: number) => void;
}

const BroadcastContext = createContext<BroadcastRuntime | null>(null);


function buildSceneMap(scenes: readonly BroadcastSceneDefinition[]): Map<BroadcastSceneId, BroadcastSceneDefinition> {
  validateBroadcastSceneDefinitions(scenes);
  return new Map(scenes.map((scene) => [scene.id, scene]));
}

function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(3000, Math.max(0, Math.round(value / 50) * 50));
}

export function BroadcastProvider({ scenes, initialRundownSceneIds, onTake, children }: BroadcastProviderProps) {
  const sceneMap = useMemo(() => buildSceneMap(scenes), [scenes]);
  const holdMsByScene = useMemo(() => new Map(scenes.map((scene) => [scene.id, scene.defaultHoldMs])), [scenes]);
  const initialIds = initialRundownSceneIds ?? (scenes[0] ? [scenes[0].id] : []);

  for (const sceneId of initialIds) {
    if (!sceneMap.has(sceneId)) throw new Error(`Broadcast initial rundown references unknown scene ${sceneId}.`);
  }

  const [state, dispatch] = useReducer(
    broadcastReducer,
    createInitialBroadcastState(initialIds, holdMsByScene),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const sceneForItem = useCallback((itemId: BroadcastRundownItemId | null): BroadcastSceneDefinition | null => {
    if (!itemId) return null;
    const item = stateRef.current.rundown.find((candidate) => candidate.id === itemId);
    return item ? sceneMap.get(item.sceneId) ?? null : null;
  }, [sceneMap]);

  const takeItem = useCallback((itemId: BroadcastRundownItemId, source: BroadcastTakeSource) => {
    const current = stateRef.current;
    const item = current.rundown.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const toScene = sceneMap.get(item.sceneId);
    if (!toScene) return;
    const fromItemId = current.programItemId;
    const fromScene = sceneForItem(fromItemId);
    const transition = current.transition;

    dispatch({ type: 'set-program', itemId });
    onTake?.({ source, fromItemId, toItemId: itemId, fromScene, toScene, transition });
  }, [onTake, sceneForItem, sceneMap]);

  const stepProgram = useCallback((direction: 1 | -1, source: BroadcastTakeSource) => {
    const current = stateRef.current;
    const target = adjacentProgramItemId(current, direction);
    if (!target) {
      if (source === 'playback' || stateRef.current.transport === 'playing') dispatch({ type: 'set-transport', transport: 'stopped' });
      return;
    }
    takeItem(target, source);
  }, [takeItem]);

  const programHoldMs = state.programItemId
    ? state.rundown.find((item) => item.id === state.programItemId)?.holdMs ?? null
    : null;

  useEffect(() => {
    if (state.transport !== 'playing' || !state.programItemId || programHoldMs === null) return;
    const timer = window.setTimeout(() => stepProgram(1, 'playback'), programHoldMs);
    return () => window.clearTimeout(timer);
  }, [programHoldMs, state.programItemId, state.transport, stepProgram]);

  const selectedLibraryScene = state.selectedLibrarySceneId ? sceneMap.get(state.selectedLibrarySceneId) ?? null : null;
  const previewScene = sceneForItem(state.previewItemId);
  const programScene = sceneForItem(state.programItemId);
  const canPlay = canPlayBroadcastState(state);

  const runtime = useMemo<BroadcastRuntime>(() => ({
    scenes,
    state,
    selectedLibraryScene,
    previewScene,
    programScene,
    canPlay,
    selectLibraryScene: (sceneId) => {
      if (sceneMap.has(sceneId)) dispatch({ type: 'select-library-scene', sceneId });
    },
    addScene: (sceneId) => {
      const scene = sceneMap.get(sceneId);
      if (scene) dispatch({ type: 'add-scene', sceneId, holdMs: scene.defaultHoldMs });
    },
    selectPreview: (itemId) => dispatch({ type: 'select-preview', itemId }),
    removeItem: (itemId) => dispatch({ type: 'remove-item', itemId }),
    moveItem: (itemId, beforeItemId) => dispatch({ type: 'move-item', itemId, beforeItemId }),
    takePreview: () => {
      const itemId = stateRef.current.previewItemId;
      if (itemId) takeItem(itemId, 'take');
    },
    previous: () => stepProgram(-1, 'previous'),
    next: () => stepProgram(1, 'next'),
    play: () => {
      const current = stateRef.current;
      if (!canPlayBroadcastState(current)) {
        dispatch({ type: 'set-transport', transport: 'stopped' });
        return;
      }
      if (!current.programItemId && current.previewItemId) takeItem(current.previewItemId, 'playback');
      dispatch({ type: 'set-transport', transport: 'playing' });
    },
    pause: () => dispatch({ type: 'set-transport', transport: 'paused' }),
    setLoop: (loop) => dispatch({ type: 'set-loop', loop }),
    setTransitionKind: (kind) => {
      const defaults: Record<BroadcastTransitionKind, number> = { cut: 0, dissolve: 500, fade: 750 };
      const transition: BroadcastTransition = { kind, durationMs: kind === 'cut' ? 0 : Math.max(stateRef.current.transition.durationMs, defaults[kind]) };
      dispatch({ type: 'set-transition', transition });
    },
    setTransitionDuration: (durationMs) => {
      const current = stateRef.current.transition;
      dispatch({ type: 'set-transition', transition: { ...current, durationMs: current.kind === 'cut' ? 0 : clampDuration(durationMs) } });
    },
  }), [canPlay, programScene, previewScene, scenes, sceneMap, selectedLibraryScene, state, stepProgram, takeItem]);

  return <BroadcastContext.Provider value={runtime}>{children}</BroadcastContext.Provider>;
}

export function useBroadcast(): BroadcastRuntime {
  const value = useContext(BroadcastContext);
  if (!value) throw new Error('useBroadcast must be used inside BroadcastProvider.');
  return value;
}
