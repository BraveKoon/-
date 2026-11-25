import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { BAD, OK, TEXT_MUTED } from '../../core/teams';
import { describePosition, formatMargin, judge } from '../../core/zone';
import type { Call, Pitch } from '../../core/types';
import { T, useDur } from '../../ui/primitives';

export interface StageProps {
  pitch: Pitch;
  mode: 'guess' | 'reveal';
  userCall?: Call | 'timeout' | null;
  /** 값이 바뀔 때마다 비행 애니메이션 재생 */
  flightKey: number;
  skipFlight?: boolean;
  onFlightEnd?: () => void;
  /** 판정 도장(스트라이크/볼) 표시 */
  showVerdict?: boolean;
  simulatedBadge?: boolean;
}

const callKo = (c: Call) => (c === 'strike' ? '스트라이크' : '볼');

/** 스크린리더 라벨: 판정 전에는 정답을 말하지 않고 위치 수치만 준다 */
export function stageLabel(pitch: Pitch, mode: 'guess' | 'reveal', userCall?: Call | 'timeout' | null): string {
  const v = judge(pitch);
  if (mode === 'guess') return `투구 도착. ${describePosition(pitch)}.`;
  const correct = userCall != null && userCall === v.call;
  return `ABS 판정 ${callKo(v.call)}. ${formatMargin(v.edgeMarginIn)}. ${userCall && userCall !== 'timeout' ? `내 판정 ${callKo(userCall)}, ${correct ? '정답' : '오답'}.` : '시간 초과.'}`;
}

/** 2D/3D 스테이지 공용: 판정 도장(250ms, 존 공개 220ms 뒤) + 시뮬레이션 배지 */
export function StageOverlay({ pitch, mode, userCall, showVerdict, simulatedBadge, delayMs = 220 }: Pick<StageProps, 'pitch' | 'mode' | 'userCall' | 'showVerdict' | 'simulatedBadge'> & { delayMs?: number }) {
  const dur = useDur();
  const stamp = useRef(new Animated.Value(0)).current;
  const v = judge(pitch);
  const correct = userCall != null && userCall === v.call;
  const color = v.call === 'strike' ? OK : BAD;

  useEffect(() => {
    stamp.setValue(0);
    if (mode !== 'reveal') return;
    const a = Animated.sequence([
      Animated.delay(dur(delayMs)),
      Animated.timing(stamp, { toValue: 1, duration: dur(250), easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [mode, pitch.id, stamp, dur, delayMs]);

  const scale = stamp.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] });
  return (
    <>
      {mode === 'reveal' && showVerdict !== false ? (
        <Animated.View pointerEvents="none" style={[styles.stamp, { opacity: stamp, transform: [{ scale }] }]}>
          <T size={13} weight="800" color={TEXT_MUTED}>ABS 판정</T>
          <T size={46} weight="900" color={color} maxScale={1.2} style={styles.shadow}>{callKo(v.call)}</T>
          <T size={14} weight="700" color={TEXT_MUTED} style={styles.shadow}>{formatMargin(v.edgeMarginIn)}</T>
          {userCall ? (
            <T size={16} weight="900" color={correct ? OK : BAD} style={styles.shadow}>
              {userCall === 'timeout' ? '⏱ 시간 초과' : `${correct ? '✓ 정답' : '✕ 오답'} · 내 판정 ${callKo(userCall)}`}
            </T>
          ) : null}
        </Animated.View>
      ) : null}
      {simulatedBadge ? (
        <View style={styles.badge} pointerEvents="none">
          <T size={11} weight="800" color={TEXT_MUTED}>시뮬레이션 투구</T>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  stamp: { position: 'absolute', top: 14, left: 0, right: 0, alignItems: 'center', gap: 2 },
  badge: { position: 'absolute', bottom: 10, right: 12, backgroundColor: '#0B0F14CC', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  shadow: { textShadowColor: '#000000CC', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
});
