import { addDays, dayKeyToMs, kstDayKey } from './dates';
import { liveStreak, streakStatus, type StreakState } from './streak';

/**
 * 푸시 정책 (하루 최대 2회, 둘 다 로컬 예약이라 서버 비용 0)
 *  1) 매일 같은 시간(17:30) 1회 — 평일 18:30 경기 시작 직전. 주말/휴일 경기 시간은 다르므로 A4: 고정 시각 유지 vs 경기 시각 연동은 알파 A/B.
 *  2) 스트릭 끊김 직전(21:30) — 연속 2일 이상이고 오늘 아직 안 한 경우에만. 오늘 한 판을 끝내면 취소하고 '내일 21:30'으로 재예약.
 * 알림 시각은 기기 로컬 시간(국내 사용자 가정 A5; 해외 체류자는 KST 기준 dayKey와 어긋날 수 있음).
 */
export const DAILY_PUSH = { hour: 17, minute: 30 };
export const STREAK_RISK_PUSH = { hour: 21, minute: 30 };

const DAILY_VARIANTS = (n: number) => [
  { title: '오늘의 논란 판정 도착', body: `오늘 경계선 투구 ${n}개, 팬 투표 vs ABS. 30초면 끝나요.` },
  { title: '우리 구단 순위 지키러 가요', body: '이번 주 구단 대항전, 한 판이면 정확도가 올라가요.' },
  { title: '심판보다 정확할 자신 있어요?', body: `오늘의 논란 판정 ${n}개가 기다리고 있어요.` },
];

export function dailyCopy(dayKey: string, controversyCount: number) {
  const v = DAILY_VARIANTS(controversyCount);
  const idx = Math.abs([...dayKey].reduce((a, c) => a + c.charCodeAt(0), 0)) % v.length;
  return v[idx];
}

export interface OneShotPlan {
  id: 'streak_risk';
  fireAtMs: number;
  title: string;
  body: string;
}

const atKst = (dayKey: string, hour: number, minute: number) => dayKeyToMs(dayKey) + (hour * 60 + minute) * 60000;

export function planStreakRisk(streak: StreakState, now: number): OneShotPlan | null {
  const today = kstDayKey(now);
  const st = streakStatus(streak, now);
  let targetDay: string;
  if (st === 'safe') {
    targetDay = addDays(today, 1);
  } else if (st === 'at_risk') {
    targetDay = today;
  } else return null;
  if (liveStreak(streak, now) < 2) return null;
  const fireAtMs = atKst(targetDay, STREAK_RISK_PUSH.hour, STREAK_RISK_PUSH.minute);
  if (fireAtMs <= now) return null;
  return {
    id: 'streak_risk',
    fireAtMs,
    title: `${streak.current}일 연속 기록이 곧 끊겨요`,
    body: '30초만 투자해서 스트릭을 지켜요. 한 판이면 충분해요.',
  };
}
