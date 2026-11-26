/**
 * 앱 아이콘·스플래시·파비콘 생성기 (단일 SVG 소스 → PNG)
 *   NODE_PATH=$(npm root -g) npx tsx scripts/render-brand.mts
 * 컨셉: "경계선에 걸친 공" — 전광판 배경 위 스트라이크 존 모서리에 공이 걸친 순간.
 * iOS 아이콘은 App Store 규정상 알파 채널이 없어야 하므로 ffmpeg로 rgb24 변환한다.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BG = '#0B0F14';
const AMBER = '#F2B705';
const OUT = resolve('assets/images');

/** 1024 캔버스 기준 심볼(존 + 공). mono=true면 흰색 단일 색(안드로이드 단색 아이콘) */
function symbol(mono = false): string {
  const zone = mono ? '#FFFFFF' : AMBER;
  const ball = mono ? '#FFFFFF' : 'url(#ballShade)';
  const seam = mono ? BG : '#D7263D';
  const zx = 262, zy = 262, zw = 440, zh = 530;
  let s = '';
  // 잔상(공이 날아온 경로): 작고 옅은 공 두 개
  if (!mono) {
    s += `<circle cx="868" cy="112" r="62" fill="#FFFFFF" fill-opacity="0.07"/>`;
    s += `<circle cx="800" cy="178" r="96" fill="#FFFFFF" fill-opacity="0.13"/>`;
  }
  s += `<rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" rx="26" fill="${zone}" fill-opacity="${mono ? 0 : 0.1}" stroke="${zone}" stroke-width="34"/>`;
  for (let i = 1; i <= 2; i++) {
    s += `<line x1="${zx + (zw * i) / 3}" y1="${zy}" x2="${zx + (zw * i) / 3}" y2="${zy + zh}" stroke="${zone}" stroke-opacity="${mono ? 1 : 0.45}" stroke-width="10"/>`;
    s += `<line x1="${zx}" y1="${zy + (zh * i) / 3}" x2="${zx + zw}" y2="${zy + (zh * i) / 3}" stroke="${zone}" stroke-opacity="${mono ? 1 : 0.45}" stroke-width="10"/>`;
  }
  // 공: 존 오른쪽 위 모서리에 걸침
  const cx = 712, cy = 262, r = 132;
  if (!mono) s += `<circle cx="${cx + 10}" cy="${cy + 16}" r="${r}" fill="#000" fill-opacity="0.45" filter="url(#blur)"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ball}"/>`;
  s += `<g clip-path="url(#ballClip)" fill="none" stroke="${seam}" stroke-linecap="round">`;
  for (const p of [`M ${cx - 70} ${cy - 112} C ${cx - 18} ${cy - 50} ${cx - 18} ${cy + 50} ${cx - 70} ${cy + 112}`, `M ${cx + 70} ${cy - 112} C ${cx + 18} ${cy - 50} ${cx + 18} ${cy + 50} ${cx + 70} ${cy + 112}`]) {
    s += `<path d="${p}" stroke-width="12"/>`;
    if (!mono) s += `<path d="${p}" stroke-width="30" stroke-dasharray="5 17" stroke-opacity="0.9"/>`;
  }
  s += '</g>';
  return s;
}

function svg(opts: { size: number; bg: boolean; scale: number; mono?: boolean }): string {
  const { size, bg, scale, mono } = opts;
  const t = (1024 - 1024 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <pattern id="led" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="2.2" fill="#FFFFFF" fill-opacity="0.07"/></pattern>
    <radialGradient id="glow" cx="0.48" cy="0.52" r="0.6"><stop offset="0" stop-color="${AMBER}" stop-opacity="0.22"/><stop offset="1" stop-color="${AMBER}" stop-opacity="0"/></radialGradient>
    <radialGradient id="ballShade" cx="0.38" cy="0.34" r="0.75"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.7" stop-color="#E9ECEF"/><stop offset="1" stop-color="#B8C0C8"/></radialGradient>
    <clipPath id="ballClip"><circle cx="712" cy="262" r="132"/></clipPath>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  ${bg ? `<rect width="1024" height="1024" fill="${BG}"/><rect width="1024" height="1024" fill="url(#led)"/><rect width="1024" height="1024" fill="url(#glow)"/>` : ''}
  <g transform="translate(${t} ${t}) scale(${scale})">${symbol(mono)}</g>
</svg>`;
}

const jobs: { file: string; size: number; bg: boolean; scale: number; mono?: boolean; opaque?: boolean }[] = [
  { file: 'icon.png', size: 1024, bg: true, scale: 0.86, opaque: true }, // iOS/App Store: 알파 없음
  { file: 'android-icon-foreground.png', size: 512, bg: false, scale: 0.62 }, // 적응형 아이콘 안전 영역(66%) 안
  { file: 'android-icon-background.png', size: 512, bg: true, scale: 0, opaque: true },
  { file: 'android-icon-monochrome.png', size: 432, bg: false, scale: 0.62, mono: true },
  { file: 'splash-icon.png', size: 512, bg: false, scale: 0.9 },
  { file: 'favicon.png', size: 48, bg: true, scale: 0.9, opaque: true },
];

const tmp = mkdtempSync(join(tmpdir(), 'brand-'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const j of jobs) {
    const s = j.scale === 0 ? svg({ ...j, scale: 0.0001 }).replace(/<g transform[\s\S]*?<\/g>\n<\/svg>$/, '</svg>') : svg(j);
    await page.setViewportSize({ width: j.size, height: j.size });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${s}`);
    const raw = join(tmp, j.file);
    await page.screenshot({ path: raw, omitBackground: !j.opaque });
    const pix = j.opaque ? 'rgb24' : 'rgba';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-pix_fmt', pix, join(OUT, j.file)]);
    console.log(j.file, `${j.size}x${j.size}`, pix);
  }
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
