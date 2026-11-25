import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kstDayKey } from '../../core/dates';
import { judge } from '../../core/zone';
import { liveStreak, streakStatus } from '../../core/streak';
import { BAD, OK, SURFACE_2, teamShort } from '../../core/teams';
import { useStanding } from '../../features/standing';
import { api, type ControversyItem } from '../../services/api';
import { useStore } from '../../state/store';
import { Button, Card, Muted, Screen, T } from '../../ui/primitives';
import { useTheme } from '../../ui/theme';

export default function Today() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const th = useTheme();
  const teamId = useStore((s) => s.teamId);
  const streak = useStore((s) => s.streak);
  const votes = useStore((s) => s.votes);
  const [items, setItems] = useState<ControversyItem[]>([]);
  const day = kstDayKey(Date.now());
  const standing = useStanding();
  const st = streakStatus(streak, Date.now());

  useEffect(() => {
    api.getControversies(day).then(setItems);
  }, [day]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 32, gap: 16 }}>
        <View style={styles.header}>
          <View>
            <T size={13} weight="900" color={th.accent} style={{ letterSpacing: 2 }}>STRZONE · 스트존</T>
            <T size={24} weight="900">{teamId ? `${teamShort(teamId)} 팬` : '우리 구단 팬이 심판보다 정확하다'}</T>
          </View>
          <View accessible accessibilityLabel={`연속 기록 ${liveStreak(streak, Date.now())}일${st === 'at_risk' ? ', 오늘 안 하면 끊겨요' : ''}`} style={[styles.streak, st === 'at_risk' && { borderColor: BAD }]}>
            <Muted size={11} weight="800">연속</Muted>
            <T size={26} weight="900" color={st === 'at_risk' ? BAD : th.accent}>{liveStreak(streak, Date.now())}일</T>
          </View>
        </View>

        <Card accent style={{ gap: 12 }}>
          <T size={13} weight="900" color={th.accent}>오늘의 퀴즈</T>
          <T size={34} weight="900" maxScale={1.3}>한 판 30초</T>
          <Muted size={15} weight="600">5구를 판정하고, ABS 정답과 바로 비교해요. 가입은 필요 없어요.</Muted>
          {st === 'at_risk' ? <T size={14} weight="800" color={BAD}>오늘 한 판을 끝내야 {streak.current}일 연속 기록이 이어져요</T> : null}
          <Button big label="바로 시작" onPress={() => router.push('/play')} />
        </Card>

        <View style={{ gap: 10 }}>
          <View style={styles.rowBetween}>
            <T size={18} weight="900">오늘의 논란 판정</T>
            <Muted size={12} weight="700">매일 자정(KST) 갱신 · 시뮬레이션</Muted>
          </View>
          {items.map((it, i) => {
            const v = votes[it.pitch.id];
            const truth = judge(it.pitch).call;
            return (
              <Pressable
                key={it.pitch.id}
                accessibilityRole="button"
                accessibilityLabel={`논란 판정 ${i + 1}. ${it.pitch.label}. ${v ? (v.call === truth ? 'ABS와 일치' : 'ABS와 달랐음') : '아직 투표 전'}`}
                onPress={() => router.push({ pathname: '/controversy/[i]', params: { i: String(i), day } })}
                style={styles.ctr}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Muted size={12} weight="800">논란 {i + 1}</Muted>
                  <T size={16} weight="800" numberOfLines={1}>{it.pitch.label}</T>
                </View>
                {v ? (
                  <T size={14} weight="900" color={v.call === truth ? OK : BAD}>{v.call === truth ? '✓ ABS 일치' : '✕ 달랐어요'}</T>
                ) : (
                  <T size={14} weight="900" color={th.accent}>투표하기 ›</T>
                )}
              </Pressable>
            );
          })}
        </View>

        {teamId ? (
          <Pressable accessibilityRole="button" accessibilityLabel="구단 랭킹 보기" onPress={() => router.push('/ranking')}>
            <Card>
              <Muted size={12} weight="800">이번 주 우리 구단</Muted>
              <View style={styles.rowBetween}>
                <T size={30} weight="900" color={th.accent}>{standing.rank ? `${standing.rank}위` : '집계 중'}</T>
                <T size={22} weight="900">{standing.myRow ? `${(standing.myRow.accuracy * 100).toFixed(1)}%` : '-'}</T>
              </View>
            </Card>
          </Pressable>
        ) : (
          <Card>
            <T size={16} weight="900">응원 구단을 고르면 구단 대항전에 참여해요</T>
            <View style={{ height: 10 }} />
            <Button variant="secondary" label="응원 구단 선택" onPress={() => router.push('/team')} />
          </Card>
        )}

        <Card style={{ gap: 10 }}>
          <T size={16} weight="900">친구와 미니 리그</T>
          <Muted size={14} weight="600">초대 링크 하나로 우리끼리 순위표를 만들어요.</Muted>
          <Button variant="secondary" label="리그 만들기" onPress={() => router.push('/league/new')} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  streak: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 2, borderColor: SURFACE_2, minWidth: 72 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  ctr: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, backgroundColor: '#141B24', borderWidth: 1, borderColor: SURFACE_2 },
});
