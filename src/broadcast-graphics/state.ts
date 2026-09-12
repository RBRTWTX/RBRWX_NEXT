export type Kind = 'title' | 'lower' | 'ticker';
export interface Scene { id: string; title: string; weatherKeyId?: string }
export interface Layout { x: number; y: number; scale: number }
export interface Copy { keySelection?: string; manual: boolean; title: string; lower: string; ticker: string }
export const sizes = { title: [1872, 108], lower: [1766, 120], ticker: [1766, 56] } as const;
export function freshCopy(): Copy { return { manual: false, title: '', lower: '', ticker: '' }; }
export function freshLayouts(): Record<Kind, Layout> {
  return { title: { x: 24, y: 27, scale: 1 }, lower: { x: 77, y: 842, scale: 1 }, ticker: { x: 77, y: 974, scale: 1 } };
}
export function constrain(kind: Kind, input: Layout): Layout {
  const [w, h] = sizes[kind];
  const scale = Math.max(.25, Math.min(1920 / w, 1080 / h, Number.isFinite(input.scale) ? input.scale : 1));
  return { scale, x: Math.max(0, Math.min(1920 - w * scale, Number.isFinite(input.x) ? input.x : 0)), y: Math.max(0, Math.min(1080 - h * scale, Number.isFinite(input.y) ? input.y : 0)) };
}
export function titleText(scene: Scene | null, copy: Copy): string { return copy.manual ? copy.title : scene?.title ?? ''; }
export function changeLayout(kind: Kind, start: Layout, dx: number, dy: number, resize: boolean): Layout {
  return constrain(kind, resize ? { ...start, scale: start.scale + dx / sizes[kind][0] } : { ...start, x: start.x + dx, y: start.y + dy });
}
