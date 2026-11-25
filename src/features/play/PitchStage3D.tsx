import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';
import { BAD, OK } from '../../core/teams';
import { BALL_RADIUS_FT, CAMERA, MOUND_Z, pitchKinematics, positionAt, sampleFlight3D, verticalFov, zoneBox } from '../../core/trajectory3d';
import { judge, nearestPointOnRect } from '../../core/zone';
import { useReduceMotion } from '../../ui/primitives';
import { useTheme } from '../../ui/theme';
import { StageOverlay, stageLabel, type StageProps } from './StageOverlay';

/** 화면상 비행 시간. 실제 비행(약 0.4~0.6초)을 약 2배 슬로모로 보여준다. */
const FLIGHT_MS = 1000;
const ZONE_FADE_MS = 220;
const SKY = '#04070C';

const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);

/**
 * 3D 판정 스테이지 (three.js / react-three-fiber — 웹은 WebGL, iOS/Android는 expo-gl).
 *  - 판정 단계: 주심 시점 고정, 존 숨김. 공이 마운드에서 물리 궤적(중력+구종 변화)으로 날아와 플레이트 앞면에서 멈춘다.
 *  - 공개 단계: 존이 3D 박스로 220ms 페이드인, 카메라가 1루 쪽 사선으로 이동(리플레이 시점), 궤적이 판정 색 튜브로.
 *  - 모션 줄이기: 비행/카메라 이동 없이 즉시 표시.
 */
export function PitchStage3D(props: StageProps) {
  const th = useTheme();
  const reduce = useReduceMotion();
  const { pitch, mode, userCall, showVerdict, simulatedBadge } = props;
  return (
    <View style={styles.wrap} accessible accessibilityLabel={stageLabel(pitch, mode, userCall)} accessibilityLiveRegion="polite">
      <Canvas
        style={StyleSheet.absoluteFill}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ fov: 44, near: 0.05, far: 900, position: [CAMERA.umpire.pos.x, CAMERA.umpire.pos.y, CAMERA.umpire.pos.z] }}>
        <color attach="background" args={[SKY]} />
        <fog attach="fog" args={[SKY, 160, 700]} />
        <hemisphereLight args={['#B9CCE4', '#21160C', 0.75]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[18, 60, 28]} intensity={2.1} />
        <directionalLight position={[-30, 40, -60]} intensity={0.6} color="#9FB7FF" />
        <Ballpark accent={th.accent} />
        <Batter heightCm={pitch.batterHeightCm} />
        <PitchScene {...props} accent={th.accent} reduce={reduce} />
      </Canvas>
      <StageOverlay pitch={pitch} mode={mode} userCall={userCall} showVerdict={showVerdict} simulatedBadge={simulatedBadge} delayMs={reduce ? 0 : 520} />
    </View>
  );
}

/** 구장: 잔디, 홈 흙 원, 마운드+투수판, 홈플레이트, 타석, 파울라인, 외야 벽 + 구단 컬러 리본 전광판 */
function Ballpark({ accent }: { accent: string }) {
  const plate = useMemo(() => {
    const s = new THREE.Shape();
    const i = 1 / 12;
    // shape y → world −z (아래 rotation). 앞면(z=0) → 뒤 꼭짓점(z=+17in)
    s.moveTo(-8.5 * i, 0);
    s.lineTo(8.5 * i, 0);
    s.lineTo(8.5 * i, -8.5 * i);
    s.lineTo(0, -17 * i);
    s.lineTo(-8.5 * i, -8.5 * i);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  const boxes = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    const rect = (x0: number, z0: number, x1: number, z1: number) => {
      const y = 0.012;
      const c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      for (let k = 0; k < 4; k++) {
        const a = c[k];
        const b = c[(k + 1) % 4];
        pts.push(a[0], y, a[1], b[0], y, b[1]);
      }
    };
    const inner = 14.5 / 12;
    rect(-inner - 4, -2.3, -inner, 3.7); // 타석(4ft×6ft)
    rect(inner, -2.3, inner + 4, 3.7);
    rect(-1.75, 3.7, 1.75, 11.7); // 포수석
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  const foul = useMemo(() => {
    // 파울라인: 홈플레이트 뒤 꼭짓점에서 1·3루 방향 45°, 1px 선(사선 시점에서 화면을 가로지르지 않게)
    const g = new THREE.BufferGeometry();
    const L = 330 / Math.SQRT2;
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.012, 17 / 12, -L, 0.012, -L, 0, 0.012, 17 / 12, L, 0.012, -L], 3));
    return g;
  }, []);
  useEffect(() => () => { plate.dispose(); boxes.dispose(); foul.dispose(); }, [plate, boxes, foul]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, -120]}>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color="#0D3A20" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0.7]}>
        <circleGeometry args={[13, 48]} />
        <meshStandardMaterial color="#5B3C22" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, MOUND_Z + 15]}>
        <planeGeometry args={[6, 50]} />
        <meshStandardMaterial color="#14472A" roughness={1} />
      </mesh>
      <mesh position={[0, 0.35, MOUND_Z]}>
        <cylinderGeometry args={[7, 9, 0.7, 40]} />
        <meshStandardMaterial color="#5B3C22" roughness={1} />
      </mesh>
      <mesh position={[0, 0.72, MOUND_Z]}>
        <boxGeometry args={[2, 0.06, 0.5]} />
        <meshStandardMaterial color="#F4F6F8" />
      </mesh>
      <mesh geometry={plate} rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}>
        <meshStandardMaterial color="#F4F6F8" roughness={0.6} />
      </mesh>
      <lineSegments geometry={boxes}>
        <lineBasicMaterial color="#E8ECEF" transparent opacity={0.8} />
      </lineSegments>
      <lineSegments geometry={foul}>
        <lineBasicMaterial color="#E8ECEF" transparent opacity={0.7} />
      </lineSegments>
      {/* 외야 벽 + 구단 컬러 리본 전광판 */}
      <mesh position={[0, 14, -390]}>
        <boxGeometry args={[1100, 28, 2]} />
        <meshStandardMaterial color="#0A1018" roughness={0.9} />
      </mesh>
      <mesh position={[0, 20, -388.9]}>
        <planeGeometry args={[1100, 3.2]} />
        <meshBasicMaterial color={accent} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

function Batter({ heightCm }: { heightCm: number }) {
  const H = heightCm / 30.48;
  const r = 0.62;
  return (
    <group position={[-2.55, 0, 0.8]}>
      <mesh position={[0, H * 0.46, 0]}>
        <capsuleGeometry args={[r, H * 0.62, 6, 16]} />
        <meshStandardMaterial color="#1B2533" roughness={0.8} />
      </mesh>
      <mesh position={[0, H - 0.42, 0]}>
        <sphereGeometry args={[0.42, 20, 16]} />
        <meshStandardMaterial color="#232F40" roughness={0.5} />
      </mesh>
      {/* 배트 */}
      <mesh position={[0.35, H * 0.78, -0.6]} rotation={[0.9, 0, -0.35]}>
        <cylinderGeometry args={[0.05, 0.1, 2.8, 10]} />
        <meshStandardMaterial color="#6E4B2A" roughness={0.6} />
      </mesh>
    </group>
  );
}

function PitchScene({ pitch, mode, flightKey, skipFlight, onFlightEnd, accent, reduce }: StageProps & { accent: string; reduce: boolean }) {
  const verdict = useMemo(() => judge(pitch), [pitch]);
  const verdictColor = verdict.call === 'strike' ? OK : BAD;
  const k = useMemo(() => pitchKinematics(pitch), [pitch]);
  const path = useMemo(() => sampleFlight3D(pitch, 60), [pitch]);

  const ball = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  const done = useRef(false);
  const endCb = useRef(onFlightEnd);
  endCb.current = onFlightEnd;
  const zoneT = useRef(0);
  const look = useRef(v3(CAMERA.umpire.look));

  // ── 궤적선 ──
  const trail = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(path.map(v3));
    const m = new THREE.LineBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.3 });
    const tubeG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path.map(v3)), 90, 0.035, 8, false);
    const tubeM = new THREE.MeshBasicMaterial({ color: verdictColor, transparent: true, opacity: 0, depthWrite: false });
    return { g, m, obj: new THREE.Line(g, m), tubeG, tubeM, tube: new THREE.Mesh(tubeG, tubeM) };
  }, [path, verdictColor]);

  // ── 존(3D 박스 + 앞면 + 3×3 격자) / 거리선 / 통과 지점 링 ──
  const zone = useMemo(() => {
    const b = zoneBox(pitch.batterHeightCm);
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const d = b.z1 - b.z0;
    const center = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    const boxGeom = new THREE.BoxGeometry(w, h, d);
    const edges = new THREE.EdgesGeometry(boxGeom);
    const grid: number[] = [];
    for (let i = 1; i <= 2; i++) {
      const x = b.x0 + (w * i) / 3;
      const y = b.y0 + (h * i) / 3;
      grid.push(x, b.y0, 0.002, x, b.y1, 0.002, b.x0, y, 0.002, b.x1, y, 0.002);
    }
    const gridGeom = new THREE.BufferGeometry();
    gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    const np = nearestPointOnRect(pitch.plateX, pitch.plateZ, verdict.zone);
    const marginGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(pitch.plateX / 12, pitch.plateZ / 12, 0.004),
      new THREE.Vector3(np.x / 12, np.z / 12, 0.004),
    ]);
    const mats = {
      fill: new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false }),
      front: new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      edge: new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0 }),
      grid: new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0 }),
      margin: new THREE.LineBasicMaterial({ color: verdictColor, transparent: true, opacity: 0 }),
      ring: new THREE.MeshBasicMaterial({ color: verdictColor, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    };
    const base = { fill: 0.1, front: 0.16, edge: 1, grid: 0.35, margin: 1, ring: 0.95 };
    return {
      center, w, h, boxGeom, edges, gridGeom, marginGeom, mats, base,
      edgeObj: new THREE.LineSegments(edges, mats.edge),
      gridObj: new THREE.LineSegments(gridGeom, mats.grid),
      marginObj: new THREE.Line(marginGeom, mats.margin),
      frontCenter: new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0.001),
    };
  }, [pitch, accent, verdict, verdictColor]);

  useEffect(
    () => () => {
      trail.g.dispose();
      trail.m.dispose();
      trail.tubeG.dispose();
      trail.tubeM.dispose();
      zone.boxGeom.dispose();
      zone.edges.dispose();
      zone.gridGeom.dispose();
      zone.marginGeom.dispose();
      Object.values(zone.mats).forEach((m) => m.dispose());
    },
    [trail, zone],
  );

  // 비행 재시작 / 건너뛰기
  useEffect(() => {
    start.current = null;
    done.current = false;
    if (skipFlight) {
      done.current = true;
      endCb.current?.();
    }
  }, [flightKey, pitch.id, skipFlight]);

  useFrame((state, dt) => {
    const now = state.clock.elapsedTime * 1000;
    let u = 1;
    if (!done.current) {
      if (start.current == null) start.current = now;
      u = reduce ? 1 : Math.min(1, (now - start.current) / FLIGHT_MS);
      if (u >= 1) {
        done.current = true;
        endCb.current?.();
      }
    }
    const p = positionAt(k, k.T * u);
    if (ball.current) {
      ball.current.position.set(p.x, p.y, p.z);
      if (u < 1) ball.current.rotation.x -= dt * 25;
    }
    if (glow.current) glow.current.visible = u < 1;

    // 궤적선: 비행 중엔 공 뒤로 그려지고, 공개 시 판정 색 전체 경로
    const reveal = mode === 'reveal';
    trail.g.setDrawRange(0, Math.max(2, Math.ceil(u * path.length)));
    trail.m.color.set(reveal ? verdictColor : '#FFFFFF');
    trail.m.opacity = reveal ? 0.9 : 0.28;

    // 존 페이드
    const target = reveal ? 1 : 0;
    zoneT.current = reduce ? target : approach(zoneT.current, target, (dt * 1000) / ZONE_FADE_MS);
    (Object.keys(zone.mats) as (keyof typeof zone.mats)[]).forEach((key) => {
      zone.mats[key].opacity = zone.base[key] * zoneT.current;
    });
    trail.tubeM.opacity = 0.85 * zoneT.current;
    trail.tube.visible = zoneT.current > 0.01;

    // 카메라: 판정=주심 시점, 공개=사선 리플레이 시점
    const preset = reveal && !reduce ? CAMERA.reveal : CAMERA.umpire;
    const kk = reduce ? 1 : 1 - Math.exp(-dt * 5.5);
    const cam = state.camera as THREE.PerspectiveCamera;
    cam.position.lerp(v3(preset.pos), kk);
    look.current.lerp(v3(preset.look), kk);
    cam.lookAt(look.current);
    const fov = verticalFov(preset.hfov, state.size.width / Math.max(1, state.size.height));
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * kk;
      cam.updateProjectionMatrix();
    }
  });

  const R = BALL_RADIUS_FT;
  return (
    <group>
      <primitive object={trail.obj} />
      <primitive object={trail.tube} />
      <group visible>
        <mesh position={zone.center}>
          <primitive object={zone.boxGeom} attach="geometry" />
          <primitive object={zone.mats.fill} attach="material" />
        </mesh>
        <primitive object={zone.edgeObj} position={zone.center} />
        <mesh position={zone.frontCenter}>
          <planeGeometry args={[zone.w, zone.h]} />
          <primitive object={zone.mats.front} attach="material" />
        </mesh>
        <primitive object={zone.gridObj} />
        <primitive object={zone.marginObj} />
        <mesh position={[pitch.plateX / 12, pitch.plateZ / 12, 0.003]}>
          <ringGeometry args={[R * 1.15, R * 1.55, 40]} />
          <primitive object={zone.mats.ring} attach="material" />
        </mesh>
      </group>
      <group ref={ball}>
        <mesh>
          <sphereGeometry args={[R, 28, 20]} />
          <meshStandardMaterial color="#F6F7F8" roughness={0.45} emissive="#FFFFFF" emissiveIntensity={0.18} />
        </mesh>
        {[0, Math.PI / 2].map((rot) => (
          <mesh key={rot} rotation={[rot, rot, 0.6]}>
            <torusGeometry args={[R * 0.98, R * 0.07, 6, 32]} />
            <meshBasicMaterial color="#C8102E" />
          </mesh>
        ))}
        <mesh ref={glow}>
          <sphereGeometry args={[R * 2.4, 16, 12]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function approach(cur: number, target: number, step: number) {
  return cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 24, overflow: 'hidden', minHeight: 260, backgroundColor: SKY },
});
