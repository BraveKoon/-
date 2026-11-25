/**
 * 이벤트 스키마 = KPI 정의의 근거 (docs/05-roadmap-kpi.md).
 *  D1/D7 재방문: app_open (일 단위 코호트)
 *  공유율: share_tap / round_complete(결과 화면 노출)   · 공유 완료율: share_complete / share_tap
 *  친구 초대율: invite_sent 한 사용자 / WAU
 */
export type EventName =
  | 'app_open'
  | 'first_round_start'
  | 'round_start'
  | 'round_complete'
  | 'controversy_vote'
  | 'team_select'
  | 'share_open'
  | 'share_tap'
  | 'share_complete'
  | 'invite_create'
  | 'invite_sent'
  | 'league_join'
  | 'push_optin'
  | 'push_open';

type Sink = (name: EventName, props: Record<string, string | number | boolean | null>) => void;
let sink: Sink = (name, props) => {
  if (__DEV__) console.debug('[analytics]', name, props);
};
export const setAnalyticsSink = (s: Sink) => (sink = s);
export const track = (name: EventName, props: Record<string, string | number | boolean | null> = {}) => sink(name, props);
