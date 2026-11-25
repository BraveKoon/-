import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SURFACE, SURFACE_2, TEXT } from '../../core/teams';
import { api, inviteUrl, type LeagueView } from '../../services/api';
import { haptic } from '../../services/haptics';
import { track } from '../../services/analytics';
import { actions, useStore } from '../../state/store';
import { Button, Card, Muted, Screen, T } from '../../ui/primitives';
import { useTheme } from '../../ui/theme';
import { kstWeekKey } from '../../core/dates';

/** 초대 링크 착지 + 리그 순위표. https://strzone.app/l/CODE 또는 strzone://l/CODE */
export default function League() {
  const insets = useSafeAreaInsets();
  const th = useTheme();
  const { code, created } = useLocalSearchParams<{ code: string; created?: string }>();
  const joined = useStore((s) => s.leagues.find((l) => l.code === code) ?? null);
  const answers = useStore((s) => s.answers);
  const nickname = useStore((s) => s.nickname);
  const [view, setView] = useState<LeagueView | null>(null);

  useEffect(() => {
    api.getLeague(code ?? '').then(setView);
  }, [code]);

  const mine = useMemo(() => {
    const wk = kstWeekKey(Date.now());
    const w = answers.filter((a) => kstWeekKey(a.ts) === wk);
    return { name: `${nickname} (나)`, attempts: w.length, accuracy: w.length ? w.filter((a) => a.correct).length / w.length : 0, demo: false };
  }, [answers, nickname]);

  const members = useMemo(() => {
    const others = joined?.mine ? [] : (view?.members ?? []);
    return [mine, ...others].sort((a, b) => b.accuracy - a.accuracy);
  }, [mine, view, joined]);

  const name = joined?.name ?? view?.name ?? '미니 리그';
  const invite = async () => {
    track('invite_sent', { source: 'league' });
    await Share.share({ message: `"${name}" 스트존 리그에 참여해! ${inviteUrl(code ?? '')}` }).catch(() => {});
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 32, gap: 14 }}>
        <View>
          <T size={13} weight="900" color={th.accent} style={{ letterSpacing: 2 }}>MINI LEAGUE · {code}</T>
          <T size={28} weight="900">{name}</T>
          {created ? <T size={15} weight="800" color={th.accent}>리그가 만들어졌어요! 링크를 친구에게 보내 보세요.</T> : null}
        </View>

        {!joined ? (
          <Card accent style={{ gap: 10 }}>
            <T size={16} weight="900">이 리그에 참여할까요?</T>
            <Muted size={14} weight="600">가입 없이 바로 참여돼요. 이번 주 정확도로 순위가 정해져요.</Muted>
            <Button big label="참여하기" onPress={() => { actions.addLeague({ code: code ?? '', name, kind: view?.kind ?? 'friends', mine: false }); haptic.correct(); track('league_join'); }} />
          </Card>
        ) : (
          <Button big label="초대 링크 보내기" onPress={invite} accessibilityHint="카카오톡 등으로 초대 링크를 공유해요" />
        )}

        <T size={18} weight="900">이번 주 순위 (정확도)</T>
        {members.map((m, i) => (
          <View key={m.name} accessible accessibilityLabel={`${i + 1}위 ${m.name} 정확도 ${Math.round(m.accuracy * 100)}퍼센트, ${m.attempts}회`} style={styles.row}>
            <T size={22} weight="900" style={{ width: 34 }} color={i === 0 ? th.accent : TEXT}>{i + 1}</T>
            <View style={{ flex: 1 }}>
              <T size={16} weight="800">{m.name}</T>
              <Muted size={12} weight="700">{m.attempts}회{m.demo ? ' · 데모 멤버' : ''}</Muted>
            </View>
            <T size={20} weight="900" color={th.accent}>{m.attempts ? `${Math.round(m.accuracy * 100)}%` : '-'}</T>
          </View>
        ))}
        {api.simulated ? <Muted size={12} weight="600">서버 연결 전(알파)에는 다른 멤버가 데모 데이터로 표시돼요.</Muted> : null}
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 16, backgroundColor: SURFACE, borderWidth: 1, borderColor: SURFACE_2, minHeight: 64 },
});
