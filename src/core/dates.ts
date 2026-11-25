/** KST(UTC+9, 서머타임 없음) 기준 일/주 키. 주간 시즌은 월 00:00 ~ 일 24:00 KST. */
const KST_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export const kstDayKey = (ts: number): string => new Date(ts + KST_MS).toISOString().slice(0, 10);

export const dayKeyToMs = (dayKey: string): number => Date.parse(`${dayKey}T00:00:00Z`) - KST_MS;

export const addDays = (dayKey: string, n: number): string => kstDayKey(dayKeyToMs(dayKey) + n * DAY_MS + 1);

/** 해당 시각이 속한 주의 월요일(KST) dayKey. 시즌 ID로 사용. */
export function kstWeekKey(ts: number): string {
  const d = new Date(ts + KST_MS);
  const dow = (d.getUTCDay() + 6) % 7; // 월=0
  return kstDayKey(ts - dow * DAY_MS);
}

export const msUntilWeekEnd = (ts: number): number => dayKeyToMs(addDays(kstWeekKey(ts), 7)) - ts;
export const msUntilDayEnd = (ts: number): number => dayKeyToMs(addDays(kstDayKey(ts), 1)) - ts;

export function formatCountdown(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return d > 0 ? `${d}일 ${h}시간` : `${h}시간 ${mm}분`;
}

/** "11월 4주차"가 아니라 시즌 시작일로 표기: "11.23~11.29" */
export function weekLabel(weekKey: string): string {
  const end = addDays(weekKey, 6);
  const f = (k: string) => `${Number(k.slice(5, 7))}.${Number(k.slice(8, 10))}`;
  return `${f(weekKey)} ~ ${f(end)}`;
}
