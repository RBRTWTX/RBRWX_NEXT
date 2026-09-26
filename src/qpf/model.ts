export type QpfProduct = 'day1' | 'day2' | 'day3' | 'day7';

export interface QpfProductDefinition {
  id: QpfProduct;
  contentKey: string;
  layerId: number;
  title: string;
  period: string;
}

export const QPF_PRODUCTS: Record<QpfProduct, QpfProductDefinition> = {
  day1: { id: 'day1', contentKey: 'qpf.day1', layerId: 1, title: 'QPF Day 1', period: '24 HOURS · DAY 1' },
  day2: { id: 'day2', contentKey: 'qpf.day2', layerId: 2, title: 'QPF Day 2', period: '24 HOURS · DAY 2' },
  day3: { id: 'day3', contentKey: 'qpf.day3', layerId: 3, title: 'QPF Day 3', period: '24 HOURS · DAY 3' },
  day7: { id: 'day7', contentKey: 'qpf.day7', layerId: 11, title: 'QPF 7-Day Total', period: '168 HOURS · DAYS 1–7' },
};

export interface QpfSnapshot {
  active: boolean;
  product: QpfProduct | null;
  opacity: number;
  message: string;
  issueTime: string | null;
  startTime: string | null;
  endTime: string | null;
  validTime: string | null;
}

export const QPF_DEFAULT_OPACITY = 0.82;

export const initialQpfSnapshot: QpfSnapshot = {
  active: false,
  product: null,
  opacity: QPF_DEFAULT_OPACITY,
  message: 'QPF inactive',
  issueTime: null,
  startTime: null,
  endTime: null,
  validTime: null,
};

export function qpfProductForContent(contentKey: string | undefined): QpfProduct | null {
  if (!contentKey) return null;
  for (const definition of Object.values(QPF_PRODUCTS)) if (definition.contentKey === contentKey) return definition.id;
  return null;
}

export function isQpfContent(contentKey: string | undefined): boolean {
  return qpfProductForContent(contentKey) !== null;
}
