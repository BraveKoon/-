#!/usr/bin/env node
/**
 * 릴리즈 도우미 (의존성 없음)
 *   node scripts/release.mjs bump 0.2.0     package.json·app.json 버전 변경 + CHANGELOG [Unreleased] → [0.2.0] - 날짜(KST)
 *   node scripts/release.mjs check 0.2.0    버전 3곳(package.json, app.json, CHANGELOG)이 일치하는지 확인 (릴리즈 워크플로)
 *   node scripts/release.mjs notes 0.2.0    CHANGELOG에서 해당 버전 섹션만 출력 (GitHub Release 본문)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [cmd, ver] = process.argv.slice(2);
if (!cmd || !/^\d+\.\d+\.\d+$/.test(ver ?? '')) {
  console.error('사용법: node scripts/release.mjs <bump|check|notes> X.Y.Z');
  process.exit(2);
}
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
const changelog = () => readFileSync('CHANGELOG.md', 'utf8');
const esc = (s) => s.replace(/\./g, '\\.');

function section(v) {
  const m = changelog().match(new RegExp(`^## \\[${esc(v)}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : null;
}

if (cmd === 'bump') {
  const pkg = readJson('package.json');
  pkg.version = ver;
  writeJson('package.json', pkg);
  const app = readJson('app.json');
  app.expo.version = ver;
  writeJson('app.json', app);
  const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const cl = changelog();
  if (!/^## \[Unreleased\]/m.test(cl)) throw new Error('CHANGELOG에 ## [Unreleased] 섹션이 없어요');
  if (new RegExp(`^## \\[${esc(ver)}\\]`, 'm').test(cl)) throw new Error(`CHANGELOG에 이미 ${ver}가 있어요`);
  writeFileSync('CHANGELOG.md', cl.replace(/^## \[Unreleased\]\n/m, `## [Unreleased]\n\n## [${ver}] - ${kst}\n`));
  console.log(`bumped to ${ver}`);
} else if (cmd === 'check') {
  const problems = [];
  if (readJson('package.json').version !== ver) problems.push(`package.json version ≠ ${ver}`);
  if (readJson('app.json').expo.version !== ver) problems.push(`app.json expo.version ≠ ${ver}`);
  const body = section(ver);
  if (!body) problems.push(`CHANGELOG에 [${ver}] 섹션이 없거나 비어 있음`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`ok ${ver}`);
} else if (cmd === 'notes') {
  const body = section(ver);
  if (!body) {
    console.error(`CHANGELOG에 [${ver}] 섹션이 없어요`);
    process.exit(1);
  }
  process.stdout.write(body + '\n');
} else {
  console.error(`알 수 없는 명령: ${cmd}`);
  process.exit(2);
}
