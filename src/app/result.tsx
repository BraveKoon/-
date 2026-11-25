import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { liveStreak } from '../core/streak';
import { summarizeRound } from '../core/scoring';
import { teamName } from '../core/teams';
import { PitchStage } from '../features/play/PitchStage';
import { useStanding } from '../features/standing';
import { track } from '../services/analytics';
import { requestPermission } from '../services/notifications';
import { actions, useStore } from '../state/store';
import { AnimatedNumber, Button, Card, Chip, MOTION, Muted, Screen, Stat, T, useDur } from '../ui/primitives';
import { useTheme } from '../ui/theme';
import { haptic } from '../services/haptics';

export default function Result() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const th = useTheme();
  const dur = useDur();
  const { id } = useLocalSearchParams<{ id: string }>();
  const round = useStore((s) => s.rounds.find((r) => r.id === id) ?? null);
  const streak = useStore((s) => s.streak);
  const teamId = useStore((s) => s.teamId);
  const asked = useStore((s) => s.settings.notifyAsked);
  const standing = useStanding();

  const sum = useMemo(() => (round ? summarizeRound(round.results.map((r) => ({ correct: r.correct, score: r.score }))) : null), [round]);
  const firstWrong = round ? Math.max(0, round.results.findIndex((r) => !r.correct)) : 0;
  const [sel, setSel] = useState(firstWrong);
  const [replay, setReplay] = useState(0);
  const [skip, setSkip] = useState(true);

  // 공유 버튼 마이크로 모션: 숫자 카운트업 직후 1회 팝(300ms)
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.05, duration: dur(MOTION.fast), easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pop, { toValue: 1, duration: dur(MOTION.fast), easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
    }, dur(650));
    return () => clearTimeout(t);
  }, [pop, dur]);

  if (!round || !sum) return <Screen><View style={{ padding: 24 }}><T>기록을 찾을 수 없어요.</T></View></Screen>;
  const cur = round.results[sel];
  const pct = Math.round(sum.accuracy * 100);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, gap: 16 }}>
        <View style={styles.head}>
          <Muted size={14} weight="800">이번 판 정확도 · {sum.total}구 중 {sum.correct}구 적중</Muted>
          <AnimatedNumber value={pct} size={112} suffix="%" color={sum.grade === 'S' || sum.grade === 'A' ? th.accent : undefined} />
          <T size={20} weight="900" center>{sum.title}</T>
          <Muted size={14} weight="700" center>점수 {sum.score.toLocaleString('ko-KR')} · 최고 연속 정답 {sum.maxCombo}</Muted>
        </View>

        {/* 가장 눈에 띄는 요소: 공유 */}
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Button
            big
            label="공유하기 · 구단에 자랑하기"
            accessibilityHint="내 정확도, 연속 기록, 구단 기여도가 담긴 이미지를 만들어요"
            onPress={() => {
              track('share_open', { source: 'round' });
              router.push({ pathname: '/share', params: { kind: 'round', id: round.id } });
            }}
          />
        </Animated.View>

        <View style={styles.statRow}>
          <Stat label="연속 기록" value={`${liveStreak(streak, Date.now())}일`} />
          <Stat label="구단 순위" value={standing.rank ? `${standing.rank}위` : '-'} />
          <Stat label="구단 기여도" value={standing.contribution == null ? '-' : `${standing.contribution >= 0 ? '+' : ''}${standing.contribution.toFixed(1)}`} />
        </View>

        {!teamId ? (
          <Card accent>
            <T size={17} weight="900">응원 구단을 고르면 이번 판이 구단 대항전에 반영돼요</T>
            <Muted size={14} weight="600" style={{ marginTop: 4, marginBottom: 12 }}>가입 없이 지금 바로 선택할 수 있어요. 앱 컬러도 구단 색으로 바뀝니다.</Muted>
            <Button label="응원 구단 선택" onPress={() => router.push('/team')} />
          </Card>
        ) : (
          <Muted size={13} weight="700" center>이번 판은 {teamName(teamId)} 주간 기록에 반영됐어요</Muted>
        )}

        {/* 존 비교 */}
        <View style={{ gap: 10 }}>
          <T size={18} weight="900">판정 비교</T>
          <View style={styles.chips}>
            {round.results.map((r, i) => (
              <Chip key={i} label={`${i + 1} ${r.correct ? '✓' : '✕'}`} a11y={`${i + 1}번 투구 ${r.correct ? '정답' : '오답'}`} selected={i === sel} onPress={() => { setSel(i); setSkip(true); }} />
            ))}
          </View>
          <View style={{ height: 380 }}>
            <PitchStage
              key={cur.pitch.id}
              pitch={cur.pitch}
              mode="reveal"
              userCall={cur.userCall}
              flightKey={replay}
              skipFlight={skip}
              onFlightEnd={() => setSkip(true)}
              simulatedBadge
            />
          </View>
          <Button variant="secondary" label="공이 날아오는 모습 다시 보기" onPress={() => { setSkip(false); setReplay((k) => k + 1); }} />
          <Muted size={13} weight="600">{cur.correct ? '정답!' : '아쉬워요.'} 경계선까지의 거리가 가까울수록 높은 점수를 받아요.</Muted>
        </View>

        {!asked ? (
          <Card>
            <T size={16} weight="900">내일 17:30에 알려드릴까요?</T>
            <Muted size={14} weight="600" style={{ marginTop: 4, marginBottom: 12 }}>매일 같은 시간 1번, 연속 기록이 끊기기 직전에 1번만 보내요.</Muted>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button style={{ flex: 1 }} label="알림 받기" onPress={async () => {
                const ok = await requestPermission();
                actions.updateSettings({ notify: ok, notifyAsked: true });
                if (ok) { haptic.correct(); track('push_optin'); }
              }} />
              <Button style={{ flex: 1 }} variant="secondary" label="나중에" onPress={() => actions.updateSettings({ notifyAsked: true })} />
            </View>
          </Card>
        ) : null}

        <Button variant="secondary" label="오늘의 논란 판정 보러가기" onPress={() => router.replace('/')} />
        <Button label="한 판 더" onPress={() => router.replace('/play')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 4 },
  statRow: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
