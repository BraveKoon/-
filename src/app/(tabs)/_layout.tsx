import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';
import { BG, SURFACE_2, TEXT_MUTED } from '../../core/teams';
import { useTheme } from '../../ui/theme';

const icon = (glyph: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.6 }} accessible={false}>{glyph}</Text>;
  };

/** 하단 탭 3개: 오늘의 퀴즈 / 구단 랭킹 / 내 기록. 라벨은 항상 표시(아이콘 단독 금지 = 접근성). */
export default function TabsLayout() {
  const th = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: th.accent,
        tabBarInactiveTintColor: TEXT_MUTED,
        tabBarStyle: { backgroundColor: BG, borderTopColor: SURFACE_2, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '800' },
        sceneStyle: { backgroundColor: BG },
      }}>
      <Tabs.Screen name="index" options={{ title: '오늘의 퀴즈', tabBarIcon: icon('⚾') }} />
      <Tabs.Screen name="ranking" options={{ title: '구단 랭킹', tabBarIcon: icon('🏆') }} />
      <Tabs.Screen name="me" options={{ title: '내 기록', tabBarIcon: icon('📊') }} />
    </Tabs>
  );
}
