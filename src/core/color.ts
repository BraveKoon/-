/** WCAG 2.x 대비 계산 + 구단 컬러를 다크 배경에서 AA(4.5:1)로 자동 보정. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** fg를 흰색 쪽으로 섞어 bg 대비 min 이상이 될 때까지 밝힌다. */
export function ensureContrastOnDark(fg: string, bg: string, min = 4.5): string {
  if (contrast(fg, bg) >= min) return fg;
  for (let t = 0.04; t <= 1.0001; t += 0.02) {
    const c = mix(fg, '#ffffff', t);
    if (contrast(c, bg) >= min) return c;
  }
  return '#ffffff';
}

/** accent 위에 올릴 글자색: 흑/백 중 대비가 큰 쪽 (항상 4.5 이상 보장). */
export function onColor(bg: string): string {
  return contrast('#000000', bg) >= contrast('#ffffff', bg) ? '#000000' : '#ffffff';
}
