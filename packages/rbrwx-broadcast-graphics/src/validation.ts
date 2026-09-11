import { BROADCAST_DESIGN_SIZE, TITLE_SCALE_MAX, TITLE_SCALE_MIN } from './defaults.js';
import {
  BROADCAST_GRAPHICS_SCHEMA_VERSION,
  type BroadcastGraphicsDocument,
} from './types.js';

function fail(message: string): never {
  throw new Error(`Broadcast Graphics document: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, label: string, allowBlank = false): string {
  if (typeof value !== 'string' || (!allowBlank && !value.trim())) fail(`${label} must be a string${allowBlank ? '' : ' with content'}.`);
  return value;
}

export function assertBroadcastGraphicsDocument(
  value: unknown,
): asserts value is BroadcastGraphicsDocument {
  if (!isRecord(value)) fail('root must be an object.');
  const document = value as unknown as BroadcastGraphicsDocument;
  if (document.schemaVersion !== BROADCAST_GRAPHICS_SCHEMA_VERSION) fail(`schemaVersion must be ${BROADCAST_GRAPHICS_SCHEMA_VERSION}.`);
  if (document.design?.width !== BROADCAST_DESIGN_SIZE.width || document.design?.height !== BROADCAST_DESIGN_SIZE.height) {
    fail('design must be exactly 1920×1080.');
  }
  if (document.activeSceneId !== null && typeof document.activeSceneId !== 'string') fail('activeSceneId must be a string or null.');
  if (!Array.isArray(document.scenes) || !Array.isArray(document.titleBindings)) fail('scenes and titleBindings must be arrays.');

  const sceneIds = new Set<string>();
  for (const scene of document.scenes) {
    requireString(scene?.id, 'scene.id');
    requireString(scene?.title, `scene ${scene?.id ?? ''}.title`);
    if (sceneIds.has(scene.id)) fail(`scene id is duplicated: ${scene.id}.`);
    sceneIds.add(scene.id);
  }
  if (document.activeSceneId !== null && !sceneIds.has(document.activeSceneId)) fail('activeSceneId must reference a registered scene.');

  const bindingIds = new Set<string>();
  for (const binding of document.titleBindings) {
    requireString(binding?.sceneId, 'titleBinding.sceneId');
    if (!sceneIds.has(binding.sceneId)) fail(`title binding references an unknown scene: ${binding.sceneId}.`);
    if (binding.mode !== 'scene' && binding.mode !== 'blank') fail(`title binding ${binding.sceneId} has an invalid mode.`);
    requireString(binding.blankText, `title binding ${binding.sceneId}.blankText`, true);
    if (bindingIds.has(binding.sceneId)) fail(`title binding is duplicated: ${binding.sceneId}.`);
    bindingIds.add(binding.sceneId);
  }
  for (const sceneId of sceneIds) {
    if (!bindingIds.has(sceneId)) fail(`scene is missing its automatic title binding: ${sceneId}.`);
  }

  if (!isRecord(document.visibility)) fail('visibility must be an object.');
  for (const key of ['titleBar', 'lowerThird', 'ticker'] as const) {
    if (typeof document.visibility[key] !== 'boolean') fail(`visibility.${key} must be boolean.`);
  }
  if (!isRecord(document.titleBar)) fail('titleBar must be an object.');
  if (!Number.isSafeInteger(document.titleBar.scalePercent)
    || document.titleBar.scalePercent < TITLE_SCALE_MIN
    || document.titleBar.scalePercent > TITLE_SCALE_MAX) {
    fail(`titleBar.scalePercent must be a whole number from ${TITLE_SCALE_MIN} through ${TITLE_SCALE_MAX}.`);
  }
  requireString(document.titleBar.fallbackBlankText, 'titleBar.fallbackBlankText', true);
  if (!isRecord(document.lowerThird)) fail('lowerThird must be an object.');
  requireString(document.lowerThird.headline, 'lowerThird.headline', true);
  requireString(document.lowerThird.subheadline, 'lowerThird.subheadline', true);
  if (!isRecord(document.ticker)) fail('ticker must be an object.');
  requireString(document.ticker.label, 'ticker.label', true);
  requireString(document.ticker.text, 'ticker.text', true);
}

export function parseBroadcastGraphicsDocument(json: string): BroadcastGraphicsDocument {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    fail(`invalid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
  assertBroadcastGraphicsDocument(value);
  return value;
}
