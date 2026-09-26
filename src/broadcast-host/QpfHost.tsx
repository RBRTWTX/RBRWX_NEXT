import type { ReactNode } from 'react';
import { useBroadcast } from '../broadcast';
import { QpfProvider, QpfMapConnection, QpfControls, QpfStatus, useQpf } from '../qpf/Qpf';
export type { QpfSnapshot } from '../qpf/model';
export { qpfProductForContent, isQpfContent } from '../qpf/model';

export function QpfHost({ children }: { children: ReactNode }) {
  const { programScene, state } = useBroadcast();
  return <QpfProvider sceneId={state.programItemId ?? programScene?.id ?? 'startup'} contentKey={programScene?.contentKey}>{children}</QpfProvider>;
}

export { QpfMapConnection, QpfControls, QpfStatus, useQpf };
