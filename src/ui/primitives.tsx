import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { BG, SURFACE, SURFACE_2, TEXT, TEXT_MUTED } from '../core/teams';
import { haptic } from '../services/haptics';
import { useTheme } from './theme';

/** 모션 시간 토큰 (요구: 150~300ms 마이크로 모션) */
export const MOTION = { fast: 150, base: 220, slow: 300 } as const;

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** 모션 줄이기 설정이면 0ms */
export function useDur() {
  const reduce = useReduceMotion();
  return (ms: number) => (reduce ? 0 : ms);
}

type TProps = {
  children?: ReactNode;
  size?: number;
  weight?: TextStyle['fontWeight'];
  color?: string;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** 큰 숫자용: 폰트 스케일 상한을 낮춰 레이아웃 붕괴 방지(AA 확대 대응은 상한 1.3 이상 유지) */
  maxScale?: number;
  accessibilityLabel?: string;
};
export function T({ children, size = 16, weight = '500', color = TEXT, center, style, numberOfLines, maxScale = 1.6, accessibilityLabel }: TProps) {
  return (
    <Text
      accessibilityLabel={accessibilityLabel}
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxScale}
      style={[{ fontSize: size, fontWeight: weight, color, fontVariant: ['tabular-nums'], textAlign: center ? 'center' : 'auto' }, style]}>
      {children}
    </Text>
  );
}
export const Muted = (p: TProps) => <T color={TEXT_MUTED} {...p} />;

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flex: 1, backgroundColor: BG }, style]}>{children}</View>;
}

export function Card({ children, style, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: boolean }) {
  const th = useTheme();
  return (
    <View style={[styles.card, accent && { borderColor: th.accent, borderWidth: 2 }, style]}>{children}</View>
  );
}

type BProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  big?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  fill?: string;
  onFill?: string;
  quiet?: boolean;
};
/** 터치 타깃 최소 56dp(권장 48dp 초과). 구단 accent 채움 + 대비 보장 글자색. */
export function Button({ label, onPress, variant = 'primary', big, disabled, accessibilityLabel, accessibilityHint, style, fill, onFill, quiet }: BProps) {
  const th = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const dur = useDur();
  const bg = variant === 'primary' ? (fill ?? th.accent) : variant === 'secondary' ? SURFACE_2 : 'transparent';
  const fg = variant === 'primary' ? (onFill ?? th.onAccent) : TEXT;
  const anim = (to: number) => Animated.timing(scale, { toValue: to, duration: dur(MOTION.fast), easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPressIn={() => anim(0.97)}
        onPressOut={() => anim(1)}
        onPress={() => {
          if (!quiet) haptic.press();
          onPress();
        }}
        style={[
          styles.btn,
          { backgroundColor: bg, minHeight: big ? 68 : 56, opacity: disabled ? 0.45 : 1 },
          variant === 'secondary' && { borderWidth: 1, borderColor: '#2C3846' },
        ]}>
        <T size={big ? 22 : 17} weight="900" color={fg} center>
          {label}
        </T>
      </Pressable>
    </Animated.View>
  );
}

export function Chip({ label, selected, onPress, a11y }: { label: string; selected?: boolean; onPress: () => void; a11y?: string }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={[styles.chip, selected && { backgroundColor: th.accent, borderColor: th.accent }]}>
      <T size={15} weight="800" color={selected ? th.onAccent : TEXT}>
        {label}
      </T>
    </Pressable>
  );
}

/** 큰 숫자 카운트업 (모션 줄이기면 즉시 표시) */
export function AnimatedNumber({ value, format, size = 96, color = TEXT, suffix, duration = MOTION.slow * 2 }: { value: number; format?: (n: number) => string; size?: number; color?: string; suffix?: string; duration?: number }) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return setShown(value);
    v.setValue(0);
    const id = v.addListener(({ value: x }) => setShown(x));
    Animated.timing(v, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [value, reduce, duration, v]);
  const text = format ? format(shown) : String(Math.round(shown));
  return (
    <T size={size} weight="900" color={color} maxScale={1.2} accessibilityLabel={`${format ? format(value) : value}${suffix ?? ''}`}>
      {text}
      {suffix ? <T size={size * 0.38} weight="900" color={color}>{suffix}</T> : null}
    </T>
  );
}

/** 전광판 느낌의 숫자 패널 */
export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const th = useTheme();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} ${value}`}>
      <Muted size={13} weight="700">{label}</Muted>
      <T size={30} weight="900" color={color ?? th.accent} maxScale={1.3}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: SURFACE, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: SURFACE_2 },
  btn: { borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  chip: { minHeight: 44, minWidth: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: '#2C3846', backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, backgroundColor: SURFACE, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: SURFACE_2, gap: 2 },
});
