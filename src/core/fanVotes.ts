import { createRng, hash01 } from './prng';
import { judge } from './zone';
import type { Call, Pitch } from './types';

/**
 * '오늘의 논란 판정' 팬 투표 집계 모델.
 *  - 실서비스: controversy_votes 테이블을 구단별로 GROUP BY (supabase/schema.sql)
 *  - 알파/오프라인: 아래 시뮬레이션이 결정적으로(같은 투구 → 같은 결과) 가짜 표를 만든다.
 *    UI는 pitch.source === 'simulated'일 때 반드시 "시뮬레이션 투표" 배지를 붙인다.
 */
export interface VoteTally {
  strike: number;
  ball: number;
}
export type TeamVotes = Record<string, VoteTally>;

export function simulateFanVotes(pitch: Pitch, teamIds: string[]): TeamVotes {
  const m = judge(pitch).edgeMarginIn;
  // 경계선에 가까울수록 의견이 갈린다. m<0(스트라이크)이면 스트라이크 쪽으로 기운다.
  const lean = 0.5 + 0.34 * Math.tanh(-m / 1.1);
  const out: TeamVotes = {};
  for (const id of teamIds) {
    const rng = createRng(`votes:${pitch.id}:${id}`);
    const bias = (hash01(`bias:${pitch.id}:${id}`) - 0.5) * 0.16; // 구단별 성향(±8%p)
    const n = rng.int(180, 1400);
    const p = Math.min(0.97, Math.max(0.03, lean + bias));
    const strike = Math.round(n * p + rng.normal(0, 6));
    out[id] = { strike: Math.min(n, Math.max(0, strike)), ball: n - Math.min(n, Math.max(0, strike)) };
  }
  return out;
}

export function totalVotes(v: TeamVotes): VoteTally {
  return Object.values(v).reduce(
    (a, t) => ({ strike: a.strike + t.strike, ball: a.ball + t.ball }),
    { strike: 0, ball: 0 },
  );
}

export const strikeShare = (t: VoteTally): number => (t.strike + t.ball === 0 ? 0.5 : t.strike / (t.strike + t.ball));

export function majority(t: VoteTally): Call {
  return t.strike >= t.ball ? 'strike' : 'ball';
}
