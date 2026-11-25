import { createRng, type Rng } from './prng';
import { BALL_RADIUS_IN, judge, zoneFor } from './zone';
import type { Call, Pitch, PitchType } from './types';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'controversial';

/** |edgeMarginIn| 범위(inch). */
export const DIFFICULTY_BAND: Record<Difficulty, [number, number]> = {
  easy: [3.5, 10],
  medium: [1.5, 3.5],
  hard: [0.5, 1.5],
  controversial: [0.02, 0.75],
};

const SPEED: Record<PitchType, [number, number]> = {
  fastball: [141, 154],
  slider: [126, 138],
  curve: [111, 124],
  changeup: [125, 134],
  forkball: [127, 137],
};
/** 비행 중간 휨(연출용). [x(우타 기준 +바깥), z]. */
const BOW: Record<PitchType, [number, number]> = {
  fastball: [1.5, 2.5],
  slider: [-9, -3],
  curve: [-4, -13],
  changeup: [3, -5],
  forkball: [0.5, -9],
};
const PITCH_TYPES: PitchType[] = ['fastball', 'fastball', 'slider', 'curve', 'changeup', 'forkball'];

const SITUATIONS = [
  '9회말 2사 만루 풀카운트',
  '7회초 1사 2루 2-2',
  '연장 10회 2사 3루 풀카운트',
  '5회말 무사 1루 3-2',
  '8회초 2사 1·3루 1-2',
  '3회말 2사 2루 2-2',
  '6회초 1사 만루 3-2',
];

export function generatePitch(
  rng: Rng,
  id: string,
  difficulty: Difficulty,
  wantCall?: Call,
  label?: string,
): Pitch {
  const [lo, hi] = DIFFICULTY_BAND[difficulty];
  const pitchType = rng.pick(PITCH_TYPES);
  const batterHeightCm = Math.round(rng.range(170, 190));
  const zone = zoneFor(batterHeightCm);
  const zMid = (zone.bottom + zone.top) / 2;

  let plateX = 0;
  let plateZ = zMid;
  let found = false;
  for (let i = 0; i < 800 && !found; i++) {
    const x = rng.normal(0, 8);
    const z = rng.normal(zMid, 9);
    const v = judge({ plateX: x, plateZ: z, batterHeightCm });
    const a = Math.abs(v.edgeMarginIn);
    if (a < lo || a > hi) continue;
    if (wantCall && v.call !== wantCall) continue;
    plateX = x;
    plateZ = z;
    found = true;
  }
  if (!found) {
    // 보장 경로: 우측 경계 바깥/안쪽에 정확히 배치
    const m = (lo + hi) / 2;
    const strike = wantCall !== 'ball';
    plateX = zone.right + BALL_RADIUS_IN + (strike ? -m : m);
    plateZ = zMid;
  }

  const [sLo, sHi] = SPEED[pitchType];
  const side = rng.next() < 0.5 ? -1 : 1;
  const [bx, bz] = BOW[pitchType];
  return {
    id,
    source: 'simulated',
    pitchType,
    speedKph: Math.round(rng.range(sLo, sHi)),
    batterHeightCm,
    plateX: round2(plateX),
    plateZ: round2(plateZ),
    releaseX: round2(side * rng.range(6, 24)),
    releaseZ: round2(rng.range(64, 76)),
    bowX: round2(bx * side),
    bowZ: bz,
    label,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 한 판 = 5구. 난이도 램프 + 스트라이크/볼 균형. 한 판 30초(구당 최대 4초). */
export const ROUND_SIZE = 5;
export const ROUND_DIFFICULTY: Difficulty[] = ['easy', 'easy', 'medium', 'hard', 'hard'];

export function buildQuickRound(seed: string): Pitch[] {
  const rng = createRng(`round:${seed}`);
  const calls = rng.shuffle<Call>([
    'strike',
    'strike',
    'ball',
    'ball',
    rng.next() < 0.5 ? 'strike' : 'ball',
  ]);
  return ROUND_DIFFICULTY.map((d, i) => generatePitch(rng, `sim-${seed}-${i}`, d, calls[i]));
}

/** 오늘의 논란 판정: 날짜(KST)만으로 결정 → 모든 사용자가 같은 투구를 본다. */
export function buildDailyControversies(dayKey: string, count = 3): Pitch[] {
  const rng = createRng(`daily:${dayKey}`);
  const calls = rng.shuffle<Call>(['strike', 'ball', rng.next() < 0.5 ? 'strike' : 'ball']);
  const situations = rng.shuffle(SITUATIONS);
  return Array.from({ length: count }, (_, i) =>
    generatePitch(rng, `sim-${dayKey}-c${i + 1}`, 'controversial', calls[i % calls.length], situations[i]),
  );
}

/** 비행 경로 샘플(연출). t=0 릴리스 → t=1 플레이트. scale은 원근(공 크기 배율). */
export function samplePath(p: Pitch, n = 24): { t: number; x: number; z: number; scale: number }[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const e = t; // 선형 시간. 가속감은 scale 곡선으로 표현
    const arc = Math.sin(Math.PI * t);
    return {
      t,
      x: p.releaseX + (p.plateX - p.releaseX) * e + p.bowX * arc,
      z: p.releaseZ + (p.plateZ - p.releaseZ) * e + p.bowZ * arc,
      scale: 0.16 + 0.84 * Math.pow(t, 1.7),
    };
  });
}
