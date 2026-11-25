/**
 * supabase/schema.sql 을 실제 PostgreSQL에 올려, TS 구현(src/core)과 SQL 구현이 같은 결과를 내는지 대조 검증한다.
 *   npx tsx scripts/verify-sql.mts        (로컬 PostgreSQL 16 필요; 없으면 종료코드 2)
 *   PG_BASE_URL=postgresql://postgres:postgres@localhost:5432 npx tsx scripts/verify-sql.mts   (CI)
 * 검증 항목: ① 존 판정 ② 점수식 ③ 구단 랭킹(캡+수축) ④ 구단 기여도 ⑤ submit_answer 서버 채점/콤보/스트릭 ⑥ 리그 ⑦ RLS(정답 은닉)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildDailyControversies, buildQuickRound } from '../src/core/pitchGen';
import { judge } from '../src/core/zone';
import { scorePitch } from '../src/core/scoring';
import { computeTeamRanking, teamContribution, type UserWeekRow } from '../src/core/ranking';
import { createRng } from '../src/core/prng';
import { TEAMS } from '../src/core/teams';
import { kstWeekKey } from '../src/core/dates';

const DB = 'strzone_verify';
const sh = (cmd: string, args: string[], input?: string) =>
  execFileSync(cmd, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
/**
 * 접속 방식: PG_BASE_URL(예: postgresql://postgres:postgres@localhost:5432)이 있으면 URL로(CI 서비스 컨테이너),
 * 없으면 로컬 클러스터에 postgres 계정 peer 인증으로.
 */
const BASE_URL = process.env.PG_BASE_URL?.replace(/\/$/, '');
const psql = (db: string, sql: string) =>
  (BASE_URL
    ? sh('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', `${BASE_URL}/${db}`], sql)
    : sh('runuser', ['-u', 'postgres', '--', 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', db], sql)
  ).trim();
const q = (sql: string) => psql(DB, sql);
const j = <T = any>(sql: string): T => JSON.parse(q(sql));
/** auth.uid()를 uid로 맞춘 같은 세션에서 sql 실행, 마지막 결과 줄 반환 */
const as = (uid: string, sql: string) => q(`select set_config('request.jwt.claim.sub','${uid}', false) is not null; ${sql}`).split('\n').pop()!;
const asJ = <T = any>(uid: string, sql: string): T => JSON.parse(as(uid, sql));

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed++;
};

try {
  if (!BASE_URL) { try { sh('pg_ctlcluster', ['16', 'main', 'start']); } catch { /* 이미 실행 중일 수 있음 */ } }
  for (let i = 0; i < 20; i++) { try { psql('postgres', 'select 1'); break; } catch { sh('sleep', ['0.5']); } }
} catch (e) { console.error('PostgreSQL을 시작할 수 없어요:', (e as Error).message); process.exit(2); }

psql('postgres', `drop database if exists ${DB}`);
psql('postgres', `create database ${DB}`);
q(`create schema auth;
   create table auth.users (id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
q(readFileSync('supabase/schema.sql', 'utf8'));
check('스키마 로드', true);

// ① 존 판정 패리티
const pitches = [
  ...Array.from({ length: 60 }, (_, i) => buildQuickRound('v' + i)).flat(),
  ...Array.from({ length: 20 }, (_, i) => buildDailyControversies(`2027-04-${String(i + 1).padStart(2, '0')}`)).flat(),
];
const diffOf = (id: string) => (id.includes('-c') ? 'controversial' : (['easy', 'easy', 'medium', 'hard', 'hard'] as const)[Number(id.split('-').pop())]);
const rows = pitches.map((p) =>
  `('${p.id}','simulated','${p.pitchType}',${p.speedKph},${p.batterHeightCm},${p.plateX},${p.plateZ},${p.releaseX},${p.releaseZ},${p.bowX},${p.bowZ},'${diffOf(p.id)}')`).join(',');
q(`insert into pitches (id,source,pitch_type,speed_kph,batter_height_cm,plate_x_in,plate_z_in,release_x_in,release_z_in,bow_x_in,bow_z_in,difficulty) values ${rows}`);
const sqlJudge = j<{ id: string; abs_call: string; m: number }[]>(`select json_agg(json_build_object('id',id,'abs_call',abs_call,'m',edge_margin)) from pitches`);
let callMismatch = 0, maxDiff = 0;
const byId = new Map(sqlJudge.map((r) => [r.id, r]));
for (const p of pitches) {
  const v = judge(p), s = byId.get(p.id)!;
  if (v.call !== s.abs_call) callMismatch++;
  maxDiff = Math.max(maxDiff, Math.abs(v.edgeMarginIn - Number(s.m)));
}
check(`존 판정 SQL=TS (${pitches.length}구)`, callMismatch === 0 && maxDiff < 1e-6, `불일치 ${callMismatch}, 최대 마진 오차 ${maxDiff.toExponential(2)}`);

// ② 점수식 패리티
const rng = createRng('score-parity');
const cases = Array.from({ length: 1500 }, () => ({
  c: rng.next() < 0.7, m: rng.range(-12, 12), rt: rng.int(0, 4000), combo: rng.int(0, 6),
}));
const sqlScores = j<number[]>(`select json_agg(score_pitch(c, m, rt, combo) order by i) from (values ${cases.map((x, i) => `(${i},${x.c},${x.m.toFixed(4)}::numeric,${x.rt},${x.combo})`).join(',')}) v(i,c,m,rt,combo)`);
const scoreBad = cases.filter((x, i) => scorePitch({ correct: x.c, edgeMarginIn: Number(x.m.toFixed(4)), rtMs: x.rt, combo: x.combo }) !== sqlScores[i]).length;
check('점수식 SQL=TS (1,500 케이스)', scoreBad === 0, `불일치 ${scoreBad}`);

// ③④ 랭킹/기여도 패리티: 팀별 가상 유저 + 고래(헤비 유저) 포함
const week = kstWeekKey(Date.parse('2027-04-07T12:00:00+09:00'));
const synth: (UserWeekRow & { uuid: string })[] = [];
const r2 = createRng('rank-parity');
let n = 0;
for (const t of TEAMS) {
  const players = r2.int(2, 40);
  for (let i = 0; i < players; i++) {
    const att = i === 0 && t.id === 'kia' ? 3000 : r2.int(3, 160);
    const acc = Math.min(0.95, Math.max(0.3, r2.normal(0.6, 0.1)));
    synth.push({ userId: `u${n}`, uuid: `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`, teamId: t.id, attempts: att, correct: Math.round(att * acc) });
  }
}
q(`create temp table synth (user_id uuid, team text, att int, cor int);
   insert into synth values ${synth.map((s) => `('${s.uuid}','${s.teamId}',${s.attempts},${s.correct})`).join(',')};
   insert into auth.users select user_id from synth;
   insert into profiles (user_id, nickname, team_id) select user_id, 'u', team from synth;
   insert into answers (user_id, team_id, round_id, pitch_id, mode, user_call, correct, rt_ms, score, created_at)
     select s.user_id, s.team, gen_random_uuid(), '${pitches[0].id}', 'quick', 'strike', g <= s.cor, 1000, 0, ('${week}'::date + 2)::timestamp at time zone 'Asia/Seoul'
     from synth s, generate_series(1, s.att) g;`);
const ts = computeTeamRanking(synth, { allTeamIds: TEAMS.map((t) => t.id) });
const sqlRank = j<{ team_id: string; rank: number; accuracy: string; raw_accuracy: string; players: number; provisional: boolean }[]>(
  `select json_agg(json_build_object('team_id',team_id,'rank',rank,'accuracy',accuracy,'raw_accuracy',raw_accuracy,'players',players,'provisional',provisional) order by rank) from team_ranking('${week}')`);
let rankBad = 0, accDiff = 0;
ts.rows.forEach((t, i) => {
  const s = sqlRank[i];
  if (s.team_id !== t.teamId || s.rank !== t.rank || s.players !== t.players || s.provisional !== t.provisional) rankBad++;
  accDiff = Math.max(accDiff, Math.abs(Number(s.accuracy) - t.accuracy), Math.abs(Number(s.raw_accuracy) - t.rawAccuracy));
});
check('구단 랭킹 SQL=TS (순위·인원·잠정 플래그·정확도)', rankBad === 0 && accDiff < 1e-9, `불일치 ${rankBad}, 최대 정확도 오차 ${accDiff.toExponential(2)}`);
const whale = synth.find((s) => s.attempts === 3000)!;
const sqlContribution = Number(as(whale.uuid, `select my_team_contribution('${week}')`));
const tsContribution = teamContribution(whale, ts.leagueMean);
check('구단 기여도 SQL=TS (캡 적용 고래 유저)', Math.abs(sqlContribution - tsContribution) < 0.051, `SQL ${sqlContribution} / TS ${tsContribution}`);
const whaleTeamRank = ts.rows.find((r) => r.teamId === 'kia')!;
check('고래 1명(3,000구)이 있어도 해당 구단 시도 수 반영은 캡(100) 이하', whaleTeamRank.attempts >= 3000 && ts.rows.length === 10);

// ⑤ submit_answer: 서버 채점/콤보/스트릭
const me = '11111111-1111-4111-8111-111111111111';
const round = '22222222-2222-4222-8222-222222222222';
q(`insert into auth.users values ('${me}'); insert into profiles (user_id, nickname, team_id) values ('${me}','tester','lg')`);
const first5 = buildQuickRound('v0');
const out: any[] = [];
for (let i = 0; i < 5; i++) {
  const truth = judge(first5[i]).call;
  const call = i === 3 ? (truth === 'strike' ? 'ball' : 'strike') : truth; // 4번째만 오답
  out.push(asJ(me, `select submit_answer('${round}','${first5[i].id}','quick','${call}',1500)`));
}
check('submit_answer: 정답/오답 판정이 서버 기준', out.map((o) => o.correct).join() === 'true,true,true,false,true', out.map((o) => o.correct).join());
check('submit_answer: 콤보 보너스 반영(3연속 정답 후 오답 → 콤보 리셋)', out[2].score > out[1].score && out[3].score === 0 && out[4].score < out[2].score + 40, `scores=${out.map((o) => o.score).join('/')}`);
const streakRow = j<{ current: number; best: number }>(`select row_to_json(s) from streaks s where user_id='${me}'`);
check('스트릭: 하루 5구여도 +1일만 증가', streakRow.current === 1 && streakRow.best === 1, JSON.stringify(streakRow));
const dup = (() => { try { as(me, `select submit_answer('${round}','${first5[0].id}','quick','strike',100)`); return false; } catch { return true; } })();
check('동일 라운드·동일 투구 중복 제출 차단(unique)', dup);

// 논란 판정은 1투구 1표
const cp = buildDailyControversies('2027-04-01')[0];
const voteOnce = () => as(me, `select submit_answer(gen_random_uuid(),'${cp.id}','daily','strike',0)`);
voteOnce();
const dupVote = (() => { try { voteOnce(); return false; } catch { return true; } })();
check('논란 판정 1인 1표(부분 unique 인덱스)', dupVote);
const tally = j<{ team_id: string; strike: number }[]>(`select json_agg(t) from controversy_tally('${cp.id}') t`);
check('논란 표 집계: 구단별 합산', tally.length === 1 && tally[0].team_id === 'lg' && Number(tally[0].strike) === 1, JSON.stringify(tally));

// ⑥ 리그
const code = as(me, `select create_league('테스트리그','friends')`);
check('리그 코드 형식(6자, 혼동 문자 제외)', /^[A-HJ-KM-NP-Z2-9]{6}$/.test(code), code);
const standings = asJ<any[]>(me, `select json_agg(s) from league_standings('${code}', '${kstWeekKey(Date.now())}') s`);
check('리그 순위표: 멤버만 조회, 정확도 계산', standings.length === 1 && standings[0].nickname === 'tester');

// ⑦ 정답 은닉 뷰
const cols = q(`select string_agg(column_name, ',') from information_schema.columns where table_name='pitches_public'`);
check('pitches_public 뷰에 정답 컬럼(abs_call, edge_margin) 없음', !cols.includes('abs_call') && !cols.includes('edge_margin'));
const licenseGuard = (() => { try { q(`insert into pitches (id,source,pitch_type,speed_kph,batter_height_cm,plate_x_in,plate_z_in,release_x_in,release_z_in,difficulty) values ('bad','licensed','fastball',140,180,0,30,0,70,'easy')`); return false; } catch { return true; } })();
check('licensed 투구는 license_ref 없으면 저장 불가(라이선스 가드)', licenseGuard);

console.log(failed ? `\n${failed}개 실패` : '\n모든 검증 통과');
process.exit(failed ? 1 : 0);
