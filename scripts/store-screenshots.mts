/**
 * App Store 스크린샷 생성 (iPhone 6.9" = 1320×2868, 알파 없음)
 *   NODE_PATH=$(npm root -g) npx tsx scripts/store-screenshots.mts [웹빌드 폴더]
 * 1) 웹 빌드(없으면 expo export로 생성)를 로컬 서버로 띄우고  2) 헤드리스 Chromium(소프트웨어 WebGL)으로 실제 앱을 조작해
 * 440×956@3x 화면을 찍은 뒤  3) 상단 문구를 얹어 store/screenshots/ko/iphone-6.9/ 에 저장한다.
 * 결과를 재현할 수 있게 퀴즈는 seed로 고정하고, 정답은 core 로직으로 계산한다(5구 중 4구 정답 연출).
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { buildDailyControversies, buildQuickRound } from '../src/core/pitchGen';
import { judge } from '../src/core/zone';
import { kstDayKey } from '../src/core/dates';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = resolve('store/screenshots/ko/iphone-6.9');
const W = 1320, H = 2868;
const SEED = 'store-1';
mkdirSync(OUT, { recursive: true });

let dist = process.argv[2];
const tmp = mkdtempSync(join(tmpdir(), 'shots-'));
if (!dist) {
  dist = join(tmp, 'web');
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', dist], { stdio: 'inherit', env: { ...process.env, EXPO_OFFLINE: '1', CI: '1' } });
}

const types: Record<string, string> = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf' };
const server = createServer((req, res) => {
  let p = join(dist!, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(dist!, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const base = `http://localhost:${port}`;

const fontCss = [400, 700, 900].flatMap((w) => ['korean', 'latin'].map((sub) => {
  const b64 = readFileSync(`node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-${sub}-${w}-normal.woff2`).toString('base64');
  return `@font-face{font-family:'Noto Sans KR';font-weight:${w};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
})).join('');

const shots: { name: string; title: string; accent: string; sub: string; raw: string }[] = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(e.message));
  const snap = async (name: string) => { const p = join(tmp, `${name}.png`); await page.screenshot({ path: p }); return p; };
  const press = (label: string) => page.getByRole('button', { name: label, exact: true }).click({ timeout: 8000 });

  // ── 퀴즈: seed 고정, 4번째 투구만 오답 ──
  const pitches = buildQuickRound(SEED);
  const calls = pitches.map((p, i) => { const t = judge(p).call; return i === 3 ? (t === 'strike' ? 'ball' : 'strike') : t; });
  await page.goto(`${base}/play?first=1&seed=${SEED}`);
  await page.waitForTimeout(1600);
  shots.push({ name: '01-judge', title: '주심의 눈으로', accent: '판정하세요', sub: '공이 멈춘 순간, 스트라이크? 볼?', raw: await snap('01') });
  for (let i = 0; i < 5; i++) {
    if (i > 0) await page.waitForTimeout(1900);
    await press(calls[i] === 'strike' ? '스트라이크' : '볼');
    if (i === 4) { await page.waitForTimeout(800); shots.push({ name: '02-reveal', title: 'ABS 정답을', accent: '3D로 바로 확인', sub: '존 박스와 궤적이 리플레이로 공개돼요', raw: await snap('02') }); }
  }
  await page.waitForURL(/result/, { timeout: 10000 });
  await page.waitForTimeout(1800);
  shots.push({ name: '03-result', title: '한 판 30초,', accent: '공유는 한 번에', sub: '정확도 · 연속 기록 · 구단 기여도를 카드 한 장으로', raw: await snap('03') });

  // ── 구단 선택 → 랭킹 ──
  await page.goto(`${base}/team`); await page.waitForTimeout(900);
  await page.getByRole('button', { name: /KIA 타이거즈/ }).click(); await page.waitForTimeout(700);
  await page.goto(`${base}/ranking`); await page.waitForTimeout(2200);
  shots.push({ name: '04-ranking', title: '우리 구단이', accent: '더 정확하다', sub: '매주 월요일 리셋되는 구단 대항전', raw: await snap('04') });

  // ── 오늘의 논란 판정 ──
  const day = kstDayKey(Date.now());
  const c0 = buildDailyControversies(day)[0];
  await page.goto(`${base}/controversy/0?day=${day}`); await page.waitForTimeout(2200);
  await press(judge(c0).call === 'strike' ? '스트라이크' : '볼');
  await page.waitForTimeout(1400);
  shots.push({ name: '05-controversy', title: '오늘의', accent: '논란 판정', sub: '팬 투표 vs ABS, 누가 맞았을까', raw: await snap('05') });
  if (errors.length) throw new Error('앱 오류: ' + errors.join(' | '));

  // ── 합성: 상단 문구 + 둥근 화면 ──
  const comp = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const s of shots) {
    const img = readFileSync(s.raw).toString('base64');
    await comp.setContent(`<!doctype html><meta charset="utf-8"><style>${fontCss}
      html,body{margin:0;width:${W}px;height:${H}px;background:#0B0F14;font-family:'Noto Sans KR';overflow:hidden}
      body{background-image:radial-gradient(rgba(255,255,255,.06) 3px,transparent 3px);background-size:44px 44px}
      .glow{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(242,183,5,.22),transparent 60%)}
      .cap{position:absolute;top:150px;left:0;right:0;text-align:center;color:#F4F6F8}
      h1{margin:0;font-size:112px;font-weight:900;line-height:1.18;letter-spacing:-2px}
      h1 b{color:#F2B705;font-weight:900}
      p{margin:36px 0 0;font-size:50px;font-weight:700;color:#A9B4C0}
      .phone{position:absolute;left:50%;top:700px;width:1056px;height:2294px;transform:translateX(-50%);border-radius:86px;overflow:hidden;
        box-shadow:0 0 0 14px #1C2530,0 40px 120px rgba(0,0,0,.6)}
      .phone img{width:100%;height:100%;display:block}
    </style><div class="glow"></div><div class="cap"><h1>${s.title}<br><b>${s.accent}</b></h1><p>${s.sub}</p></div>
    <div class="phone"><img src="data:image/png;base64,${img}"></div>`);
    await comp.evaluate(() => document.fonts.ready);
    const raw = join(tmp, `${s.name}-comp.png`);
    await comp.screenshot({ path: raw });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-pix_fmt', 'rgb24', join(OUT, `${s.name}.png`)]);
    console.log('screenshot', s.name, `${W}x${H}`);
  }
} finally {
  await browser.close();
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
