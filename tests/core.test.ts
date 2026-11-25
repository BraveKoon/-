import { describe, expect, it } from 'vitest';
import { judge, zoneFor, formatMargin, BALL_RADIUS_IN, signedDistanceToRect, BORDERLINE_IN } from '../src/core/zone';
import { buildDailyControversies, buildQuickRound, DIFFICULTY_BAND, ROUND_SIZE } from '../src/core/pitchGen';
import { MAX_PITCH_SCORE, scorePitch, summarizeRound, TIME_LIMIT_MS } from '../src/core/scoring';
import { computeTeamRanking, effective, teamContribution } from '../src/core/ranking';
import { EMPTY_STREAK, liveStreak, recordPlay, streakStatus } from '../src/core/streak';
import { kstDayKey, kstWeekKey, addDays, msUntilWeekEnd } from '../src/core/dates';
import { contrast } from '../src/core/color';
import { BG, SURFACE, SURFACE_2, TEAMS, teamTheme, NEUTRAL_THEME, TEXT_MUTED, OK, BAD } from '../src/core/teams';
import { planStreakRisk } from '../src/core/notificationPlan';
import { simulateFanVotes, totalVotes, strikeShare } from '../src/core/fanVotes';
import { buildCardSvg, buildControversyClipFrame, toDot, type ControversyCardModel, type RoundCardModel } from '../src/core/shareCard';

const KST = (iso: string) => Date.parse(iso + '+09:00');

describe('zone / ABS 판정', () => {
  const H = 180;
  const z = zoneFor(H);
  it('존 크기: 폭 17in, 세로 신장의 27.64~56.35%', () => {
    expect(z.right - z.left).toBeCloseTo(17);
    expect(z.bottom).toBeCloseTo((180 / 2.54) * 0.2764, 4);
    expect(z.top).toBeCloseTo((180 / 2.54) * 0.5635, 4);
  });
  it('공 가장자리가 존에 닿으면 스트라이크, 안 닿으면 볼', () => {
    const mid = (z.bottom + z.top) / 2;
    const edge = z.right + BALL_RADIUS_IN; // 중심이 이만큼 밖이면 정확히 걸침
    expect(judge({ plateX: edge - 0.01, plateZ: mid, batterHeightCm: H }).call).toBe('strike');
    expect(judge({ plateX: edge + 0.01, plateZ: mid, batterHeightCm: H }).call).toBe('ball');
    expect(judge({ plateX: 0, plateZ: mid, batterHeightCm: H }).call).toBe('strike');
  });
  it('모서리는 유클리드 거리(사각형 확장이 아님)', () => {
    // 코너에서 대각선으로 1.45in 보다 멀면 볼: dx=dz=1.1 → 거리 1.556
    expect(judge({ plateX: z.right + 1.1, plateZ: z.top + 1.1, batterHeightCm: H }).call).toBe('ball');
    expect(signedDistanceToRect(z.right + 1.1, z.top + 1.1, z)).toBeCloseTo(Math.hypot(1.1, 1.1));
  });
  it('edgeMargin 부호와 borderline', () => {
    const v = judge({ plateX: z.right + BALL_RADIUS_IN + 0.5, plateZ: (z.bottom + z.top) / 2, batterHeightCm: H });
    expect(v.edgeMarginIn).toBeCloseTo(0.5);
    expect(v.borderline).toBe(true);
  });
});

describe('결과 문구', () => {
  it('볼/걸침/안쪽을 구분한다', () => {
    expect(formatMargin(0.4)).toBe('존 바깥 0.4in(1.0cm)');
    expect(formatMargin(-0.5)).toBe('경계선에 0.5in(1.3cm) 걸침');
    expect(formatMargin(-8.55)).toContain('존 안쪽');
    expect(formatMargin(-8.55)).toContain('7.1in');
  });
});

describe('투구 생성', () => {
  it('같은 시드 → 같은 한 판, 다른 시드 → 다른 한 판', () => {
    expect(buildQuickRound('a')).toEqual(buildQuickRound('a'));
    expect(buildQuickRound('a')).not.toEqual(buildQuickRound('b'));
  });
  it('한 판 5구, 난이도 램프가 band 안에 있다', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const r = buildQuickRound(seed);
      expect(r).toHaveLength(ROUND_SIZE);
      const bands = ['easy', 'easy', 'medium', 'hard', 'hard'] as const;
      r.forEach((p, i) => {
        const m = Math.abs(judge(p).edgeMarginIn);
        const [lo, hi] = DIFFICULTY_BAND[bands[i]];
        expect(m).toBeGreaterThanOrEqual(lo - 0.011);
        expect(m).toBeLessThanOrEqual(hi + 0.011);
      });
    }
  });
  it('한 판에 스트라이크·볼이 모두 포함된다 (정답 편향 방지)', () => {
    for (let i = 0; i < 30; i++) {
      const calls = buildQuickRound('bal' + i).map((p) => judge(p).call);
      expect(calls).toContain('strike');
      expect(calls).toContain('ball');
    }
  });
  it('오늘의 논란 판정: 날짜 결정적, 3개, 모두 경계선(0.75in 이내)', () => {
    const a = buildDailyControversies('2027-03-27');
    expect(a).toEqual(buildDailyControversies('2027-03-27'));
    expect(a).not.toEqual(buildDailyControversies('2027-03-28'));
    expect(a).toHaveLength(3);
    for (const p of a) {
      expect(Math.abs(judge(p).edgeMarginIn)).toBeLessThanOrEqual(BORDERLINE_IN + 0.011);
      expect(p.source).toBe('simulated');
    }
  });
});

describe('점수식', () => {
  it('오답 0점, 정답 최소 100점', () => {
    expect(scorePitch({ correct: false, edgeMarginIn: 0.1, rtMs: 100, combo: 0 })).toBe(0);
    expect(scorePitch({ correct: true, edgeMarginIn: 9, rtMs: TIME_LIMIT_MS, combo: 1 })).toBe(100);
  });
  it('경계선 + 즉답 + 콤보5 = 최대 290', () => {
    expect(scorePitch({ correct: true, edgeMarginIn: 0, rtMs: 0, combo: 5 })).toBe(MAX_PITCH_SCORE);
  });
  it('어려울수록, 빠를수록, 콤보가 클수록 점수가 높다', () => {
    const base = { correct: true, edgeMarginIn: 2, rtMs: 3000, combo: 1 };
    expect(scorePitch({ ...base, edgeMarginIn: 0.5 })).toBeGreaterThan(scorePitch(base));
    expect(scorePitch({ ...base, rtMs: 1000 })).toBeGreaterThan(scorePitch(base));
    expect(scorePitch({ ...base, combo: 3 })).toBeGreaterThan(scorePitch(base));
  });
  it('라운드 요약: 정확도/콤보/등급', () => {
    const s = summarizeRound([
      { correct: true, score: 200 }, { correct: true, score: 200 }, { correct: false, score: 0 },
      { correct: true, score: 150 }, { correct: true, score: 160 },
    ]);
    expect(s.correct).toBe(4);
    expect(s.accuracy).toBeCloseTo(0.8);
    expect(s.maxCombo).toBe(2);
    expect(s.grade).toBe('A');
    expect(s.score).toBe(710);
  });
});

describe('구단 랭킹 집계', () => {
  const ids = TEAMS.map((t) => t.id);
  it('헤비 유저 1명이 구단 평균을 끌어내리지 못한다 (개인 캡)', () => {
    expect(effective({ attempts: 1000, correct: 1000 }, 100)).toEqual({ attempts: 100, correct: 100 });
    // A: 1명이 5,000구를 60%로 던지고(헤비), 나머지 9명은 100구 80% / B: 10명 모두 100구 75%
    const A = [
      { userId: 'whale', teamId: 'lg', attempts: 5000, correct: 3000 },
      ...Array.from({ length: 9 }, (_, i) => ({ userId: `a${i}`, teamId: 'lg', attempts: 100, correct: 80 })),
    ];
    const B = Array.from({ length: 10 }, (_, i) => ({ userId: `b${i}`, teamId: 'kia', attempts: 100, correct: 75 }));
    const capped = computeTeamRanking([...A, ...B], { allTeamIds: ids });
    const uncapped = computeTeamRanking([...A, ...B], { allTeamIds: ids, perUserCap: 1e9 });
    expect(capped.rows.find((x) => x.teamId === 'lg')!.rank).toBeLessThan(capped.rows.find((x) => x.teamId === 'kia')!.rank);
    // 캡이 없으면 고래 1명 때문에 순위가 뒤집힌다 → 캡이 실제로 작동함을 증명
    expect(uncapped.rows.find((x) => x.teamId === 'lg')!.rank).toBeGreaterThan(uncapped.rows.find((x) => x.teamId === 'kia')!.rank);
  });
  it('소표본 구단은 리그 평균 쪽으로 수축한다', () => {
    const rows = [
      { userId: 'a', teamId: 'nc', attempts: 5, correct: 5 }, // 5/5 = 100% 이지만 표본 5
      ...Array.from({ length: 20 }, (_, i) => ({ userId: `s${i}`, teamId: 'samsung', attempts: 50, correct: 36 })),
      ...Array.from({ length: 20 }, (_, i) => ({ userId: `k${i}`, teamId: 'kia', attempts: 50, correct: 30 })),
    ];
    const r = computeTeamRanking(rows, { allTeamIds: ids });
    const nc = r.rows.find((x) => x.teamId === 'nc')!;
    expect(nc.rawAccuracy).toBe(1);
    expect(nc.accuracy).toBeLessThan(0.7);
    expect(nc.provisional).toBe(true);
    expect(r.rows[0].teamId).toBe('samsung');
  });
  it('참가자 0명 구단도 표시되고 순위가 연속이다', () => {
    const r = computeTeamRanking([{ userId: 'x', teamId: 'lg', attempts: 10, correct: 6 }], { allTeamIds: ids });
    expect(r.rows).toHaveLength(10);
    expect(r.rows.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('구단 기여도 = 정답 − 시도×리그평균', () => {
    expect(teamContribution({ attempts: 20, correct: 15 }, 0.6)).toBeCloseTo(3.0);
    expect(teamContribution({ attempts: 20, correct: 9 }, 0.6)).toBeCloseTo(-3.0);
    expect(teamContribution({ attempts: 400, correct: 300 }, 0.6)).toBeCloseTo(75 - 60);
  });
});

describe('KST 일/주 키와 스트릭', () => {
  it('KST 자정 경계', () => {
    expect(kstDayKey(KST('2027-03-27T00:00:00'))).toBe('2027-03-27');
    expect(kstDayKey(KST('2027-03-26T23:59:59'))).toBe('2027-03-26');
  });
  it('주 시작은 월요일(KST)', () => {
    expect(kstWeekKey(KST('2027-03-28T23:00:00'))).toBe('2027-03-22'); // 일요일
    expect(kstWeekKey(KST('2027-03-29T00:00:01'))).toBe('2027-03-29'); // 월요일
    expect(addDays('2027-03-29', -1)).toBe('2027-03-28');
    expect(msUntilWeekEnd(KST('2027-03-28T23:00:00'))).toBe(3600 * 1000);
  });
  it('스트릭: 연속 증가 / 하루 중복 무시 / 끊기면 1부터', () => {
    let s = recordPlay(EMPTY_STREAK, KST('2027-04-01T10:00:00'));
    expect(s.current).toBe(1);
    s = recordPlay(s, KST('2027-04-01T22:00:00'));
    expect(s.current).toBe(1);
    s = recordPlay(s, KST('2027-04-02T00:01:00'));
    s = recordPlay(s, KST('2027-04-03T12:00:00'));
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
    const broken = recordPlay(s, KST('2027-04-06T12:00:00'));
    expect(broken.current).toBe(1);
    expect(broken.best).toBe(3);
  });
  it('스트릭 상태: safe / at_risk / broken', () => {
    const s = { current: 4, best: 4, lastDay: '2027-04-01' };
    expect(streakStatus(s, KST('2027-04-01T20:00:00'))).toBe('safe');
    expect(streakStatus(s, KST('2027-04-02T20:00:00'))).toBe('at_risk');
    expect(streakStatus(s, KST('2027-04-03T00:00:00'))).toBe('broken');
    expect(liveStreak(s, KST('2027-04-03T00:00:00'))).toBe(0);
  });
});

describe('푸시 정책', () => {
  const s = { current: 4, best: 4, lastDay: '2027-04-01' };
  it('오늘 아직 안 했으면 오늘 21:30 예약', () => {
    const p = planStreakRisk(s, KST('2027-04-02T18:00:00'))!;
    expect(p.fireAtMs).toBe(KST('2027-04-02T21:30:00'));
  });
  it('오늘 이미 했으면 내일 21:30 예약', () => {
    const p = planStreakRisk(s, KST('2027-04-01T18:00:00'))!;
    expect(p.fireAtMs).toBe(KST('2027-04-02T21:30:00'));
  });
  it('21:30이 지났거나 스트릭 1일이면 예약 안 함', () => {
    expect(planStreakRisk(s, KST('2027-04-02T22:00:00'))).toBeNull();
    expect(planStreakRisk({ current: 1, best: 1, lastDay: '2027-04-02' }, KST('2027-04-02T10:00:00'))).toBeNull();
  });
});

describe('접근성 AA: 구단 컬러 자동 보정', () => {
  it('모든 구단 accent가 BG/SURFACE/SURFACE_2 위에서 4.5:1 이상', () => {
    for (const t of [...TEAMS.map((x) => teamTheme(x.id)), NEUTRAL_THEME]) {
      for (const bg of [BG, SURFACE, SURFACE_2]) expect(contrast(t.accent, bg), `${t.name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.onAccent, t.accent), `${t.name} onAccent`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('본문 보조색/정오답 색도 AA', () => {
    for (const c of [TEXT_MUTED, OK, BAD]) for (const bg of [BG, SURFACE, SURFACE_2]) expect(contrast(c, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('팬 투표 시뮬레이션', () => {
  const ids = TEAMS.map((t) => t.id);
  it('결정적이고, 경계선일수록 의견이 갈린다', () => {
    const [p] = buildDailyControversies('2027-03-27');
    expect(simulateFanVotes(p, ids)).toEqual(simulateFanVotes(p, ids));
    const share = strikeShare(totalVotes(simulateFanVotes(p, ids)));
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.8);
  });
});

describe('공유 카드 SVG', () => {
  const theme = teamTheme('kia');
  const round: RoundCardModel = {
    kind: 'round', nickname: '민수 <&"', theme, accuracyPct: 80, correct: 4, total: 5, score: 710, streak: 7,
    teamRank: 3, contribution: 4.2, weekLabel: '3.22 ~ 3.28', inviteText: '나도 판정해보기', simulated: true,
    dots: buildQuickRound('x').map((p) => toDot(p, zoneFor(p.batterHeightCm), true)),
  };
  const [pitch] = buildDailyControversies('2027-03-27');
  const ctr: ControversyCardModel = {
    kind: 'controversy', nickname: '민수', theme, pitch, zone: zoneFor(pitch.batterHeightCm),
    absCall: judge(pitch).call, userCall: 'ball', strikeSharePct: 62, marginText: '존에서 0.3in 벗어남',
    situation: pitch.label ?? '', dayLabel: '3월 27일', inviteText: 'strzone.app', simulated: true,
  };
  it('모든 카드가 올바른 크기의 well-formed XML이고 사용자 입력을 이스케이프한다', () => {
    for (const m of [round, ctr]) for (const f of ['story', 'square'] as const) {
      const svg = buildCardSvg(m, f);
      const dim = f === 'story' ? [1080, 1920] : [1080, 1080];
      expect(svg).toContain(`width="${dim[0]}" height="${dim[1]}"`);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toContain('민수 <&"');
    }
    expect(buildCardSvg(round, 'story')).toContain('민수 &lt;&amp;&quot;');
  });
  it('시뮬레이션 데이터는 카드에 고지된다', () => {
    expect(buildCardSvg(round, 'story')).toContain('시뮬레이션');
    expect(buildCardSvg({ ...ctr, simulated: false }, 'story')).not.toContain('시뮬레이션');
  });
  it('클립 프레임은 p 전 구간에서 생성되고 후반에 판정이 나온다', () => {
    for (const p of [0, 0.2, 0.4, 0.55, 0.7, 0.9, 1]) expect(buildControversyClipFrame(ctr, p)).toContain('</svg>');
    expect(buildControversyClipFrame(ctr, 0.2)).not.toContain('ABS 판정');
    expect(buildControversyClipFrame(ctr, 0.9)).toContain('ABS 판정');
  });
});
