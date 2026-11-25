import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { addDays, dayKeyToMs, kstDayKey } from '../core/dates';
import { DAILY_PUSH, dailyCopy, planStreakRisk } from '../core/notificationPlan';
import type { StreakState } from '../core/streak';

/**
 * 로컬 알림만 사용(서버 비용 0, 개인정보 전송 없음).
 *  - 앞으로 7일치 '매일 17:30' 알림을 날짜별 문구로 개별 예약 (앱을 열 때마다 갱신)
 *  - 스트릭 끊김 직전(21:30) 1건: 한 판 끝낼 때마다 취소→재예약
 * 원격 푸시(FCM/APNs)는 '구단 경기 시작 연동'이 필요해지는 Phase 2에서 도입.
 */
const CHANNEL = 'strzone-daily';
const DAYS_AHEAD = 7;
const CONTROVERSIES_PER_DAY = 3;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: '오늘의 판정 알림',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    const res = await Notifications.requestPermissionsAsync();
    return res.granted;
  } catch {
    return false;
  }
}

export async function cancelAll() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

export async function syncNotifications(opts: { enabled: boolean; streak: StreakState; now?: number }) {
  const now = opts.now ?? Date.now();
  try {
    await cancelAll();
    if (!opts.enabled) return;
    const today = kstDayKey(now);
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const day = addDays(today, i);
      const fireAt = dayKeyToMs(day) + (DAILY_PUSH.hour * 60 + DAILY_PUSH.minute) * 60000;
      if (fireAt <= now) continue;
      const c = dailyCopy(day, CONTROVERSIES_PER_DAY);
      await Notifications.scheduleNotificationAsync({
        identifier: `daily-${day}`,
        content: { title: c.title, body: c.body, data: { kind: 'daily' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: CHANNEL },
      });
    }
    const risk = planStreakRisk(opts.streak, now);
    if (risk) {
      await Notifications.scheduleNotificationAsync({
        identifier: risk.id,
        content: { title: risk.title, body: risk.body, data: { kind: 'streak_risk' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: risk.fireAtMs, channelId: CHANNEL },
      });
    }
  } catch {
    /* 알림 실패는 게임 흐름을 막지 않는다 */
  }
}
