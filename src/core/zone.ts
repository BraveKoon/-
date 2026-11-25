import type { Pitch, Verdict, ZoneRect } from './types';

/**
 * ABS 존 모델 (가정 A1: 아래 상수는 KBO ABS 공개 규정에 맞춰 출시 전 재확인 필요)
 *  - 가로: 홈플레이트 폭 17inch
 *  - 세로: 타자 신장의 27.64% ~ 56.35%
 *  - 공 반지름 1.45inch: 공의 일부라도 존에 닿으면 스트라이크
 *  - 2D(플레이트 앞면) 근사. 실제 ABS의 3D 통과 판정과의 차이는 경계선 ±0.1inch 내외로 가정(A2).
 */
export const PLATE_HALF_WIDTH_IN = 8.5;
export const BALL_RADIUS_IN = 1.45;
export const ZONE_BOTTOM_RATIO = 0.2764;
export const ZONE_TOP_RATIO = 0.5635;
export const BORDERLINE_IN = 0.75;

export function zoneFor(batterHeightCm: number): ZoneRect {
  const h = batterHeightCm / 2.54;
  return {
    left: -PLATE_HALF_WIDTH_IN,
    right: PLATE_HALF_WIDTH_IN,
    bottom: ZONE_BOTTOM_RATIO * h,
    top: ZONE_TOP_RATIO * h,
  };
}

/** 점~직사각형 부호 거리. 밖 > 0, 안 < 0 (가장 가까운 경계까지). */
export function signedDistanceToRect(x: number, z: number, r: ZoneRect): number {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dz = Math.max(r.bottom - z, 0, z - r.top);
  if (dx > 0 || dz > 0) return Math.hypot(dx, dz);
  return -Math.min(x - r.left, r.right - x, z - r.bottom, r.top - z);
}

export function nearestPointOnRect(x: number, z: number, r: ZoneRect): { x: number; z: number } {
  const inside = x >= r.left && x <= r.right && z >= r.bottom && z <= r.top;
  if (!inside) {
    return { x: Math.min(Math.max(x, r.left), r.right), z: Math.min(Math.max(z, r.bottom), r.top) };
  }
  const d = [x - r.left, r.right - x, z - r.bottom, r.top - z];
  const m = Math.min(...d);
  if (m === d[0]) return { x: r.left, z };
  if (m === d[1]) return { x: r.right, z };
  if (m === d[2]) return { x, z: r.bottom };
  return { x, z: r.top };
}

export function judge(p: Pick<Pitch, 'plateX' | 'plateZ' | 'batterHeightCm'>): Verdict {
  const zone = zoneFor(p.batterHeightCm);
  const edgeMarginIn = signedDistanceToRect(p.plateX, p.plateZ, zone) - BALL_RADIUS_IN;
  return {
    call: edgeMarginIn <= 0 ? 'strike' : 'ball',
    edgeMarginIn,
    borderline: Math.abs(edgeMarginIn) <= BORDERLINE_IN,
    zone,
  };
}

/**
 * 결과 문구. edgeMarginIn 정의: 공 가장자리~존 경계 거리(양수=볼의 여유, 음수=스트라이크의 깊이).
 *  - 볼: "존 바깥 X"           (공 가장자리와 존 사이 간격)
 *  - 걸친 스트라이크(공 중심이 존 밖/경계 근처): "경계선에 X 걸침" (겹친 길이)
 *  - 깊은 스트라이크(공 중심이 존 안): "존 안쪽 X" (공 중심~경계 거리)
 */
export function formatMargin(edgeMarginIn: number): string {
  const f = (inch: number) => `${inch.toFixed(1)}in(${(inch * 2.54).toFixed(1)}cm)`;
  if (edgeMarginIn > 0) return `존 바깥 ${f(edgeMarginIn)}`;
  const centerDepth = -edgeMarginIn - BALL_RADIUS_IN;
  if (centerDepth <= 0) return `경계선에 ${f(-edgeMarginIn)} 걸침`;
  return `존 안쪽 ${f(centerDepth)}`;
}

/** 스크린리더용 위치 설명. 정답(존 안/밖)은 말하지 않고 플레이트 중심 기준 수치만 준다(시각 사용자와 동일한 정보량). */
export function describePosition(p: Pick<Pitch, 'plateX' | 'plateZ' | 'batterHeightCm'>): string {
  const side = p.plateX < 0 ? '왼쪽' : '오른쪽';
  return `홈플레이트 중심에서 ${side} ${Math.abs(p.plateX).toFixed(1)}인치, 지면에서 높이 ${p.plateZ.toFixed(1)}인치, 타자 신장 ${p.batterHeightCm}센티미터`;
}
