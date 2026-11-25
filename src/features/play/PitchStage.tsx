import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Rect, Circle } from 'react-native-svg';
import { samplePath } from '../../core/pitchGen';
import { BAD, OK, SURFACE } from '../../core/teams';
import { judge, nearestPointOnRect } from '../../core/zone';
import { MOTION, useDur } from '../../ui/primitives';
import { StageOverlay, stageLabel, type StageProps } from './StageOverlay';
export type { StageProps };
import { useTheme } from '../../ui/theme';

const X_SPAN = 56; // ±28in
const Z_LO = 2;
const Z_HI = 80;
const BALL_D_IN = 2.9;


/**
 * 포수 시점 스테이지. 판정 단계에서는 존을 숨기고(타자 실루엣 + 홈플레이트만) 공의 정지 위치로 판단하게 한다.
 * 공개 단계: 존이 220ms 페이드인 → 공→경계선 거리선 → 판정 도장(250ms).
 */
export function PitchStage({ pitch, mode, userCall, flightKey, skipFlight, onFlightEnd, showVerdict, simulatedBadge }: StageProps) {
  const th = useTheme();
  const dur = useDur();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const t = useRef(new Animated.Value(0)).current;
  const zoneOpacity = useRef(new Animated.Value(0)).current;
  const verdict = useMemo(() => judge(pitch), [pitch]);
  const verdictColor = verdict.call === 'strike' ? OK : BAD;

  const geo = useMemo(() => {
    if (!box) return null;
    const s = Math.min(box.w / X_SPAN, box.h / (Z_HI - Z_LO));
    const y0 = (box.h - (Z_HI - Z_LO) * s) / 2;
    return { s, mx: (x: number) => box.w / 2 + x * s, mz: (z: number) => y0 + (Z_HI - z) * s };
  }, [box]);

  // 비행
  useEffect(() => {
    if (!geo) return;
    const done = () => onFlightEnd?.();
    if (skipFlight) {
      t.setValue(1);
      done();
      return;
    }
    t.setValue(0);
    const a = Animated.timing(t, { toValue: 1, duration: dur(950), easing: Easing.in(Easing.quad), useNativeDriver: true });
    a.start(({ finished }) => finished && done());
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightKey, geo, pitch.id]);

  // 공개 연출: 존 페이드인(도장은 StageOverlay가 220ms 뒤에)
  useEffect(() => {
    zoneOpacity.setValue(0);
    if (mode === 'reveal') Animated.timing(zoneOpacity, { toValue: 1, duration: dur(MOTION.base), useNativeDriver: true }).start();
  }, [mode, pitch.id, zoneOpacity, dur]);

  const ball = useMemo(() => {
    if (!geo) return null;
    const path = samplePath(pitch, 24);
    const d = BALL_D_IN * geo.s;
    const input = path.map((p) => p.t);
    return {
      d,
      tx: t.interpolate({ inputRange: input, outputRange: path.map((p) => geo.mx(p.x) - d / 2) }),
      ty: t.interpolate({ inputRange: input, outputRange: path.map((p) => geo.mz(p.z) - d / 2) }),
      sc: t.interpolate({ inputRange: input, outputRange: path.map((p) => p.scale) }),
    };
  }, [geo, pitch, t]);

  const label = stageLabel(pitch, mode, userCall);

  return (
    <View style={styles.wrap} onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} accessible accessibilityLabel={label} accessibilityLiveRegion="polite">
      {geo && box && ball ? (
        <>
          <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill}>
            <Rect x={0} y={0} width={box.w} height={box.h} fill={SURFACE} rx={24} />
            {/* 타자 실루엣: 신장 단서(존 높이 추정용) */}
            <Circle cx={geo.mx(-21)} cy={geo.mz(pitch.batterHeightCm / 2.54 - 3.5)} r={3.2 * geo.s} fill="#243040" />
            <Rect x={geo.mx(-25.5)} y={geo.mz(pitch.batterHeightCm / 2.54 * 0.84)} width={9 * geo.s} height={(pitch.batterHeightCm / 2.54) * 0.68 * geo.s} rx={4 * geo.s} fill="#1E2A38" />
            {/* 홈플레이트 */}
            <Path
              d={`M ${geo.mx(-8.5)} ${geo.mz(Z_LO + 2)} L ${geo.mx(8.5)} ${geo.mz(Z_LO + 2)} L ${geo.mx(8.5)} ${geo.mz(Z_LO)} L ${geo.mx(0)} ${geo.mz(Z_LO) + 10} L ${geo.mx(-8.5)} ${geo.mz(Z_LO)} Z`}
              fill="#FFFFFF"
              fillOpacity={0.2}
            />
          </Svg>

          {/* 존 공개 레이어 */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: zoneOpacity }]}>
            <Svg width={box.w} height={box.h}>
              {mode === 'reveal' && (() => {
                const z = verdict.zone;
                const zx = geo.mx(z.left);
                const zy = geo.mz(z.top);
                const zw = (z.right - z.left) * geo.s;
                const zh = (z.top - z.bottom) * geo.s;
                const np = nearestPointOnRect(pitch.plateX, pitch.plateZ, z);
                return (
                  <>
                    <Rect x={zx} y={zy} width={zw} height={zh} fill={th.accent} fillOpacity={0.1} stroke={th.accent} strokeWidth={3} />
                    {[1, 2].map((i) => (
                      <Line key={`v${i}`} x1={zx + (zw * i) / 3} y1={zy} x2={zx + (zw * i) / 3} y2={zy + zh} stroke={th.accent} strokeOpacity={0.3} strokeWidth={1} />
                    ))}
                    {[1, 2].map((i) => (
                      <Line key={`h${i}`} x1={zx} y1={zy + (zh * i) / 3} x2={zx + zw} y2={zy + (zh * i) / 3} stroke={th.accent} strokeOpacity={0.3} strokeWidth={1} />
                    ))}
                    <Line x1={geo.mx(pitch.plateX)} y1={geo.mz(pitch.plateZ)} x2={geo.mx(np.x)} y2={geo.mz(np.z)} stroke={verdictColor} strokeWidth={2.5} strokeDasharray="6 5" />
                    <Circle cx={geo.mx(np.x)} cy={geo.mz(np.z)} r={3.5} fill={verdictColor} />
                  </>
                );
              })()}
            </Svg>
          </Animated.View>

          {/* 공 */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: ball.d,
              height: ball.d,
              borderRadius: ball.d / 2,
              backgroundColor: '#F4F6F8',
              borderWidth: mode === 'reveal' ? 3 : 0,
              borderColor: verdictColor,
              transform: [{ translateX: ball.tx }, { translateY: ball.ty }, { scale: ball.sc }],
            }}
          />

          <StageOverlay pitch={pitch} mode={mode} userCall={userCall} showVerdict={showVerdict} simulatedBadge={simulatedBadge} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 24, overflow: 'hidden', minHeight: 260 },
});
