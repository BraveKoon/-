import { addDays, kstWeekKey } from '../core/dates';
import { buildDailyControversies } from '../core/pitchGen';
import { hash01, createRng } from '../core/prng';
import { computeTeamRanking, type RankingResult, type UserWeekRow } from '../core/ranking';
import { TEAMS } from '../core/teams';
import { simulateFanVotes, type TeamVotes } from '../core/fanVotes';
import type { Pitch } from '../core/types';

/**
 * 서버 경계. 앱 화면은 이 인터페이스만 본다.
 *  - MockApi (기본): 서버 없이 동작하는 시뮬레이션. 화면에 항상 '시뮬레이션' 배지 표기.
 *  - SupabaseApi (알파 이후): supabase/schema.sql의 RPC를 호출. 구현 시 같은 시그니처를 맞추면 화면 수정 없음.
 *  투구 데이터 출처 교체(simulated → licensed)도 이 경계 뒤에서 일어난다.
 */
export interface ControversyItem {
  pitch: Pitch;
  votes: TeamVotes;
}
export interface LeagueView {
  code: string;
  name: string;
  kind: 'friends' | 'team';
  members: { name: string; accuracy: number; attempts: number; demo: boolean }[];
}
export interface Api {
  readonly simulated: boolean;
  getTeamRanking(weekKey: string, me: UserWeekRow | null): Promise<RankingResult>;
  getControversies(dayKey: string): Promise<ControversyItem[]>;
  getLeague(code: string): Promise<LeagueView | null>;
}

const TEAM_IDS = TEAMS.map((t) => t.id);

/** 구단별 가상 유저 풀: 같은 주/구단이면 같은 값, 30초 버킷마다 약간 증가 → '실시간' 느낌의 결정적 시뮬레이션 */
function simulatedUsers(weekKey: string, now: number): UserWeekRow[] {
  const bucket = Math.floor(now / 30000);
  const weekProgress = Math.min(1, Math.max(0.05, (now - Date.parse(weekKey + 'T00:00:00+09:00')) / (7 * 86400000)));
  const rows: UserWeekRow[] = [];
  for (const id of TEAM_IDS) {
    const rng = createRng(`team:${weekKey}:${id}`);
    const players = Math.round(rng.range(40, 260) * (0.4 + weekProgress));
    const skill = rng.normal(0.6, 0.035);
    for (let i = 0; i < players; i++) {
      const att = Math.round(rng.range(8, 70) * (0.6 + weekProgress * 0.4));
      const jitter = (hash01(`j:${id}:${i}:${bucket}`) - 0.5) * 0.01;
      const acc = Math.min(0.95, Math.max(0.3, skill + rng.normal(0, 0.08) + jitter));
      rows.push({ userId: `sim-${id}-${i}`, teamId: id, attempts: att, correct: Math.round(att * acc) });
    }
  }
  return rows;
}

export const mockApi: Api = {
  simulated: true,
  async getTeamRanking(weekKey, me) {
    const rows = simulatedUsers(weekKey, Date.now());
    if (me && me.attempts > 0) rows.push(me);
    return computeTeamRanking(rows, { allTeamIds: TEAM_IDS });
  },
  async getControversies(dayKey) {
    return buildDailyControversies(dayKey).map((pitch) => ({ pitch, votes: simulateFanVotes(pitch, TEAM_IDS) }));
  },
  async getLeague(code) {
    const rng = createRng(`league:${code}`);
    const names = ['동네야구왕', '직관러', '심판킬러', '불펜포수', '내야안타'];
    return {
      code,
      name: rng.pick(['우리 동기 리그', '직관 메이트', '가족 리그', '회사 야구부']),
      kind: 'friends',
      members: names.slice(0, rng.int(2, 5)).map((n) => ({
        name: n,
        accuracy: rng.range(0.5, 0.78),
        attempts: rng.int(10, 80),
        demo: true,
      })),
    };
  },
};

export const api: Api = mockApi;
export const currentWeekKey = () => kstWeekKey(Date.now());
export const prevWeekKey = () => addDays(currentWeekKey(), -7);

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 0/O, 1/I/L 제외
export function newLeagueCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
}
export const inviteUrl = (code: string) => `https://strzone.app/l/${code}`;
export const appInviteUrl = (anonId: string) => `https://strzone.app/?ref=${encodeURIComponent(anonId)}`;
