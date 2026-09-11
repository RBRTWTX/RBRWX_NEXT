import type {
  BroadcastGraphicsDocument,
  ResolvedTitleText,
  SceneTitleBinding,
} from './types.js';

export function activeSceneTitleBinding(
  document: BroadcastGraphicsDocument,
  sceneId = document.activeSceneId,
): SceneTitleBinding | null {
  if (!sceneId) return null;
  return document.titleBindings.find((binding) => binding.sceneId === sceneId) ?? null;
}

export function resolveTitleText(
  document: BroadcastGraphicsDocument,
  sceneId = document.activeSceneId,
): ResolvedTitleText {
  if (!sceneId) {
    return { sceneId: null, mode: 'blank', text: document.titleBar.fallbackBlankText };
  }
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  const binding = document.titleBindings.find((candidate) => candidate.sceneId === sceneId);
  if (!scene || !binding) {
    return { sceneId: null, mode: 'blank', text: document.titleBar.fallbackBlankText };
  }
  return {
    sceneId,
    mode: binding.mode,
    text: binding.mode === 'scene' ? scene.title : binding.blankText,
  };
}
