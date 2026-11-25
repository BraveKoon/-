import type { AnswerRecord, Call } from './types';

/**
 * 점수식 (개인 점수 전용 — 구단 순위에는 쓰지 않는다. 구단 순위는 '정확도'만 사용: ranking.ts)
 *
 *   score = correct ? 100 + difficultyBonus + speedBonus + comboBonus : 0
 *   difficultyBonus = round(100 · clamp(1 − |edgeMarginIn| / 4, 0, 1))   // 경계선에 가까울수록 최대 +100
 *   speedBonus      = round(50 · clamp(1 − rtMs / TIME_LIMIT_MS, 0, 1))  // 빠를수록 최대 +50
 *   comboBonus      = 10 · min(연속정답 − 1, 4)                           // 최대 +40
 * 한 구 최대 290점, 한 판(5구) 최대 1,450점.
 */
export const TIME_LIMIT_MS = 4000;
export const MAX_PITCH_SCORE = 290;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** 부동소수 오차(49.4999999…)로 .5 경계에서 서버(PG numeric) 반올림과 갈리지 않도록 6자리로 정규화 후 반올림 */
const round = (x: number) => Math.round(Number(x.toFixed(6)));

export function scorePitch(args: {
  correct: boolean;
  edgeMarginIn: number;
  rtMs: number;
  /** 이번 구를 포함한 연속 정답 수 (오답이면 0) */
  combo: number;
}): number {
  if (!args.correct) return 0;
  const difficultyBonus = round(100 * clamp01(1 - Math.abs(args.edgeMarginIn) / 4));
  const speedBonus = round(50 * clamp01(1 - args.rtMs / TIME_LIMIT_MS));
  const comboBonus = 10 * Math.min(Math.max(args.combo - 1, 0), 4);
  return 100 + difficultyBonus + speedBonus + comboBonus;
}

export interface RoundSummary {
  total: number;
  correct: number;
  accuracy: number; // 0..1
  score: number;
  maxCombo: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  title: string;
}

export function summarizeRound(records: Pick<AnswerRecord, 'correct' | 'score'>[]): RoundSummary {
  const total = records.length;
  const correct = records.filter((r) => r.correct).length;
  let maxCombo = 0;
  let run = 0;
  for (const r of records) {
    run = r.correct ? run + 1 : 0;
    maxCombo = Math.max(maxCombo, run);
  }
  const accuracy = total ? correct / total : 0;
  const grade = accuracy >= 1 ? 'S' : accuracy >= 0.8 ? 'A' : accuracy >= 0.6 ? 'B' : accuracy >= 0.4 ? 'C' : 'D';
  const title = {
    S: '완벽한 눈! ABS급 판정',
    A: '날카로운 눈',
    B: '꽤 정확해요',
    C: '아직 몸이 덜 풀렸어요',
    D: '내일은 더 잘 보일 거예요',
  }[grade];
  return { total, correct, accuracy, score: records.reduce((a, r) => a + r.score, 0), maxCombo, grade, title };
}

export function isCorrect(userCall: Call | 'timeout', truth: Call): boolean {
  return userCall === truth;
}
