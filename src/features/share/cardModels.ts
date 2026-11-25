import { kstDayKey, kstWeekKey, weekLabel } from '../../core/dates';
import { strikeShare, totalVotes, type TeamVotes } from '../../core/fanVotes';
import { formatMargin, judge, zoneFor } from '../../core/zone';
import { summarizeRound } from '../../core/scoring';
import { teamTheme, type TeamTheme } from '../../core/teams';
import { toDot, type ControversyCardModel, type RoundCardModel } from '../../core/shareCard';
import type { Call, Pitch } from '../../core/types';
import type { RoundRecord } from '../../state/store';

export const INVITE_TEXT = '나도 판정해보기 · strzone.app';

export function roundCardModel(args: {
  round: RoundRecord;
  nickname: string;
  teamId: string | null;
  streak: number;
  rank: number | null;
  contribution: number | null;
}): RoundCardModel {
  const sum = summarizeRound(args.round.results.map((r) => ({ correct: r.correct, score: r.score })));
  return {
    kind: 'round',
    nickname: args.nickname,
    theme: teamTheme(args.teamId),
    accuracyPct: Math.round(sum.accuracy * 100),
    correct: sum.correct,
    total: sum.total,
    score: sum.score,
    streak: args.streak,
    teamRank: args.rank,
    contribution: args.contribution,
    weekLabel: weekLabel(kstWeekKey(args.round.ts)),
    dots: args.round.results.map((r) => toDot(r.pitch, zoneFor(r.pitch.batterHeightCm), r.correct)),
    inviteText: INVITE_TEXT,
    simulated: args.round.results.some((r) => r.pitch.source === 'simulated'),
  };
}

export function controversyCardModel(args: {
  pitch: Pitch;
  votes: TeamVotes;
  userCall: Call | null;
  nickname: string;
  theme: TeamTheme;
  now?: number;
}): ControversyCardModel {
  const v = judge(args.pitch);
  const day = kstDayKey(args.now ?? Date.now());
  return {
    kind: 'controversy',
    nickname: args.nickname,
    theme: args.theme,
    pitch: args.pitch,
    zone: v.zone,
    absCall: v.call,
    userCall: args.userCall,
    strikeSharePct: Math.round(strikeShare(totalVotes(args.votes)) * 100),
    marginText: formatMargin(v.edgeMarginIn),
    situation: `${args.pitch.label ?? ''}${args.pitch.source === 'simulated' ? ' · 시뮬레이션' : ''}`,
    dayLabel: `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`,
    inviteText: INVITE_TEXT,
    simulated: args.pitch.source === 'simulated',
  };
}
