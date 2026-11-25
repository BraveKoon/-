import { useStore } from '../state/store';
import { teamTheme, type TeamTheme } from '../core/teams';
export * from '../core/teams';

/** 응원 구단 선택 즉시 앱 전체의 accent가 구단 컬러로 바뀐다(AA 보정 완료 값). */
export function useTheme(): TeamTheme {
  const teamId = useStore((s) => s.teamId);
  return teamTheme(teamId);
}
