import type { CSSProperties } from 'react';

export type BarTarget = 'title' | 'lower' | 'ticker' | 'status';
export type BarDesign = 'current' | 'cp3a' | 'studio' | 'classic';
export interface BarAppearance {
  design: BarDesign;
  top?: string;
  bottom?: string;
  accent?: string;
  text?: string;
  font?: string;
  weight?: string;
}
export type BarStyles = Partial<Record<BarTarget, BarAppearance>>;
export const BAR_DESIGNS = [
  { id: 'current', name: 'Current · Steel', description: 'Clean steel title with a narrow metallic edge.', top: '#60758d', bottom: '#0a1931', accent: '#8b9eb6', text: '#ffffff' },
  { id: 'cp3a', name: 'CP3A Original', description: 'Original candidate gloss, navy body and silver rails.', top: '#60758d', bottom: '#0a1931', accent: '#adbdce', text: '#ffffff' },
  { id: 'studio', name: 'Studio Edge', description: 'Graphite face, bold color edge and inset rule.', top: '#303c4b', bottom: '#131d2a', accent: '#35b5ee', text: '#ffffff' },
  { id: 'classic', name: 'RBRTW Classic', description: 'Original rounded workstation bar with a color ribbon.', top: '#132230', bottom: '#07111a', accent: '#cb1678', text: '#f5f8fb' },
] as const;
export const BAR_FONTS = [
  { id: 'arial', name: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { id: 'narrow', name: 'Arial Narrow', css: '"Arial Narrow", Arial, sans-serif' },
  { id: 'segoe', name: 'Segoe UI', css: '"Segoe UI", Arial, sans-serif' },
  { id: 'verdana', name: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { id: 'impact', name: 'Impact', css: 'Impact, "Arial Narrow", sans-serif' },
] as const;

export function resolveBarAppearance(value?: Partial<BarAppearance>) {
  const preset = BAR_DESIGNS.find(item => item.id === value?.design) ?? BAR_DESIGNS[0];
  const color = (key: 'top' | 'bottom' | 'accent' | 'text') => /^#[a-f0-9]{6}$/i.test(value?.[key] ?? '') ? value![key]! : preset[key];
  return {
    design: preset.id, top: color('top'), bottom: color('bottom'), accent: color('accent'), text: color('text'),
    font: BAR_FONTS.find(font => font.id === value?.font)?.id ?? 'arial',
    weight: ['400', '600', '700', '900'].includes(value?.weight ?? '') ? value!.weight! : '900',
  };
}

// Undefined keeps the existing renderer's appearance exactly as it was before this feature.
export function barPresentation(value?: BarAppearance): { design?: string; style?: CSSProperties } {
  if (!value) return {};
  const resolved = resolveBarAppearance(value);
  return { design: resolved.design, style: {
    '--bar-top': resolved.top, '--bar-bottom': resolved.bottom,
    '--bar-accent': resolved.accent, '--bar-text': resolved.text,
    '--bar-font': BAR_FONTS.find(font => font.id === resolved.font)!.css,
    '--bar-weight': resolved.weight,
    '--bar-mid-top': resolved.top === '#60758d' && resolved.bottom === '#0a1931' ? '#273f60' : 'color-mix(in srgb,var(--bar-top),var(--bar-bottom) 60%)',
    '--bar-mid-bottom': resolved.top === '#60758d' && resolved.bottom === '#0a1931' ? '#112b50' : 'color-mix(in srgb,var(--bar-top),var(--bar-bottom) 80%)',
  } as CSSProperties };
}
export function barAttributes(value?: BarAppearance) {
  const { design, style } = barPresentation(value);
  return { 'data-bar-design': design, style };
}
