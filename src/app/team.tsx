import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SURFACE, SURFACE_2, TEAMS, teamTheme } from '../core/teams';
import { haptic } from '../services/haptics';
import { track } from '../services/analytics';
import { actions, useStore } from '../state/store';
import { Muted, Screen, T } from '../ui/primitives';

/** 응원 구단 선택: 가입 없이. 선택 즉시 앱 accent가 구단 컬러(AA 보정)로 바뀐다. */
export default function TeamPick() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const current = useStore((s) => s.teamId);
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <T size={26} weight="900">응원 구단을 골라요</T>
        <Muted size={14} weight="600">선택하면 이번 주 구단 대항전에 바로 합류해요. 구단은 언제든 바꿀 수 있어요.</Muted>
        <View style={styles.grid}>
          {TEAMS.map((t) => {
            const th = teamTheme(t.id);
            const sel = current === t.id;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={`${t.name}${sel ? ', 선택됨' : ''}`}
                onPress={() => {
                  haptic.correct();
                  actions.setTeam(t.id);
                  track('team_select', { team: t.id });
                  router.back();
                }}
                style={[styles.cell, { borderColor: sel ? th.accent : SURFACE_2, borderWidth: sel ? 3 : 1 }]}>
                <View style={[styles.swatch, { backgroundColor: th.accent }]} />
                <T size={16} weight="900">{t.name}</T>
                {sel ? <T size={12} weight="900" color={th.accent}>선택됨 ✓</T> : null}
              </Pressable>
            );
          })}
        </View>
        <Muted size={11} weight="600">구단 컬러는 접근성(대비 4.5:1)을 위해 화면 배경에 맞게 자동 보정돼요. 공식 로고는 사용하지 않아요.</Muted>
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48%', minHeight: 96, borderRadius: 18, backgroundColor: SURFACE, padding: 14, gap: 6, justifyContent: 'center' },
  swatch: { width: 36, height: 8, borderRadius: 4 },
});
