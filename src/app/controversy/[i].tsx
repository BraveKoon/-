import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { majority, strikeShare, totalVotes } from '../../core/fanVotes';
import { BAD, OK, SURFACE_2, TEAMS, teamName } from '../../core/teams';
import type { Call } from '../../core/types';
import { judge } from '../../core/zone';
import { PitchStage } from '../../features/play/PitchStage';
import { api, type ControversyItem } from '../../services/api';
import { haptic } from '../../services/haptics';
import { track } from '../../services/analytics';
import { actions, useStore } from '../../state/store';
import { Button, Card, Muted, Screen, T } from '../../ui/primitives';
import { useTheme } from '../../ui/theme';

const callKo = (c: Call) => (c === 'strike' ? '스트라이크' : '볼');

/** 오늘의 논란 판정: 투표(1탭) → ABS vs 팬 투표 공개 → 공유 */
export default function Controversy() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const th = useTheme();
  const { i, day } = useLocalSearchParams<{ i: string; day: string }>();
  const idx = Number(i ?? 0);
  const teamId = useStore((s) => s.teamId);
  const [item, setItem] = useState<ControversyItem | null>(null);
  const myVote = useStore((s) => (item ? s.votes[item.pitch.id] : undefined));
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [flight, setFlight] = useState(0);

  useEffect(() => {
    api.getControversies(day ?? '').then((list) => { setItem(list[idx] ?? null); setCount(list.length); });
  }, [day, idx]);

  const vote = useCallback((call: Call) => {
    if (!item) return;
    const v = judge(item.pitch);
    actions.vote(item.pitch, call, v.call, v.edgeMarginIn);
    track('controversy_vote', { idx, correct: call === v.call });
    call === v.call ? haptic.correct() : haptic.wrong();
  }, [item, idx]);

  if (!item) return <Screen><View style={{ padding: 24 }}><T>불러오는 중…</T></View></Screen>;
  const v = judge(item.pitch);
  const voted = !!myVote;
  const total = totalVotes(item.votes);
  const mine = teamId ? item.votes[teamId] : null;
  const allShare = strikeShare(total);
  const myShare = mine ? strikeShare(mine) : null;
  const fanMajority = majority(total);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, gap: 14 }}>
        <View>
          <T size={13} weight="900" color={th.accent} style={{ letterSpacing: 1 }}>오늘의 논란 판정 {idx + 1}/{count}</T>
          <T size={22} weight="900">{item.pitch.label}</T>
          <Muted size={13} weight="700">{item.pitch.source === 'simulated' ? '시뮬레이션 투구·투표 (실제 경기 아님)' : '경기 추적 데이터'}</Muted>
        </View>

        <View style={{ height: 400 }}>
          <PitchStage
            pitch={item.pitch}
            mode={voted ? 'reveal' : 'guess'}
            userCall={myVote?.call ?? null}
            flightKey={flight}
            skipFlight={voted && flight === 0}
            onFlightEnd={() => setReady(true)}
            simulatedBadge
          />
        </View>

        {!voted ? (
          <View style={{ gap: 10 }}>
            <Muted size={14} weight="700" center>{ready ? '공이 멈췄어요. 당신의 판정은?' : '투구 중…'}</Muted>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button big style={{ flex: 1 }} label="스트라이크" disabled={!ready} onPress={() => vote('strike')} quiet />
              <Button big style={{ flex: 1 }} variant="secondary" label="볼" disabled={!ready} onPress={() => vote('ball')} quiet />
            </View>
          </View>
        ) : (
          <>
            <Card accent style={{ gap: 10 }}>
              <T size={13} weight="900" color={th.accent}>팬 투표 vs ABS</T>
              <View style={styles.vs}>
                <View style={styles.col}><Muted size={12} weight="800">ABS</Muted><T size={26} weight="900" color={v.call === 'strike' ? OK : BAD}>{callKo(v.call)}</T></View>
                <T size={16} weight="900">vs</T>
                <View style={styles.col}><Muted size={12} weight="800">전체 팬 다수</Muted><T size={26} weight="900">{callKo(fanMajority)}</T></View>
              </View>
              <T size={15} weight="800" center color={fanMajority === v.call ? OK : BAD}>
                {fanMajority === v.call ? '팬 다수가 ABS와 같은 판정을 했어요' : '팬 다수가 ABS와 다르게 봤어요 — 논란!'}
              </T>
              <Bar label="전체 팬" share={allShare} />
              {mine && myShare != null ? <Bar label={`${teamName(teamId)} 팬`} share={myShare} accent /> : null}
              <Muted size={12} weight="600">{total.strike + total.ball} 표 · 구단별 표 {TEAMS.length}개 팀 합산{api.simulated ? ' · 시뮬레이션' : ''}</Muted>
            </Card>
            <T size={17} weight="900" center color={myVote.call === v.call ? OK : BAD}>
              {myVote.call === v.call ? `✓ 나도 ${callKo(myVote.call)}! ABS와 일치` : `✕ 나는 ${callKo(myVote.call)} — ABS와 달랐어요`}
            </T>
            <Button big label="공유하기 · 논란 판정 카드" onPress={() => { track('share_open', { source: 'controversy' }); router.push({ pathname: '/share', params: { kind: 'controversy', i: String(idx), day: day ?? '' } }); }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button style={{ flex: 1 }} variant="secondary" label="다시 보기" onPress={() => setFlight((k) => k + 1)} />
              {idx + 1 < count ? (
                <Button style={{ flex: 1 }} variant="secondary" label="다음 논란" onPress={() => router.replace({ pathname: '/controversy/[i]', params: { i: String(idx + 1), day: day ?? '' } })} />
              ) : (
                <Button style={{ flex: 1 }} variant="secondary" label="오늘 끝!" onPress={() => router.back()} />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Bar({ label, share, accent }: { label: string; share: number; accent?: boolean }) {
  const th = useTheme();
  const pct = Math.round(share * 100);
  return (
    <View accessible accessibilityLabel={`${label} 스트라이크 ${pct}퍼센트, 볼 ${100 - pct}퍼센트`} style={{ gap: 4 }}>
      <View style={styles.between}><T size={13} weight="800">{label}</T><T size={13} weight="800">스트라이크 {pct}% · 볼 {100 - pct}%</T></View>
      <View style={styles.track}><View style={{ width: `${pct}%`, height: 14, backgroundColor: accent ? th.accent : OK }} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  vs: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  col: { alignItems: 'center', gap: 2 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 14, borderRadius: 7, backgroundColor: SURFACE_2, overflow: 'hidden' },
});
