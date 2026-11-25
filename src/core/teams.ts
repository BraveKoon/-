import { contrast, ensureContrastOnDark, onColor } from './color';

/**
 * KBO 10개 구단. 컬러는 공개된 대표 색을 참고한 근사값(가정 A3) — 출시 전 구단 가이드/KBOP 라이선스 확인 후 교체.
 * 로고/엠블럼은 상표이므로 MVP에서는 사용하지 않고 이름 + 컬러만 사용한다.
 */
export interface TeamDef {
  id: string;
  name: string;
  short: string;
  brand: string;
}

export const TEAMS: TeamDef[] = [
  { id: 'kia', name: 'KIA 타이거즈', short: 'KIA', brand: '#EA0029' },
  { id: 'samsung', name: '삼성 라이온즈', short: '삼성', brand: '#074CA1' },
  { id: 'lg', name: 'LG 트윈스', short: 'LG', brand: '#C30452' },
  { id: 'doosan', name: '두산 베어스', short: '두산', brand: '#131230' },
  { id: 'kt', name: 'kt wiz', short: 'kt', brand: '#D71920' },
  { id: 'ssg', name: 'SSG 랜더스', short: 'SSG', brand: '#CE0E2D' },
  { id: 'lotte', name: '롯데 자이언츠', short: '롯데', brand: '#041E42' },
  { id: 'hanwha', name: '한화 이글스', short: '한화', brand: '#FC4E00' },
  { id: 'nc', name: 'NC 다이노스', short: 'NC', brand: '#315288' },
  { id: 'kiwoom', name: '키움 히어로즈', short: '키움', brand: '#570514' },
];

export const NEUTRAL_BRAND = '#F2B705'; // 전광판 앰버: 구단 선택 전 기본색

export const BG = '#0B0F14';
export const SURFACE = '#141B24';
export const SURFACE_2 = '#1C2530';
export const TEXT = '#F4F6F8';
export const TEXT_MUTED = '#A9B4C0';
export const OK = '#3DDC84';
export const BAD = '#FF6B6B';

export interface TeamTheme {
  id: string | null;
  name: string;
  short: string;
  brand: string;
  /** 다크 배경(BG·SURFACE 모두)에서 글자/선으로 쓰는 색. 대비 4.5:1 이상 */
  accent: string;
  /** accent 채움 위의 글자색 (대비 4.5:1 이상) */
  onAccent: string;
}

export function themeFor(brand: string, base: Pick<TeamDef, 'id' | 'name' | 'short'> | null): TeamTheme {
  // BG와 SURFACE_2 중 더 어두운 쪽이 아닌, 밝은 쪽 기준으로 보정해 두 배경 모두 통과시킨다.
  let accent = ensureContrastOnDark(brand, SURFACE_2, 4.5);
  if (contrast(accent, BG) < 4.5) accent = ensureContrastOnDark(accent, BG, 4.5);
  return {
    id: base?.id ?? null,
    name: base?.name ?? '스트존',
    short: base?.short ?? '스트존',
    brand,
    accent,
    onAccent: onColor(accent),
  };
}

export const NEUTRAL_THEME: TeamTheme = themeFor(NEUTRAL_BRAND, null);

const cache = new Map<string, TeamTheme>();
export function teamTheme(teamId: string | null | undefined): TeamTheme {
  if (!teamId) return NEUTRAL_THEME;
  const hit = cache.get(teamId);
  if (hit) return hit;
  const t = TEAMS.find((x) => x.id === teamId);
  if (!t) return NEUTRAL_THEME;
  const th = themeFor(t.brand, t);
  cache.set(teamId, th);
  return th;
}

export const teamName = (id: string | null | undefined) => TEAMS.find((t) => t.id === id)?.name ?? '무소속';
export const teamShort = (id: string | null | undefined) => TEAMS.find((t) => t.id === id)?.short ?? '무소속';
