import type { Pitch, PitchType } from './types';
import { zoneFor } from './zone';

/**
 * 3D 투구 궤적 (단위: ft, s). 월드 좌표계 = three.js 씬 좌표계.
 *   x: 포수 기준 오른쪽 + (= plateX/12)   y: 지면 위 높이 (= plateZ/12)
 *   z: 홈플레이트 앞면(투수 쪽 모서리) = 0, 투수 쪽이 −, 포수 쪽이 +
 * 운동 모델: 등가속도 p(t) = p0 + v0·t + ½·a·t²  (a = 중력 + 구종별 변화 가속도)
 * 정답 보존: 비행시간 T와 가속도 a를 정한 뒤 v0를 역산 → p(T)가 (plateX, plateZ, 0)과 정확히 일치.
 * 즉 3D 연출은 판정 데이터(zone.ts)를 절대 바꾸지 않는다.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Kinematics {
  p0: Vec3;
  v0: Vec3;
  a: Vec3;
  /** 실제 비행 시간(s) */
  T: number;
}

export const G_FT = 32.174;
export const RELEASE_DIST_FT = 54; // 투수판 60.5ft − 익스텐션 약 6.5ft
export const PLATE_DEPTH_FT = 17 / 12;
export const BALL_RADIUS_FT = 1.45 / 12;
export const MOUND_Z = -60.5;

/** 구종별 변화 가속도(ft/s², 중력 제외). x는 손 방향(side)으로 뒤집는다. 대략적인 리그 평균 수준의 연출값(가정 A13). */
const BREAK: Record<PitchType, [number, number]> = {
  fastball: [7, 15], // 수직 무브먼트(덜 떨어짐)
  slider: [-9, 2],
  curve: [-5, -10],
  changeup: [10, 6],
  forkball: [3, 1],
};

const KPH_TO_FTPS = 0.911344;

export function pitchKinematics(p: Pitch): Kinematics {
  const side = p.releaseX >= 0 ? 1 : -1;
  const [bx, by] = BREAK[p.pitchType];
  const a: Vec3 = { x: bx * side, y: -G_FT + by, z: 0 };
  const p0: Vec3 = { x: p.releaseX / 12, y: p.releaseZ / 12, z: -RELEASE_DIST_FT };
  const p1: Vec3 = { x: p.plateX / 12, y: p.plateZ / 12, z: 0 };
  // 평균 속도는 릴리스 속도의 약 92%(공기 저항 감속)로 근사
  const T = RELEASE_DIST_FT / (p.speedKph * KPH_TO_FTPS * 0.92);
  const v0: Vec3 = {
    x: (p1.x - p0.x - 0.5 * a.x * T * T) / T,
    y: (p1.y - p0.y - 0.5 * a.y * T * T) / T,
    z: (p1.z - p0.z - 0.5 * a.z * T * T) / T,
  };
  return { p0, v0, a, T };
}

export function positionAt(k: Kinematics, t: number): Vec3 {
  return {
    x: k.p0.x + k.v0.x * t + 0.5 * k.a.x * t * t,
    y: k.p0.y + k.v0.y * t + 0.5 * k.a.y * t * t,
    z: k.p0.z + k.v0.z * t + 0.5 * k.a.z * t * t,
  };
}

/** 플레이트 앞면까지의 경로 샘플(n+1개, 균등 시간 간격) */
export function sampleFlight3D(p: Pitch, n = 40): Vec3[] {
  const k = pitchKinematics(p);
  return Array.from({ length: n + 1 }, (_, i) => positionAt(k, (k.T * i) / n));
}

/** 같은 직선 대비 최대 변화량(inch) — 결과 화면 설명용("휘어진 정도") */
export function breakInches(p: Pitch): { x: number; y: number } {
  const k = pitchKinematics(p);
  // 가속도 a에 의한 변위는 중간에서 최대 ⅛·a·T²
  return { x: (k.a.x * k.T * k.T * 12) / 8, y: ((k.a.y + G_FT) * k.T * k.T * 12) / 8 };
}

/** ABS 존을 홈플레이트 위 3D 박스로(앞면 z=0 ~ 뒤 꼭짓점 z=+17in). 판정은 앞면 기준(가정 A2). */
export function zoneBox(batterHeightCm: number) {
  const z = zoneFor(batterHeightCm);
  return {
    x0: z.left / 12,
    x1: z.right / 12,
    y0: z.bottom / 12,
    y1: z.top / 12,
    z0: 0,
    z1: PLATE_DEPTH_FT,
  };
}

/**
 * 카메라 프리셋: 판정은 주심 시점(홈플레이트·타자·마운드가 모두 보이게 약간 뒤/위), 공개는 1루 쪽 사선 리플레이 시점(우타자에 가리지 않게).
 * 세로 화면에서도 같은 구도가 나오도록 '수평 시야각(hfov)'으로 정의하고, 세로 시야각은 화면 비율로 계산한다.
 */
export const CAMERA = {
  umpire: { pos: { x: 0, y: 5.0, z: 10.5 }, look: { x: 0, y: 2.15, z: -2 }, hfov: 27 },
  reveal: { pos: { x: 7.4, y: 4.3, z: 6.6 }, look: { x: 0, y: 2.4, z: -0.3 }, hfov: 30 },
} as const;

/** 수평 시야각(도) + 화면 비율(w/h) → three.js PerspectiveCamera.fov(세로, 도). 최대 70도. */
export function verticalFov(hfovDeg: number, aspect: number): number {
  const h = (hfovDeg * Math.PI) / 180;
  const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(aspect, 0.1));
  return Math.min(70, (v * 180) / Math.PI);
}
