import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BG } from '../core/teams';
import { track } from '../services/analytics';
import { syncNotifications } from '../services/notifications';
import { getState, hydrate, useStore } from '../state/store';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useStore((s) => s.hydrated);
  const notify = useStore((s) => s.settings.notify);
  const streak = useStore((s) => s.streak);
  const redirected = useRef(false);

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    track('app_open', { hasTeam: !!getState().teamId, rounds: getState().rounds.length });
    // 가입 없이 첫 판: 첫 실행이 홈(/)으로 열렸을 때만 바로 퀴즈로.
    // 초대 링크(/l/CODE) 등 딥링크로 처음 열린 경우는 그 화면을 유지한다.
    if (!redirected.current && getState().rounds.length === 0 && pathname === '/') {
      redirected.current = true;
      router.replace({ pathname: '/play', params: { first: '1' } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, router]);

  // 알림 예약은 설정/스트릭이 바뀔 때마다 재계산 (로컬 예약)
  useEffect(() => {
    if (hydrated) syncNotifications({ enabled: notify, streak });
  }, [hydrated, notify, streak]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG }, animation: 'fade', animationDuration: 200 }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="play" options={{ gestureEnabled: false, animation: 'slide_from_bottom', animationDuration: 250 }} />
        <Stack.Screen name="result" options={{ gestureEnabled: false }} />
        <Stack.Screen name="team" options={{ presentation: 'modal', animation: 'slide_from_bottom', animationDuration: 250 }} />
        <Stack.Screen name="share" options={{ presentation: 'modal', animation: 'slide_from_bottom', animationDuration: 250 }} />
      </Stack>
    </SafeAreaProvider>
  );
}
