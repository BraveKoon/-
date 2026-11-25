import * as Haptics from 'expo-haptics';
import { getState } from '../state/store';

const on = () => getState().settings.haptics;
const safe = (p: Promise<void>) => p.catch(() => {});

/** 햅틱 가이드: 탭=selection, 정답=Success, 오답=Warning(Error는 과해서 사용 안 함), 마일스톤=Heavy impact */
export const haptic = {
  tap: () => on() && safe(Haptics.selectionAsync()),
  press: () => on() && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  correct: () => on() && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  wrong: () => on() && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  milestone: () => on() && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
};
