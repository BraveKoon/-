import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kstWeekKey } from '../../core/dates';
import { summarizeRound } from '../../core/scoring';
import { liveStreak } from '../../core/streak';
import { OK, SURFACE_2, teamName } from '../../core/teams';
import { useStanding } from '../../features/standing';
import { requestPermission, syncNotifications } from '../../services/notifications';
import { actions, useStore } from '../../state/store';
import { Button, Card, Muted, Screen, Stat, T } from '../../ui/primitives';
import { useTheme } from '../../ui/theme';

export default function Me() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const th = useTheme();
  const { answers, rounds, streak, teamId, settings, nickname } = useStore((s) => s);
  const standing = useStanding();
  const stats = useMemo(() => {
    const wk = kstWeekKey(Date.now());
    const week = answers.filter((a) => kstWeekKey(a.ts) === wk);
    const pct = (xs: typeof answers) => (xs.length ? `${Math.round((xs.filter((a) => a.correct).length / xs.length) * 100)}%` : '-');
    return { all: pct(answers), week: pct(week), total: answers.length, weekN: week.length };
  }, [answers]);
  const now = Date.now();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40, gap: 14 }}>
        <View>
          <T size={13} weight="900" color={th.accent} style={{ letterSpacing: 2 }}>MY RECORD</T>
          <T size={28} weight="900">{nickname}</T>
          <Muted size={14} weight="700">{teamId ? teamName(teamId) : '응원 구단 미선택'} · 가입 없이 이 기기에 저장돼요</Muted>
        </View>

        <View style={styles.grid}>
          <Stat label="이번 주 정확도" value={stats.week} />
          <Stat label="누적 정확도" value={stats.all} />
        </View>
        <View style={styles.grid}>
          <Stat label="연속 기록" value={`${liveStreak(streak, now)}일`} />
          <Stat label="최고 연속" value={`${streak.best}일`} />
        </View>
        <View style={styles.grid}>
          <Stat label="총 판정" value={`${stats.total}`} />
          <Stat label="구단 기여도" value={standing.contribution == null ? '-' : `${standing.contribution >= 0 ? '+' : ''}${standing.contribution.toFixed(1)}`} />
        </View>

        <Button variant="secondary" label={teamId ? '응원 구단 변경' : '응원 구단 선택'} onPress={() => router.push('/team')} />

        <T size={18} weight="900" style={{ marginTop: 8 }}>최근 한 판</T>
        {rounds.length === 0 ? <Muted size={15} weight="600">아직 기록이 없어요. 한 판 해볼까요?</Muted> : null}
        {rounds.slice(0, 8).map((r) => {
          const s = summarizeRound(r.results.map((x) => ({ correct: x.correct, score: x.score })));
          return (
            <Card key={r.id} style={styles.roundRow}>
              <View style={{ flex: 1 }}>
                <T size={16} weight="900">{Math.round(s.accuracy * 100)}% · {s.correct}/{s.total}</T>
                <Muted size={12} weight="700">{new Date(r.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {s.score}점</Muted>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {r.results.map((x, i) => <T key={i} size={14} weight="900" color={x.correct ? OK : '#FF6B6B'}>{x.correct ? '✓' : '✕'}</T>)}
              </View>
              <Button style={{ minWidth: 76 }} variant="secondary" label="공유" onPress={() => router.push({ pathname: '/share', params: { kind: 'round', id: r.id } })} />
            </Card>
          );
        })}

        <T size={18} weight="900" style={{ marginTop: 8 }}>설정</T>
        <Card style={{ gap: 6 }}>
          <Setting label="매일 17:30 알림 · 연속 기록 끊김 직전 알림" value={settings.notify} onChange={async (v) => {
            let ok = v;
            if (v) ok = await requestPermission();
            actions.updateSettings({ notify: ok, notifyAsked: true });
            syncNotifications({ enabled: ok, streak });
          }} />
          <Setting label="진동(햅틱)" value={settings.haptics} onChange={(v) => actions.updateSettings({ haptics: v })} />
          <Setting label="3D 판정 연출 (끄면 2D 간단 보기)" value={settings.render3d} onChange={(v) => actions.updateSettings({ render3d: v })} />
          <Setting label="시간 제한 없이 판정 (접근성)" value={settings.relaxedTiming} onChange={(v) => actions.updateSettings({ relaxedTiming: v })} />
        </Card>
        <Muted size={12} weight="600">알파 단계에서는 실제 경기 영상·추적 데이터 대신 시뮬레이션 투구를 사용해요. 금전 보상·베팅 요소는 없어요.</Muted>
      </ScrollView>
    </Screen>
  );
}

function Setting({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const th = useTheme();
  return (
    <View style={styles.setting}>
      <T size={15} weight="700" style={{ flex: 1 }}>{label}</T>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: th.accent, false: '#3A4654' }} thumbColor="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 10 },
  roundRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  setting: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderBottomColor: SURFACE_2 },
});
