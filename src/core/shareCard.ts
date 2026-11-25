import { nearestPointOnRect } from './zone';
import { BAD, BG, OK, SURFACE, SURFACE_2, TEXT, TEXT_MUTED, type TeamTheme } from './teams';
import { samplePath } from './pitchGen';
import type { Call, Pitch, ZoneRect } from './types';

/**
 * 공유 카드 SVG 생성기 — 앱(react-native-svg SvgXml)과 서버/스크립트(Playwright·resvg)가 같은 문자열을 쓴다.
 * 포맷: story 1080×1920 (인스타 스토리/릴스 9:16) · square 1080×1080 (카카오톡 대화방 미리보기에서 잘림이 없는 1:1)
 */
export type CardFormat = 'story' | 'square';
export const CARD_SIZE: Record<CardFormat, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

export interface CardPitchDot {
  /** 해당 투구 타자 기준 존으로 정규화한 위치(0~1, 존 안쪽이면 0~1 범위) */
  u: number;
  v: number;
  correct: boolean;
}

export interface RoundCardModel {
  kind: 'round';
  nickname: string;
  theme: TeamTheme;
  accuracyPct: number;
  correct: number;
  total: number;
  score: number;
  streak: number;
  teamRank: number | null;
  contribution: number | null;
  weekLabel: string;
  dots: CardPitchDot[];
  inviteText: string;
  simulated: boolean;
}

export interface ControversyCardModel {
  kind: 'controversy';
  nickname: string;
  theme: TeamTheme;
  pitch: Pitch;
  zone: ZoneRect;
  absCall: Call;
  userCall: Call | null;
  strikeSharePct: number;
  marginText: string;
  situation: string;
  dayLabel: string;
  inviteText: string;
  simulated: boolean;
}

export type CardModel = RoundCardModel | ControversyCardModel;

export interface SvgOptions {
  /** 앱에서는 시스템 폰트(null), 서버에서는 'Noto Sans KR' 등 */
  fontFamily?: string | null;
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const callKo = (c: Call) => (c === 'strike' ? '스트라이크' : '볼');

export function toDot(p: Pitch, zone: ZoneRect, correct: boolean): CardPitchDot {
  return {
    u: (p.plateX - zone.left) / (zone.right - zone.left),
    v: (p.plateZ - zone.bottom) / (zone.top - zone.bottom),
    correct,
  };
}

function head(w: number, h: number, theme: TeamTheme, font: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${font}">` +
    `<defs><pattern id="led" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="1.6" fill="#FFFFFF" fill-opacity="0.055"/></pattern>` +
    `<linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.accent}" stop-opacity="0.22"/><stop offset="1" stop-color="${theme.accent}" stop-opacity="0"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="${BG}"/><rect width="${w}" height="${h}" fill="url(#led)"/>` +
    `<rect width="${w}" height="${Math.round(h * 0.34)}" fill="url(#glow)"/>` +
    `<rect width="${w}" height="16" fill="${theme.accent}"/>`
  );
}

const t = (
  x: number,
  y: number,
  size: number,
  fill: string,
  text: string,
  o: { w?: number; a?: 'start' | 'middle' | 'end'; ls?: number; op?: number } = {},
) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${o.w ?? 700}" fill="${fill}" text-anchor="${o.a ?? 'start'}"` +
  `${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.op != null ? ` fill-opacity="${o.op}"` : ''}>${esc(text)}</text>`;

function tile(x: number, y: number, w: number, h: number, label: string, value: string, accent: string): string {
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="${SURFACE}" stroke="${SURFACE_2}" stroke-width="3"/>` +
    t(x + w / 2, y + 56, 30, TEXT_MUTED, label, { a: 'middle', w: 600 }) +
    t(x + w / 2, y + h - 40, 74, accent, value, { a: 'middle', w: 900 })
  );
}

/** 존(정규화 0~1) + 투구 점 */
function dotsZone(x: number, y: number, w: number, h: number, dots: CardPitchDot[], theme: TeamTheme): string {
  const pad = 0.34; // 존 바깥 여백 비율
  const zx = x + w * (pad / (1 + 2 * pad));
  const zw = w / (1 + 2 * pad);
  const zy = y + h * (pad / (1 + 2 * pad));
  const zh = h / (1 + 2 * pad);
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="32" fill="${SURFACE}"/>`;
  s += `<rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" fill="none" stroke="${theme.accent}" stroke-width="6" rx="4"/>`;
  for (let i = 1; i <= 2; i++) {
    s += `<line x1="${zx + (zw * i) / 3}" y1="${zy}" x2="${zx + (zw * i) / 3}" y2="${zy + zh}" stroke="${theme.accent}" stroke-opacity="0.28" stroke-width="2"/>`;
    s += `<line x1="${zx}" y1="${zy + (zh * i) / 3}" x2="${zx + zw}" y2="${zy + (zh * i) / 3}" stroke="${theme.accent}" stroke-opacity="0.28" stroke-width="2"/>`;
  }
  const r = Math.max(14, w * 0.045);
  dots.forEach((d, i) => {
    const px = Math.min(x + w - r - 6, Math.max(x + r + 6, zx + d.u * zw));
    const py = Math.min(y + h - r - 6, Math.max(y + r + 6, zy + (1 - d.v) * zh));
    const col = d.correct ? OK : BAD;
    // 색 + 모양(채움/링)으로 정오답을 구분 → 색각 이상에서도 읽힘
    s += d.correct
      ? `<circle cx="${px}" cy="${py}" r="${r}" fill="${col}"/>`
      : `<circle cx="${px}" cy="${py}" r="${r}" fill="none" stroke="${col}" stroke-width="6"/>`;
    s += t(px, py + r * 0.36, r * 1.05, d.correct ? '#04140A' : col, String(i + 1), { a: 'middle', w: 900 });
  });
  return s;
}

export function buildRoundCardSvg(m: RoundCardModel, format: CardFormat, o: SvgOptions = {}): string {
  const { w, h } = CARD_SIZE[format];
  const font = o.fontFamily ?? 'system-ui, sans-serif';
  const T = m.theme;
  let s = head(w, h, T, font);
  const story = format === 'story';

  s += t(64, 112, 44, T.accent, 'STRZONE · 스트존', { w: 900, ls: 2 });
  s += t(w - 64, 112, 34, TEXT_MUTED, `주간 시즌 ${m.weekLabel}`, { a: 'end', w: 600 });
  s += t(64, story ? 210 : 188, 52, TEXT, `${m.nickname} · ${T.name}`, { w: 800 });

  if (story) {
    s += t(w / 2, 640, 520, TEXT, String(m.accuracyPct), { a: 'middle', w: 900 });
    s += t(w / 2 + 380, 640, 150, T.accent, '%', { a: 'middle', w: 900 });
    s += t(w / 2, 730, 54, TEXT_MUTED, `이번 판 정확도 · ${m.total}구 중 ${m.correct}구 적중`, { a: 'middle', w: 600 });
    s += dotsZone(w / 2 - 260, 800, 520, 520, m.dots, T);
    const tw = 300;
    const gap = 36;
    const x0 = (w - (tw * 3 + gap * 2)) / 2;
    s += tile(x0, 1380, tw, 200, '연속 기록', `${m.streak}일`, T.accent);
    s += tile(x0 + tw + gap, 1380, tw, 200, '구단 순위', m.teamRank ? `${m.teamRank}위` : '-', T.accent);
    s += tile(x0 + (tw + gap) * 2, 1380, tw, 200, '구단 기여도', m.contribution == null ? '-' : `${m.contribution >= 0 ? '+' : ''}${m.contribution.toFixed(1)}`, T.accent);
    s += `<rect x="64" y="1660" width="${w - 128}" height="130" rx="65" fill="${T.accent}"/>`;
    s += t(w / 2, 1744, 48, T.onAccent, m.inviteText, { a: 'middle', w: 900 });
    if (m.simulated) s += t(w / 2, 1860, 28, TEXT_MUTED, '시뮬레이션 투구 기반 · 실제 경기 영상/기록 아님', { a: 'middle', w: 500 });
  } else {
    s += t(64, 560, 340, TEXT, String(m.accuracyPct), { w: 900 });
    s += t(64 + (String(m.accuracyPct).length * 205), 560, 110, T.accent, '%', { w: 900 });
    s += t(64, 630, 40, TEXT_MUTED, `${m.total}구 중 ${m.correct}구 적중`, { w: 600 });
    s += dotsZone(w - 64 - 420, 250, 420, 420, m.dots, T);
    const gap = 36;
    const tw = (w - 128 - gap * 2) / 3;
    s += tile(64, 720, tw, 170, '연속', `${m.streak}일`, T.accent);
    s += tile(64 + tw + gap, 720, tw, 170, '구단 순위', m.teamRank ? `${m.teamRank}위` : '-', T.accent);
    s += tile(64 + (tw + gap) * 2, 720, tw, 170, '기여도', m.contribution == null ? '-' : `${m.contribution >= 0 ? '+' : ''}${m.contribution.toFixed(1)}`, T.accent);
    s += `<rect x="64" y="940" width="${w - 128}" height="96" rx="48" fill="${T.accent}"/>`;
    s += t(w / 2, 1004, 40, T.onAccent, m.inviteText, { a: 'middle', w: 900 });
    if (m.simulated) s += t(w / 2, 1066, 24, TEXT_MUTED, '시뮬레이션 투구 기반', { a: 'middle', w: 500 });
  }
  return s + '</svg>';
}

/** 존 + 공 일러스트(논란 카드/클립 공용). 반환: svg 조각, 좌표 매퍼 */
export function zoneStage(
  box: { x: number; y: number; w: number; h: number },
  pitch: Pitch,
  zone: ZoneRect,
  theme: TeamTheme,
  prog: { zone: number; margin: number; ball: number },
  verdictColor: string,
) {
  const spanX = 52;
  const s = box.w / spanX;
  const zLo = zone.bottom - 13;
  const zHi = zone.top + 13;
  const sh = (zHi - zLo) * s;
  const by = box.y + (box.h - sh) / 2;
  const mx = (x: number) => box.x + box.w / 2 + x * s;
  const mz = (z: number) => by + (zHi - z) * s;
  let out = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="36" fill="${SURFACE}"/>`;
  // 홈플레이트(오각형)
  const py = mz(zLo + 3);
  const pw = 8.5 * s;
  out += `<path d="M ${mx(-8.5)} ${py - 14} L ${mx(8.5)} ${py - 14} L ${mx(8.5)} ${py} L ${mx(0)} ${py + 20} L ${mx(-8.5)} ${py} Z" fill="#fff" fill-opacity="0.16"/>`;
  void pw;
  const zx = mx(zone.left);
  const zy = mz(zone.top);
  const zw = (zone.right - zone.left) * s;
  const zh = (zone.top - zone.bottom) * s;
  if (prog.zone > 0) {
    out += `<g opacity="${prog.zone}"><rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" fill="${theme.accent}" fill-opacity="0.08" stroke="${theme.accent}" stroke-width="7"/>`;
    for (let i = 1; i <= 2; i++) {
      out += `<line x1="${zx + (zw * i) / 3}" y1="${zy}" x2="${zx + (zw * i) / 3}" y2="${zy + zh}" stroke="${theme.accent}" stroke-opacity="0.3" stroke-width="2"/>`;
      out += `<line x1="${zx}" y1="${zy + (zh * i) / 3}" x2="${zx + zw}" y2="${zy + (zh * i) / 3}" stroke="${theme.accent}" stroke-opacity="0.3" stroke-width="2"/>`;
    }
    out += '</g>';
  }
  const bx = mx(pitch.plateX);
  const bz = mz(pitch.plateZ);
  const br = 1.45 * s;
  if (prog.margin > 0) {
    const np = nearestPointOnRect(pitch.plateX, pitch.plateZ, zone);
    const ex = bx + (mx(np.x) - bx) * prog.margin;
    const ez = bz + (mz(np.z) - bz) * prog.margin;
    out += `<line x1="${bx}" y1="${bz}" x2="${ex}" y2="${ez}" stroke="${verdictColor}" stroke-width="5" stroke-dasharray="12 10"/>`;
  }
  if (prog.ball > 0) {
    out += `<circle cx="${bx}" cy="${bz}" r="${br * prog.ball}" fill="#F4F6F8"/><circle cx="${bx}" cy="${bz}" r="${br * prog.ball}" fill="none" stroke="${verdictColor}" stroke-width="6"/>`;
  }
  return { svg: out, mx, mz, s };
}

export function buildControversyCardSvg(m: ControversyCardModel, format: CardFormat, o: SvgOptions = {}): string {
  const { w, h } = CARD_SIZE[format];
  const font = o.fontFamily ?? 'system-ui, sans-serif';
  const T = m.theme;
  const story = format === 'story';
  let s = head(w, h, T, font);
  const verdictColor = m.absCall === 'strike' ? OK : BAD;

  s += t(64, 112, 44, T.accent, 'STRZONE · 오늘의 논란 판정', { w: 900, ls: 1 });
  s += t(w - 64, 112, 34, TEXT_MUTED, m.dayLabel, { a: 'end', w: 600 });
  s += t(64, story ? 200 : 180, 44, TEXT_MUTED, m.situation, { w: 600 });

  const box = story ? { x: 64, y: 250, w: w - 128, h: 800 } : { x: 64, y: 220, w: 480, h: 560 };
  s += zoneStage(box, m.pitch, m.zone, T, { zone: 1, margin: 1, ball: 1 }, verdictColor).svg;

  const vx = story ? w / 2 : 800;
  const vy = story ? 1120 : 330;
  s += t(vx, vy - (story ? 0 : 40), story ? 40 : 34, TEXT_MUTED, 'ABS 판정', { a: 'middle', w: 600 });
  s += t(vx, vy + (story ? 230 : 90), story ? 190 : 110, verdictColor, callKo(m.absCall), { a: 'middle', w: 900 });
  s += t(vx, vy + (story ? 300 : 150), story ? 42 : 30, TEXT_MUTED, m.marginText, { a: 'middle', w: 600 });

  const by = story ? 1530 : 840;
  const bw = story ? w - 128 : w - 128;
  const sp = Math.round(m.strikeSharePct);
  s += voteBar(64, by, bw, story ? 70 : 56, sp, story ? 40 : 30);
  if (m.userCall) {
    const ok = m.userCall === m.absCall;
    s += t(w / 2, by + (story ? 150 : 130), story ? 52 : 38, ok ? OK : BAD, `나는 ${callKo(m.userCall)} · ${ok ? 'ABS와 일치' : 'ABS와 달랐어요'}`, { a: 'middle', w: 800 });
  }
  const fy = story ? 1730 : 960;
  s += `<rect x="64" y="${fy}" width="${w - 128}" height="${story ? 110 : 90}" rx="${story ? 55 : 45}" fill="${T.accent}"/>`;
  s += t(w / 2, fy + (story ? 70 : 58), story ? 46 : 36, T.onAccent, m.inviteText, { a: 'middle', w: 900 });
  if (m.simulated) s += t(w / 2, story ? 1886 : 1060, 26, TEXT_MUTED, '시뮬레이션 투구·투표 기반 · 실제 경기 영상/기록 아님', { a: 'middle', w: 500 });
  return s + '</svg>';
}

export function voteBar(x: number, y: number, w: number, h: number, strikePct: number, fs: number, grow = 1): string {
  const sw = Math.max(0, Math.min(1, (strikePct / 100) * grow)) * w;
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${SURFACE_2}"/>` +
    `<rect x="${x}" y="${y}" width="${sw}" height="${h}" rx="${h / 2}" fill="${OK}"/>` +
    t(x + 28, y + h / 2 + fs * 0.36, fs, '#04140A', `스트라이크 ${Math.round(strikePct)}%`, { w: 900 }) +
    t(x + w - 28, y + h / 2 + fs * 0.36, fs, TEXT, `볼 ${100 - Math.round(strikePct)}%`, { a: 'end', w: 800 }) +
    t(x + w / 2, y - 18, fs * 0.8, TEXT_MUTED, '팬 투표', { a: 'middle', w: 600 })
  );
}

/** 클립 프레임: p ∈ [0,1]. 0~.35 비행, ~.5 정지, ~.62 존 공개, ~.74 판정 도장, 이후 투표 막대 성장. 항상 9:16. */
export function buildControversyClipFrame(m: ControversyCardModel, p: number, o: SvgOptions = {}): string {
  const { w, h } = CARD_SIZE.story;
  const font = o.fontFamily ?? 'system-ui, sans-serif';
  const T = m.theme;
  const verdictColor = m.absCall === 'strike' ? OK : BAD;
  const cl = (a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
  const ease = (x: number) => 1 - Math.pow(1 - x, 3);

  const flight = ease(cl(0, 0.35));
  const zoneIn = ease(cl(0.5, 0.58));
  const marginIn = ease(cl(0.58, 0.66));
  const stamp = cl(0.68, 0.76);
  const bars = ease(cl(0.78, 0.96));

  let s = head(w, h, T, font);
  s += t(64, 112, 44, T.accent, 'STRZONE · 오늘의 논란 판정', { w: 900, ls: 1 });
  s += t(w - 64, 112, 34, TEXT_MUTED, m.dayLabel, { a: 'end', w: 600 });
  s += t(64, 200, 44, TEXT_MUTED, m.situation, { w: 600 });

  const box = { x: 64, y: 250, w: w - 128, h: 800 };
  const stage = zoneStage(box, m.pitch, m.zone, T, { zone: zoneIn, margin: marginIn, ball: 0 }, verdictColor);
  s += stage.svg;

  // 공: 비행(원근 축소→확대) 후 고정
  const path = samplePath(m.pitch, 24);
  const idx = Math.min(path.length - 1, Math.floor(flight * (path.length - 1)));
  const cur = path[idx];
  const bxEnd = stage.mx(m.pitch.plateX);
  const bzEnd = stage.mz(m.pitch.plateZ);
  const sx = box.x + box.w / 2 + m.pitch.releaseX * stage.s * 0.35;
  const sy = box.y + 70;
  const bx = flight >= 1 ? bxEnd : sx + (bxEnd - sx) * cur.t + (m.pitch.bowX * stage.s * Math.sin(Math.PI * cur.t)) * 0.6;
  const bz = flight >= 1 ? bzEnd : sy + (bzEnd - sy) * cur.t - (m.pitch.bowZ * stage.s * Math.sin(Math.PI * cur.t)) * 0.6;
  const r = 1.45 * stage.s * (flight >= 1 ? 1 : cur.scale);
  const ringCol = marginIn > 0 ? verdictColor : '#F4F6F8';
  s += `<circle cx="${bx}" cy="${bz}" r="${r}" fill="#F4F6F8" stroke="${ringCol}" stroke-width="6"/>`;

  if (p < 0.5) {
    const pulse = 0.65 + 0.35 * Math.abs(Math.sin(p * 18));
    s += t(w / 2, 1190, 120, TEXT, '스트라이크? 볼?', { a: 'middle', w: 900, op: pulse });
    s += t(w / 2, 1280, 44, TEXT_MUTED, '지금 판정해보세요', { a: 'middle', w: 600 });
  }
  if (stamp > 0) {
    const sc = 1.5 - 0.5 * ease(stamp);
    s += `<g transform="translate(${w / 2} 1300) scale(${sc}) translate(${-w / 2} -1300)" opacity="${ease(stamp)}">` +
      t(w / 2, 1120, 40, TEXT_MUTED, 'ABS 판정', { a: 'middle', w: 600 }) +
      t(w / 2, 1350, 190, verdictColor, callKo(m.absCall), { a: 'middle', w: 900 }) +
      t(w / 2, 1420, 42, TEXT_MUTED, m.marginText, { a: 'middle', w: 600 }) + '</g>';
  }
  if (bars > 0) s += voteBar(64, 1530, w - 128, 70, m.strikeSharePct, 40, bars);
  s += `<rect x="64" y="1730" width="${w - 128}" height="110" rx="55" fill="${T.accent}"/>`;
  s += t(w / 2, 1800, 46, T.onAccent, m.inviteText, { a: 'middle', w: 900 });
  if (m.simulated) s += t(w / 2, 1886, 26, TEXT_MUTED, '시뮬레이션 투구·투표 기반 · 실제 경기 영상/기록 아님', { a: 'middle', w: 500 });
  return s + '</svg>';
}

export function buildCardSvg(m: CardModel, format: CardFormat, o: SvgOptions = {}): string {
  return m.kind === 'round' ? buildRoundCardSvg(m, format, o) : buildControversyCardSvg(m, format, o);
}
