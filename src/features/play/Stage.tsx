import { Component, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useStore } from '../../state/store';
import { PitchStage } from './PitchStage';
import { PitchStage3D } from './PitchStage3D';
import type { StageProps } from './StageOverlay';

/** 웹: WebGL 미지원 브라우저면 2D. 네이티브: expo-gl 사용(실패 시 아래 경계가 2D로 전환). */
function webglAvailable(): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return true;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
const HAS_GL = webglAvailable();

class GLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    if (__DEV__) console.warn('[Stage] 3D 렌더 실패 → 2D로 전환', e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 판정 스테이지 진입점: 설정(3D 연출)과 기기 지원 여부에 따라 3D/2D 선택. 두 구현은 같은 props·같은 판정 데이터를 쓴다. */
export function Stage(props: StageProps) {
  const use3d = useStore((s) => s.settings.render3d);
  if (!use3d || !HAS_GL) return <PitchStage {...props} />;
  return (
    <GLBoundary fallback={<PitchStage {...props} />}>
      <PitchStage3D {...props} />
    </GLBoundary>
  );
}
