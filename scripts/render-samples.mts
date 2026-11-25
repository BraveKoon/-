/**
 * 공유 카드(이미지)와 '오늘의 논란 판정' 클립(mp4)을 서버 없이 로컬에서 렌더하는 레퍼런스 워커.
 * 앱이 쓰는 SVG 빌더(src/core/shareCard.ts)를 그대로 사용 → 앱 미리보기 = 서버 생성물.
 *
 *   NODE_PATH=$(npm root -g) npx tsx scripts/render-samples.mts [--clip]
 *
 * 프로덕션에서는 같은 로직을 Edge Function/Cloud Run 워커로 옮겨 일일 논란 판정 클립을 매일 04:00 KST에 사전 생성한다.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDailyControversies, buildQuickRound } from '../src/core/pitchGen';
import { judge, formatMargin, zoneFor } from '../src/core/zone';
import { teamTheme } from '../src/core/teams';
import { simulateFanVotes, strikeShare, totalVotes } from '../src/core/fanVotes';
import { TEAMS } from '../src/core/teams';
import {
  buildCardSvg, buildControversyClipFrame, toDot, CARD_SIZE,
  type ControversyCardModel, type RoundCardModel, type CardFormat,
} from '../src/core/shareCard';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = resolve('docs/samples');
const FONT = 'Noto Sans KR';
mkdirSync(OUT, { recursive: true });

const fontCss = [400, 700, 900]
  .flatMap((w) =>
    ['korean', 'latin'].map((sub) => {
      const b64 = readFileSync(`node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-${sub}-${w}-normal.woff2`).toString('base64');
      return `@font-face{font-family:'${FONT}';font-weight:${w};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
    }),
  )
  .join('\n');

const theme = teamTheme('kia');

// ── 샘플 데이터 ──
const round = buildQuickRound('demo');
const wrongAt = 3;
const roundModel: RoundCardModel = {
  kind: 'round', nickname: '민수', theme, accuracyPct: 80, correct: 4, total: 5, score: 872, streak: 7,
  teamRank: 3, contribution: 4.2, weekLabel: '3.22 ~ 3.28', inviteText: '나도 판정해보기 · strzone.app',
  simulated: true,
  dots: round.map((p, i) => toDot(p, zoneFor(p.batterHeightCm), i !== wrongAt)),
};
const [pitch] = buildDailyControversies('2027-03-27');
const verdict = judge(pitch);
const votes = simulateFanVotes(pitch, TEAMS.map((t) => t.id));
const ctrModel: ControversyCardModel = {
  kind: 'controversy', nickname: '민수', theme, pitch, zone: verdict.zone, absCall: verdict.call,
  userCall: verdict.call === 'strike' ? 'ball' : 'strike',
  strikeSharePct: Math.round(strikeShare(totalVotes(votes)) * 100),
  marginText: formatMargin(verdict.edgeMarginIn), situation: `${pitch.label ?? ''} · 시뮬레이션`,
  dayLabel: '3월 27일', inviteText: '나도 판정해보기 · strzone.app', simulated: true,
};

const html = (svg: string) =>
  `<!doctype html><meta charset="utf-8"><style>${fontCss}html,body{margin:0;background:#000}svg{display:block}</style>${svg}`;

const flag = process.argv.includes('--clip');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const jobs: [string, ControversyCardModel | RoundCardModel, CardFormat][] = [
    ['round-story', roundModel, 'story'], ['round-square', roundModel, 'square'],
    ['controversy-story', ctrModel, 'story'], ['controversy-square', ctrModel, 'square'],
  ];
  for (const [name, model, fmt] of jobs) {
    const svg = buildCardSvg(model, fmt, { fontFamily: FONT });
    writeFileSync(join(OUT, `${name}.svg`), svg);
    const { w, h } = CARD_SIZE[fmt];
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html(svg));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log('card', name, `${w}x${h}`);
  }

  if (flag) {
    const FPS = 30;
    const SECONDS = 5;
    const frames = FPS * SECONDS;
    const dir = join(OUT, '_frames');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.setContent(html(buildControversyClipFrame(ctrModel, 0, { fontFamily: FONT })));
    await page.evaluate(() => document.fonts.ready);
    for (let i = 0; i < frames; i++) {
      const svg = buildControversyClipFrame(ctrModel, i / (frames - 1), { fontFamily: FONT });
      await page.evaluate((s: string) => { document.querySelector('svg')!.outerHTML = s; }, svg);
      await page.screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`) });
    }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', join(OUT, 'controversy-clip.mp4')]);
    // 포스터(결과 프레임)도 같이 저장
    execFileSync('cp', [join(dir, `f${String(frames - 1).padStart(4, '0')}.png`), join(OUT, 'controversy-clip-last.png')]);
    execFileSync('cp', [join(dir, `f${String(Math.floor(frames * 0.2)).padStart(4, '0')}.png`), join(OUT, 'controversy-clip-flight.png')]);
    rmSync(dir, { recursive: true, force: true });
    console.log('clip', frames, 'frames ->', join(OUT, 'controversy-clip.mp4'));
  }
} finally {
  await browser.close();
}
