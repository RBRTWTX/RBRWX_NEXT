import { TITLE_SCALE_MAX, TITLE_SCALE_MIN } from './defaults.js';
import type {
  BroadcastGraphicsCommand,
  BroadcastGraphicsDocument,
  BroadcastSceneReference,
  SceneTitleBinding,
} from './types.js';

function cleanScene(scene: BroadcastSceneReference): BroadcastSceneReference | null {
  const id = scene.id.trim();
  const title = scene.title.trim();
  return id && title ? { id, title } : null;
}

function titleBindingForNewScene(sceneId: string): SceneTitleBinding {
  return { sceneId, mode: 'scene', blankText: '' };
}

function updateBinding(
  document: BroadcastGraphicsDocument,
  sceneId: string,
  update: (binding: SceneTitleBinding) => SceneTitleBinding,
): BroadcastGraphicsDocument {
  if (!document.scenes.some((scene) => scene.id === sceneId)) return document;
  const current = document.titleBindings.find((binding) => binding.sceneId === sceneId)
    ?? titleBindingForNewScene(sceneId);
  return {
    ...document,
    titleBindings: [
      ...document.titleBindings.filter((binding) => binding.sceneId !== sceneId),
      update(current),
    ],
  };
}

export function applyBroadcastGraphicsCommand(
  document: BroadcastGraphicsDocument,
  command: BroadcastGraphicsCommand,
): BroadcastGraphicsDocument {
  switch (command.type) {
    case 'register-scene': {
      const scene = cleanScene(command.scene);
      if (!scene) return document;
      const exists = document.scenes.some((candidate) => candidate.id === scene.id);
      const scenes = exists
        ? document.scenes.map((candidate) => candidate.id === scene.id ? scene : candidate)
        : [...document.scenes, scene];
      const hasBinding = document.titleBindings.some((binding) => binding.sceneId === scene.id);
      return {
        ...document,
        scenes,
        titleBindings: hasBinding
          ? document.titleBindings
          : [...document.titleBindings, titleBindingForNewScene(scene.id)],
      };
    }
    case 'remove-scene': {
      if (!document.scenes.some((scene) => scene.id === command.sceneId)) return document;
      const scenes = document.scenes.filter((scene) => scene.id !== command.sceneId);
      return {
        ...document,
        scenes,
        titleBindings: document.titleBindings.filter((binding) => binding.sceneId !== command.sceneId),
        activeSceneId: document.activeSceneId === command.sceneId
          ? scenes[0]?.id ?? null
          : document.activeSceneId,
      };
    }
    case 'set-active-scene':
      if (command.sceneId === null) return { ...document, activeSceneId: null };
      return document.scenes.some((scene) => scene.id === command.sceneId)
        ? { ...document, activeSceneId: command.sceneId }
        : document;
    case 'set-visible': {
      const key = command.graphic === 'title-bar'
        ? 'titleBar'
        : command.graphic === 'lower-third'
          ? 'lowerThird'
          : 'ticker';
      return { ...document, visibility: { ...document.visibility, [key]: command.visible } };
    }
    case 'set-title-mode':
      return updateBinding(document, command.sceneId, (binding) => ({ ...binding, mode: command.mode }));
    case 'set-blank-title-text':
      return updateBinding(document, command.sceneId, (binding) => ({ ...binding, blankText: command.text }));
    case 'set-fallback-blank-title-text':
      return { ...document, titleBar: { ...document.titleBar, fallbackBlankText: command.text } };
    case 'set-title-scale': {
      if (!Number.isFinite(command.scalePercent)) return document;
      const scalePercent = Math.round(Math.min(TITLE_SCALE_MAX, Math.max(TITLE_SCALE_MIN, command.scalePercent)));
      return { ...document, titleBar: { ...document.titleBar, scalePercent } };
    }
    case 'set-lower-third-text':
      return {
        ...document,
        lowerThird: {
          headline: command.headline ?? document.lowerThird.headline,
          subheadline: command.subheadline ?? document.lowerThird.subheadline,
        },
      };
    case 'set-ticker-text':
      return {
        ...document,
        ticker: {
          label: command.label ?? document.ticker.label,
          text: command.text ?? document.ticker.text,
        },
      };
  }
}

export function registerBroadcastScenes(
  document: BroadcastGraphicsDocument,
  scenes: readonly BroadcastSceneReference[],
): BroadcastGraphicsDocument {
  return scenes.reduce(
    (current, scene) => applyBroadcastGraphicsCommand(current, { type: 'register-scene', scene }),
    document,
  );
}
