import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { changeLayout, constrain, freshCopy, freshLayouts, sizes, titleText, type Copy, type Kind, type Layout, type Scene } from './state';
import './graphics.css';
interface Model {
  scene: Scene | null; copy: Copy; edit: (patch: Partial<Copy>) => void;
  visible: Record<Kind, boolean>; toggle: (kind: Kind) => void;
  layouts: Record<Kind, Layout>; position: (kind: Kind, layout: Layout) => void;
}
const Context = createContext<Model | null>(null);
function useGraphics() { const value = useContext(Context); if (!value) throw new Error('Graphics provider missing'); return value; }
export function GraphicsProvider({ scene, children }: { scene: Scene | null; children: ReactNode }) {
  const [copies, setCopies] = useState<Record<string, Copy>>({});
  const [visible, setVisible] = useState({ title: false, lower: false, ticker: false });
  const [layouts, setLayouts] = useState(freshLayouts);
  const id = scene?.id ?? 'startup';
  const copy = copies[id] ?? freshCopy();
  return <Context.Provider value={{ scene, copy, visible, layouts,
    edit: patch => setCopies(old => ({ ...old, [id]: { ...(old[id] ?? freshCopy()), ...patch } })),
    toggle: kind => setVisible(old => ({ ...old, [kind]: !old[kind] })),
    position: (kind, layout) => setLayouts(old => ({ ...old, [kind]: constrain(kind, layout) })),
  }}>{children}</Context.Provider>;
}
function Text({ value, commit, scrolling = false }: { value: string; commit: (text: string) => void; scrolling?: boolean }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cancel = useRef(false);
  useEffect(() => { if (editing && ref.current) { ref.current.textContent = value; ref.current.focus(); } }, [editing]);
  return <div ref={ref} className="wxg-text" contentEditable={editing} suppressContentEditableWarning spellCheck={false}
    onDoubleClick={event => { event.stopPropagation(); cancel.current = false; setEditing(true); }}
    onPointerDown={event => { if (editing) event.stopPropagation(); }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { cancel.current = true; event.currentTarget.textContent = value; event.currentTarget.blur(); } else if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
    onBlur={event => { if (!cancel.current) commit(event.currentTarget.textContent ?? ''); setEditing(false); }}
    onPaste={event => { event.preventDefault(); const text = event.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' '); const selection = window.getSelection(); if (selection?.rangeCount) { const range = selection.getRangeAt(0); range.deleteContents(); const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); } }}
  >{editing ? undefined : scrolling ? <span className="wxg-crawl">{value}</span> : value}</div>;
}
function Bar({ kind, viewScale }: { kind: Kind; viewScale: number }) {
  const { scene, copy, edit, layouts, position } = useGraphics();
  const layout = layouts[kind];
  const gesture = useRef<{ x: number; y: number; start: Layout; resize: boolean; id: number } | null>(null);
  const [width, height] = sizes[kind];
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).isContentEditable) return;
    const box = event.currentTarget.getBoundingClientRect();
    gesture.current = { x: event.clientX, y: event.clientY, start: { ...layout }, resize: box.right - event.clientX < 14 && box.bottom - event.clientY < 14, id: event.pointerId };
    event.stopPropagation(); (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }
  return <div className={`wxg-bar wxg-${kind}`} data-graphic={kind} style={{ left: layout.x, top: layout.y, width, height, transform: `scale(${layout.scale})` }}
    onPointerDown={down}
    onPointerMove={event => { const g = gesture.current; if (!g || g.id !== event.pointerId) return; event.stopPropagation(); position(kind, changeLayout(kind, g.start, (event.clientX - g.x) / viewScale, (event.clientY - g.y) / viewScale, g.resize)); }}
    onPointerUp={event => { gesture.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { gesture.current = null; }} onLostPointerCapture={() => { gesture.current = null; }}>
    <Text scrolling={kind === 'ticker'} key={`${scene?.id ?? 'startup'}:${kind}`} value={kind === 'title' ? titleText(scene, copy) : copy[kind]}
      commit={text => edit(kind === 'title' ? { manual: true, title: text } : { [kind]: text })} />
  </div>;
}
export function GraphicsOverlay() {
  const { visible, scene } = useGraphics();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1920, h: 1080 });
  useEffect(() => { const node = ref.current; if (!node) return; const update = () => setSize({ w: node.clientWidth, h: node.clientHeight }); update(); const observer = new ResizeObserver(update); observer.observe(node); return () => observer.disconnect(); }, []);
  const scale = Math.max(.001, Math.min(size.w / 1920, size.h / 1080));
  return <div className="wxg-overlay" ref={ref} data-title-visible={visible.title}>
    <div className="wxg-design" style={{ left: (size.w - 1920 * scale) / 2, top: (size.h - 1080 * scale) / 2, transform: `scale(${scale})` }}>
      {(['title', 'lower', 'ticker'] as Kind[]).filter(kind => visible[kind]).map(kind => <Bar key={`${scene?.id}:${kind}`} kind={kind} viewScale={scale} />)}
    </div>
  </div>;
}
export function GraphicsControls() {
  const { scene, copy, edit, visible, toggle, layouts, position } = useGraphics();
  return <section className="wxg-menu" aria-label="Graphics">
    <div className="panel-heading">GRAPHICS</div>
    {(['title', 'lower', 'ticker'] as Kind[]).map(kind => <label key={kind} className="wxg-toggle"><span>{kind === 'title' ? 'Title bar' : kind === 'lower' ? 'Lower third' : 'Ticker'}</span><input type="checkbox" checked={visible[kind]} onChange={() => toggle(kind)} /></label>)}
    <label>Title text<select aria-label="Title text" value={copy.manual ? 'blank' : 'scene'} onChange={event => edit(event.target.value === 'blank' ? { manual: true, title: '' } : { manual: false })}><option value="scene">Match scene</option><option value="blank">Blank / add text</option></select></label>
    <label>Title<input value={titleText(scene, copy)} onChange={event => edit({ manual: true, title: event.target.value })} /></label>
    <label>Title bar size<input aria-label="Title bar size" type="range" min="25" max="100" value={Math.round(layouts.title.scale * 100)} onChange={event => position('title', { ...layouts.title, scale: Number(event.target.value) / 100 })} /></label>
    {visible.lower && <label>Lower third text<input value={copy.lower} onChange={event => edit({ lower: event.target.value })} /></label>}
    {visible.ticker && <label>Ticker text<input value={copy.ticker} onChange={event => edit({ ticker: event.target.value })} /></label>}
  </section>;
}
