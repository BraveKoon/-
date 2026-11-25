import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { kstWeekKey } from '../core/dates';
import { EMPTY_STREAK, recordPlay, type StreakState } from '../core/streak';
import type { AnswerRecord, Call, Pitch } from '../core/types';
import type { UserWeekRow } from '../core/ranking';

/** 가입 없이 시작: 로컬 익명 프로필. 서버 연동 시 anonId로 익명 계정을 만들고 이후 소셜 로그인으로 승격(docs/03). */
export interface RoundPitchResult {
  pitch: Pitch;
  userCall: Call | 'timeout';
  truth: Call;
  correct: boolean;
  rtMs: number;
  score: number;
  edgeMarginIn: number;
}
export interface RoundRecord {
  id: string;
  ts: number;
  mode: 'quick';
  results: RoundPitchResult[];
}
export interface LeagueRef {
  code: string;
  name: string;
  kind: 'friends' | 'team';
  mine: boolean;
}
export interface Settings {
  notify: boolean;
  haptics: boolean;
  /** 접근성: 판정 시간 제한 해제(속도 보너스 0, 정확도는 동일하게 집계) */
  relaxedTiming: boolean;
  notifyAsked: boolean;
  /** 3D 판정 연출(끄면 2D 간단 보기: 저사양 기기·멀미 민감 사용자용) */
  render3d: boolean;
}
export interface AppState {
  hydrated: boolean;
  anonId: string;
  nickname: string;
  teamId: string | null;
  createdAt: number;
  answers: AnswerRecord[];
  rounds: RoundRecord[];
  votes: Record<string, { call: Call; ts: number }>;
  streak: StreakState;
  leagues: LeagueRef[];
  settings: Settings;
}

const KEY = 'strzone:v1';
const MAX_ANSWERS = 600;
const MAX_ROUNDS = 60;

const rid = () => Math.random().toString(36).slice(2, 10);
const initial = (): AppState => ({
  hydrated: false,
  anonId: `anon-${rid()}${rid()}`,
  nickname: `팬${Math.floor(1000 + Math.random() * 9000)}`,
  teamId: null,
  createdAt: Date.now(),
  answers: [],
  rounds: [],
  votes: {},
  streak: EMPTY_STREAK,
  leagues: [],
  settings: { notify: false, haptics: true, relaxedTiming: false, notifyAsked: false, render3d: true },
});

let state: AppState = initial();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
  if (!state.hydrated) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { hydrated: _h, ...persist } = state;
    AsyncStorage.setItem(KEY, JSON.stringify(persist)).catch(() => {});
  }, 250);
}
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  emit();
}

export const getState = () => state;
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
    () => selector(state),
  );
}

export async function hydrate() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppState>;
      state = { ...initial(), ...saved, settings: { ...initial().settings, ...saved.settings }, hydrated: true };
    } else state = { ...state, hydrated: true };
  } catch {
    state = { ...state, hydrated: true };
  }
  emit();
}

export const actions = {
  setTeam: (teamId: string | null) => set({ teamId }),
  setNickname: (nickname: string) => set({ nickname: nickname.slice(0, 12) || state.nickname }),
  updateSettings: (p: Partial<Settings>) => set({ settings: { ...state.settings, ...p } }),
  addLeague: (l: LeagueRef) =>
    set({ leagues: state.leagues.some((x) => x.code === l.code) ? state.leagues : [...state.leagues, l] }),
  completeRound(round: RoundRecord) {
    const answers: AnswerRecord[] = round.results.map((r, i) => ({
      id: `${round.id}:${i}`,
      roundId: round.id,
      mode: 'quick',
      pitchId: r.pitch.id,
      ts: round.ts,
      userCall: r.userCall,
      truth: r.truth,
      correct: r.correct,
      rtMs: r.rtMs,
      score: r.score,
      edgeMarginIn: r.edgeMarginIn,
      plateX: r.pitch.plateX,
      plateZ: r.pitch.plateZ,
      batterHeightCm: r.pitch.batterHeightCm,
    }));
    set({
      rounds: [round, ...state.rounds].slice(0, MAX_ROUNDS),
      answers: [...state.answers, ...answers].slice(-MAX_ANSWERS),
      streak: recordPlay(state.streak, round.ts),
    });
  },
  /** 오늘의 논란 판정 투표: 정확도 집계에도 포함(ABS와 일치 여부) */
  vote(pitch: Pitch, call: Call, truth: Call, edgeMarginIn: number, ts = Date.now()) {
    if (state.votes[pitch.id]) return;
    const rec: AnswerRecord = {
      id: `vote:${pitch.id}`,
      roundId: `daily:${pitch.id}`,
      mode: 'daily',
      pitchId: pitch.id,
      ts,
      userCall: call,
      truth,
      correct: call === truth,
      rtMs: 0,
      score: 0,
      edgeMarginIn,
      plateX: pitch.plateX,
      plateZ: pitch.plateZ,
      batterHeightCm: pitch.batterHeightCm,
    };
    set({
      votes: { ...state.votes, [pitch.id]: { call, ts } },
      answers: [...state.answers, rec].slice(-MAX_ANSWERS),
      streak: recordPlay(state.streak, ts),
    });
  },
};

/** 이번 주(KST) 내 기록 → 랭킹 입력 행 */
export function weekRow(s: AppState, now = Date.now()): UserWeekRow | null {
  if (!s.teamId) return null;
  const wk = kstWeekKey(now);
  const mine = s.answers.filter((a) => kstWeekKey(a.ts) === wk);
  return { userId: s.anonId, teamId: s.teamId, attempts: mine.length, correct: mine.filter((a) => a.correct).length };
}
