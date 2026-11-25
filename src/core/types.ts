/** 공통 타입. 좌표계: 포수 시점, 단위 inch. x=0은 홈플레이트 중앙(+x는 포수 기준 오른쪽), z는 지면 기준 높이. */
export type Call = 'strike' | 'ball';
export type PitchType = 'fastball' | 'slider' | 'curve' | 'changeup' | 'forkball';

export const PITCH_TYPE_LABEL: Record<PitchType, string> = {
  fastball: '직구',
  slider: '슬라이더',
  curve: '커브',
  changeup: '체인지업',
  forkball: '포크볼',
};

export interface Pitch {
  id: string;
  /** 'simulated' = 시뮬레이션 궤적(기본). 'licensed' = 라이선스 계약된 추적 데이터(출시 후). */
  source: 'simulated' | 'licensed';
  pitchType: PitchType;
  speedKph: number;
  batterHeightCm: number;
  /** 플레이트 앞면 통과 위치(공 중심) */
  plateX: number;
  plateZ: number;
  /** 릴리스 지점(연출용) */
  releaseX: number;
  releaseZ: number;
  /** 비행 중간 지점의 직선 대비 휨(연출용, inch) */
  bowX: number;
  bowZ: number;
  /** 상황 라벨 (예: "9회말 2사 만루 풀카운트"). simulated일 땐 가상 상황임을 UI에서 표기 */
  label?: string;
}

export interface ZoneRect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export interface Verdict {
  call: Call;
  /** 공 가장자리~존 경계 거리(inch). 음수 = 공이 존에 걸침(스트라이크), 양수 = 존 밖(볼). */
  edgeMarginIn: number;
  borderline: boolean;
  zone: ZoneRect;
}

export interface AnswerRecord {
  id: string;
  roundId: string;
  mode: 'quick' | 'daily';
  pitchId: string;
  ts: number;
  userCall: Call | 'timeout';
  truth: Call;
  correct: boolean;
  rtMs: number;
  score: number;
  edgeMarginIn: number;
  plateX: number;
  plateZ: number;
  batterHeightCm: number;
}
