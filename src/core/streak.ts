import { addDays, dayKeyToMs, kstDayKey } from './dates';

export interface StreakState {
  current: number;
  best: number;
  /** 마지막으로 한 판을 끝낸 날(KST dayKey) */
  lastDay: string | null;
}
export const EMPTY_STREAK: StreakState = { current: 0, best: 0, lastDay: null };

export type StreakStatus = 'none' | 'safe' | 'at_risk' | 'broken';

/** 라운드를 완료할 때마다 호출. 하루 1회만 증가. */
export function recordPlay(s: StreakState, ts: number): StreakState {
  const today = kstDayKey(ts);
  if (s.lastDay === today) return s;
  const next = s.lastDay === addDays(today, -1) ? s.current + 1 : 1;
  return { current: next, best: Math.max(s.best, next), lastDay: today };
}

export function streakStatus(s: StreakState, ts: number): StreakStatus {
  if (!s.lastDay || s.current === 0) return 'none';
  const today = kstDayKey(ts);
  if (s.lastDay === today) return 'safe';
  if (s.lastDay === addDays(today, -1)) return 'at_risk';
  return 'broken';
}

/** 화면 표시용 현재 스트릭: 끊겼으면 0. */
export function liveStreak(s: StreakState, ts: number): number {
  const st = streakStatus(s, ts);
  return st === 'safe' || st === 'at_risk' ? s.current : 0;
}

export const msUntilStreakDeadline = (ts: number): number => dayKeyToMs(addDays(kstDayKey(ts), 1)) - ts;
