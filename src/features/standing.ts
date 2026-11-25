import { useCallback, useEffect, useMemo, useState } from 'react';
import { kstWeekKey } from '../core/dates';
import { teamContribution, type RankingResult } from '../core/ranking';
import { api } from '../services/api';
import { getState, useStore, weekRow } from '../state/store';

/** 내 구단 순위/기여도. pollMs를 주면 해당 주기로 갱신(구단 랭킹 탭: 30초 = '실시간'). */
export function useStanding(pollMs = 0) {
  const teamId = useStore((s) => s.teamId);
  const answers = useStore((s) => s.answers);
  const [result, setResult] = useState<RankingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const me = useMemo(() => weekRow(getState()), [teamId, answers]);

  const refresh = useCallback(async () => {
    const r = await api.getTeamRanking(kstWeekKey(Date.now()), me);
    setResult(r);
    setLoading(false);
  }, [me]);

  useEffect(() => {
    refresh();
    if (!pollMs) return;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const myRow = result?.rows.find((r) => r.teamId === teamId) ?? null;
  const contribution = result && me ? teamContribution(me, result.leagueMean, result.options.perUserCap) : null;
  return { result, loading, refresh, me, myRow, rank: myRow?.rank ?? null, contribution };
}
