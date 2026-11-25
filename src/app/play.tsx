import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildQuickRound } from '../core/pitchGen';
import { scorePitch, TIME_LIMIT_MS } from '../core/scoring';
import { BAD, OK, SURFACE_2 } from '../core/teams';
import type { Call } from '../core/types';
import { judge } from '../core/zone';
import { PitchStage } from '../features/play/PitchStage';
import { haptic } from '../services/haptics';
import { track } from '../services/analytics';
import { actions, getState, useStore, type RoundPitchResult } from '../state/store';
import { Button, Muted, Screen, T } from '../ui/primitives';
import { useTheme } from '../ui/theme';

type Phase = 'flight' | 'decide' | 'reveal';
const REVEAL_AUTO_MS = 1500;

export default function Play() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const th = useTheme();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const relaxed = useStore((s) => s.settings.relaxedTiming);

  const seed = useRef(`${getState().anonId}:${Date.now()}`).current;
  const roundId = useRef(`r-${Date.now().toString(36)}`).current;
  const pitches = useMemo(() => buildQuickRound(seed), [seed]);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('flight');
  const [flightKey, setFlightKey] = useState(0);
  const [results, setResults] = useState<RoundPitchResult[]>([]);
  const resultsRef = useRef<RoundPitchResult[]>([]);
  const holdStart = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const bar = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);

  const pitch = pitches[idx];
  const last = idx === pitches.length - 1;
  const current = results[idx];

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    track(first ? 'first_round_start' : 'round_start');
    return () => clearTimers();
  }, [first]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    actions.completeRound({ id: roundId, ts: Date.now(), mode: 'quick', results: resultsRef.current });
    haptic.milestone();
    track('round_complete', { correct: resultsRef.current.filter((r) => r.correct).length, first: !!first });
    router.replace({ pathname: '/result', params: { id: roundId, first: first ?? '' } });
  }, [first, roundId, router]);

  const next = useCallback(() => {
    clearTimers();
    if (last) return finish();
    setIdx((i) => i + 1);
    setPhase('flight');
    setFlightKey((k) => k + 1);
    bar.setValue(1);
  }, [bar, finish, last]);

  const answer = useCallback(
    (call: Call | 'timeout') => {
      if (phase !== 'decide') return;
      clearTimers();
      bar.stopAnimation();
      const v = judge(pitch);
      const correct = call === v.call;
      const rt = relaxed ? TIME_LIMIT_MS : Math.min(TIME_LIMIT_MS, Date.now() - holdStart.current);
      const combo = correct ? 1 + countTrailingCorrect(resultsRef.current) : 0;
      const score = scorePitch({ correct, edgeMarginIn: v.edgeMarginIn, rtMs: relaxed ? TIME_LIMIT_MS : rt, combo });
      const r: RoundPitchResult = { pitch, userCall: call, truth: v.call, correct, rtMs: rt, score, edgeMarginIn: v.edgeMarginIn };
      resultsRef.current = [...resultsRef.current, r];
      setResults(resultsRef.current);
      setPhase('reveal');
      correct ? haptic.correct() : haptic.wrong();
      AccessibilityInfo.announceForAccessibility(`${correct ? '정답' : '오답'}. ABS 판정 ${v.call === 'strike' ? '스트라이크' : '볼'}`);
      if (!relaxed) timers.current.push(setTimeout(next, REVEAL_AUTO_MS));
    },
    [bar, next, phase, pitch, relaxed],
  );

  const onFlightEnd = useCallback(() => {
    setPhase('decide');
    holdStart.current = Date.now();
    if (relaxed) return;
    bar.setValue(1);
    Animated.timing(bar, { toValue: 0, duration: TIME_LIMIT_MS, easing: Easing.linear, useNativeDriver: true }).start();
    timers.current.push(setTimeout(() => answerRef.current('timeout'), TIME_LIMIT_MS));
  }, [bar, relaxed]);
  const answerRef = useRef(answer);
  answerRef.current = answer;

  const quit = () =>
    Alert.alert('이번 판을 그만할까요?', '기록은 저장되지 않아요.', [
      { text: '계속하기', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: () => router.back() },
    ]);

  const score = results.reduce((a, r) => a + r.score, 0);

  return (
    <Screen style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12, paddingHorizontal: 16, gap: 12 }}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="나가기" onPress={quit} hitSlop={8} style={styles.close}>
          <T size={22} weight="800">✕</T>
        </Pressable>
        <View style={styles.dots} accessible accessibilityLabel={`${idx + 1}번째 투구, 총 ${pitches.length}구`}>
          {pitches.map((_, i) => {
            const r = results[i];
            return (
              <View key={i} style={[styles.dot, i === idx && { borderColor: th.accent }, r && { backgroundColor: r.correct ? OK : 'transparent', borderColor: r.correct ? OK : BAD }]}>
                {r ? <T size={12} weight="900" color={r.correct ? '#04140A' : BAD}>{r.correct ? '✓' : '✕'}</T> : <Muted size={12} weight="800">{i + 1}</Muted>}
              </View>
            );
          })}
        </View>
        <View style={{ minWidth: 64, alignItems: 'flex-end' }}>
          <Muted size={11} weight="800">점수</Muted>
          <T size={22} weight="900" color={th.accent}>{score}</T>
        </View>
      </View>

      {first && idx === 0 ? (
        <Muted size={14} weight="700" center>공이 존에 조금이라도 걸리면 스트라이크!</Muted>
      ) : (
        <Muted size={13} weight="700" center>{phase === 'decide' ? '공이 멈췄어요. 판정하세요!' : phase === 'flight' ? '투구 중…' : ' '}</Muted>
      )}

      <PitchStage
        pitch={pitch}
        mode={phase === 'reveal' ? 'reveal' : 'guess'}
        userCall={current?.userCall ?? null}
        flightKey={flightKey}
        onFlightEnd={onFlightEnd}
        simulatedBadge
      />

      <View style={styles.timerTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {!relaxed && phase !== 'reveal' ? (
          <Animated.View style={[styles.timerFill, { backgroundColor: th.accent, transform: [{ scaleX: bar }] }]} />
        ) : null}
      </View>

      {phase === 'reveal' ? (
        <Button big label={last ? '결과 보기' : '다음 투구'} onPress={next} accessibilityHint="누르지 않아도 잠시 후 자동으로 넘어가요" />
      ) : (
        <View style={styles.row}>
          <Button big style={{ flex: 1 }} label="스트라이크" disabled={phase !== 'decide'} onPress={() => answer('strike')} quiet />
          <Button big style={{ flex: 1 }} variant="secondary" label="볼" disabled={phase !== 'decide'} onPress={() => answer('ball')} quiet />
        </View>
      )}
    </Screen>
  );
}

function countTrailingCorrect(rs: RoundPitchResult[]): number {
  let n = 0;
  for (let i = rs.length - 1; i >= 0 && rs[i].correct; i--) n++;
  return n;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: SURFACE_2 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#2C3846', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  timerTrack: { height: 6, borderRadius: 3, backgroundColor: SURFACE_2, overflow: 'hidden' },
  timerFill: { height: 6, width: '100%', transformOrigin: 'left' },
});
