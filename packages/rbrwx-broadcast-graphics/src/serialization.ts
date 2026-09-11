import type { BroadcastGraphicsDocument } from './types.js';
import { assertBroadcastGraphicsDocument, parseBroadcastGraphicsDocument } from './validation.js';

export function serializeBroadcastGraphicsDocument(document: BroadcastGraphicsDocument): string {
  assertBroadcastGraphicsDocument(document);
  return JSON.stringify(document, null, 2);
}

export { parseBroadcastGraphicsDocument };
