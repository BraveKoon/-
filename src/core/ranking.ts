/**
 * 구단 대항전 집계 (주간 시즌, 월 00:00 KST 리셋)
 *
 * 공정성 장치
 *  1) 개인 캡: 1인당 주간 반영 시도 수를 perUserCap(기본 100)으로 제한 → 헤비 유저 1명이 구단 순위를 좌우하지 못함.
 *     캡을 넘으면 정답 수도 비율로 축소(correctEff = correct · cap/attempts).
 *  2) 베이지안 수축: 표본이 적은 구단이 우연히 1위/꼴찌가 되는 것을 막기 위해, 리그 평균을 priorStrength개의
 *     '가상 시도'로 섞는다.   teamAcc = (Σ correctEff + m·μ) / (Σ attemptsEff + m)
 *  3) 응답 정확도만 사용 (속도/난이도 보너스가 포함된 점수는 순위에 쓰지 않는다 → 기기·반응속도 격차 배제).
 */
export interface UserWeekRow {
  userId: string;
  teamId: string;
  attempts: number;
  correct: number;
}

export interface RankingOptions {
  perUserCap: number;
  priorStrength: number;
  /** 이 인원 미만이면 provisional(잠정) 표시 */
  minPlayers: number;
  /** 순위표에 항상 노출할 구단 id 목록(참가자 0명도 표시) */
  allTeamIds?: string[];
}

export const DEFAULT_RANKING_OPTIONS: RankingOptions = { perUserCap: 100, priorStrength: 50, minPlayers: 5 };

export interface TeamRankRow {
  teamId: string;
  rank: number;
  /** 수축 적용 정확도 0..1 (순위 기준) */
  accuracy: number;
  rawAccuracy: number;
  players: number;
  attempts: number;
  provisional: boolean;
}

export interface RankingResult {
  rows: TeamRankRow[];
  leagueMean: number;
  options: RankingOptions;
}

export function effective(row: Pick<UserWeekRow, 'attempts' | 'correct'>, cap: number) {
  if (row.attempts <= cap) return { attempts: row.attempts, correct: row.correct };
  return { attempts: cap, correct: (row.correct * cap) / row.attempts };
}

export function computeTeamRanking(
  users: UserWeekRow[],
  opts: Partial<RankingOptions> = {},
): RankingResult {
  const o = { ...DEFAULT_RANKING_OPTIONS, ...opts };
  const agg = new Map<string, { att: number; cor: number; rawAtt: number; rawCor: number; players: number }>();
  for (const id of o.allTeamIds ?? []) agg.set(id, { att: 0, cor: 0, rawAtt: 0, rawCor: 0, players: 0 });

  let totAtt = 0;
  let totCor = 0;
  for (const u of users) {
    if (u.attempts <= 0) continue;
    const e = effective(u, o.perUserCap);
    const a = agg.get(u.teamId) ?? { att: 0, cor: 0, rawAtt: 0, rawCor: 0, players: 0 };
    a.att += e.attempts;
    a.cor += e.correct;
    a.rawAtt += u.attempts;
    a.rawCor += u.correct;
    a.players += 1;
    agg.set(u.teamId, a);
    totAtt += e.attempts;
    totCor += e.correct;
  }
  const leagueMean = totAtt > 0 ? totCor / totAtt : 0.5;

  const rows = [...agg.entries()]
    .map(([teamId, a]) => ({
      teamId,
      accuracy: (a.cor + o.priorStrength * leagueMean) / (a.att + o.priorStrength),
      rawAccuracy: a.rawAtt > 0 ? a.rawCor / a.rawAtt : 0,
      players: a.players,
      attempts: a.rawAtt,
      provisional: a.players < o.minPlayers,
      rank: 0,
    }))
    .sort((x, y) => y.accuracy - x.accuracy || y.players - x.players || x.teamId.localeCompare(y.teamId));
  rows.forEach((r, i) => (r.rank = i + 1));
  return { rows, leagueMean, options: o };
}

/**
 * 구단 기여도 = 내 (캡 적용) 정답 수 − 내 시도 수 × 리그 평균 정확도.
 * "내가 평균 유저보다 구단에 정답을 몇 개 더 보탰는가". 음수 가능(= 평균 이하). 표시는 소수 1자리.
 */
export function teamContribution(
  me: Pick<UserWeekRow, 'attempts' | 'correct'>,
  leagueMean: number,
  cap = DEFAULT_RANKING_OPTIONS.perUserCap,
): number {
  const e = effective(me, cap);
  return Math.round((e.correct - e.attempts * leagueMean) * 10) / 10;
}
