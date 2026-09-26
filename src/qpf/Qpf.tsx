import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { QpfController } from './controller';
import { QPF_DEFAULT_OPACITY, QPF_PRODUCTS, initialQpfSnapshot, qpfProductForContent, type QpfProduct, type QpfSnapshot } from './model';
import './qpf.css';

interface QpfRuntime {
  active: boolean;
  product: QpfProduct | null;
  title: string;
  snapshot: QpfSnapshot;
  opacity: number;
  editOpacity: (value: number) => void;
  controller: QpfController;
}

const Context = createContext<QpfRuntime | null>(null);

export function useQpf(): QpfRuntime {
  const value = useContext(Context);
  if (!value) throw new Error('QPF provider missing');
  return value;
}

export function QpfProvider({ sceneId, contentKey, children }: { sceneId: string; contentKey?: string; children: ReactNode }) {
  const product = qpfProductForContent(contentKey);
  const [snapshot, setSnapshot] = useState<QpfSnapshot>(initialQpfSnapshot);
  const [settings, setSettings] = useState<Record<string, number>>({});
  const controller = useMemo(() => new QpfController(setSnapshot), []);
  const opacity = settings[sceneId] ?? QPF_DEFAULT_OPACITY;

  useLayoutEffect(() => controller.select(product, opacity), [controller, product, opacity]);
  useEffect(() => () => controller.destroy(), [controller]);

  const title = product ? QPF_PRODUCTS[product].title : 'QPF';
  return <Context.Provider value={{
    active: product !== null,
    product,
    title,
    snapshot,
    opacity,
    editOpacity: value => setSettings(old => ({ ...old, [sceneId]: Math.max(0, Math.min(1, value)) })),
    controller,
  }}>{children}</Context.Provider>;
}

export function QpfMapConnection({ children }: { children: (connect: (map: MapLibreMap) => () => void) => ReactNode }) {
  const { controller } = useQpf();
  return children(map => controller.connect(map, 'rbrwx-county-boundary'));
}

export function QpfControls() {
  const { active, opacity, editOpacity, controller } = useQpf();
  if (!active) return null;
  return <section className="qpf-controls" aria-label="WPC quantitative precipitation forecast controls">
    <div className="panel-heading"><span>WPC QPF</span><small>forecast precipitation</small></div>
    <label>QPF opacity<input aria-label="QPF layer opacity" type="range" min="0" max="100" value={Math.round(opacity * 100)} onChange={event => editOpacity(Number(event.target.value) / 100)} /></label>
    <button type="button" onClick={() => void controller.refresh()}>Refresh QPF</button>
  </section>;
}

export function QpfStatus() {
  const { active, snapshot } = useQpf();
  return active ? <div className="qpf-status" role="status">{snapshot.message}</div> : null;
}
