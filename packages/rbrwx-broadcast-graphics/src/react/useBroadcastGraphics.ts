import { useReducer } from 'react';
import { createBroadcastGraphicsDocument } from '../defaults.js';
import { applyBroadcastGraphicsCommand } from '../state.js';
import type { BroadcastGraphicsDocument } from '../types.js';

export function useBroadcastGraphics(initialDocument?: BroadcastGraphicsDocument) {
  return useReducer(
    applyBroadcastGraphicsCommand,
    initialDocument ?? createBroadcastGraphicsDocument(),
  );
}
