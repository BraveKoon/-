import { describe, expect, it } from 'vitest';
import { buildDailyControversies, buildQuickRound } from '../src/core/pitchGen';
import { verticalFov, breakInches, pitchKinematics, positionAt, sampleFlight3D, zoneBox, RELEASE_DIST_FT } from '../src/core/trajectory3d';
import { judge, zoneFor } from '../src/core/zone';

const pitches = [...Array.from({ length: 40 }, (_, i) => buildQuickRound('t3d' + i)).flat(), ...buildDailyControversies('2027-03-27')];

describe('3D 궤적', () => {
  it('공은 판정 좌표(plateX, plateZ)에 정확히 도착한다 → 3D 연출이 정답을 바꾸지 않음', () => {
    for (const p of pitches) {
      const k = pitchKinematics(p);
      const end = positionAt(k, k.T);
      expect(end.x * 12).toBeCloseTo(p.plateX, 9);
      expect(end.y * 12).toBeCloseTo(p.plateZ, 9);
      expect(end.z).toBeCloseTo(0, 9);
      // 도착점으로 다시 판정해도 같은 결과
      expect(judge({ plateX: end.x * 12, plateZ: end.y * 12, batterHeightCm: p.batterHeightCm }).call).toBe(judge(p).call);
    }
  });
  it('릴리스 지점에서 출발하고, 투수→포수 방향으로만 움직인다', () => {
    for (const p of pitches.slice(0, 30)) {
      const path = sampleFlight3D(p, 30);
      expect(path[0].z).toBeCloseTo(-RELEASE_DIST_FT, 9);
      for (let i = 1; i < path.length; i++) expect(path[i].z).toBeGreaterThan(path[i - 1].z);
    }
  });
  it('비행 시간은 실제 리그 수준(직구 ~0.4초, 느린 커브 ~0.6초)', () => {
    for (const p of pitches) {
      const { T } = pitchKinematics(p);
      expect(T).toBeGreaterThan(0.39);
      expect(T).toBeLessThan(0.62);
    }
  });
  it('공은 비행 중 지면 아래로 내려가지 않는다', () => {
    for (const p of pitches) for (const q of sampleFlight3D(p, 40)) expect(q.y).toBeGreaterThan(0);
  });
  it('구종별 변화: 커브는 직구보다 더 떨어진다(수직 무브먼트)', () => {
    const base = buildQuickRound('t3d0')[0];
    const fb = breakInches({ ...base, pitchType: 'fastball' });
    const cv = breakInches({ ...base, pitchType: 'curve' });
    expect(cv.y).toBeLessThan(fb.y);
  });
  it('3D 존 박스 = 2D 존 + 플레이트 깊이 17in', () => {
    const b = zoneBox(180);
    const z = zoneFor(180);
    expect(b.x1 - b.x0).toBeCloseTo(17 / 12);
    expect(b.y0 * 12).toBeCloseTo(z.bottom);
    expect(b.y1 * 12).toBeCloseTo(z.top);
    expect(b.z1 - b.z0).toBeCloseTo(17 / 12);
  });
});

describe('카메라', () => {
  it('세로 화면일수록 세로 시야각이 커져 같은 가로 구도를 유지한다', () => {
    expect(verticalFov(30, 1)).toBeCloseTo(30, 6);
    expect(verticalFov(30, 0.5)).toBeGreaterThan(verticalFov(30, 1));
    expect(verticalFov(30, 0.01)).toBe(70);
  });
});
