import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCountdown, kstWeekKey, msUntilWeekEnd, weekLabel } from '../../core/dates';
import { SURFACE, SURFACE_2, TEXT, TEXT_MUTED, teamName, teamTheme } from '../../core/teams';
import { useStanding } from '../../features/standing';
import { api } from '../../services/api';
import { useStore } from '../../state/store';
import { Button, Card, Chip, Muted, Screen, T } from '../../ui/primitives';
import { useTheme } from '../../ui/theme';

export default function Ranking() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const th = useTheme();
  const teamId = useStore((s) => s.teamId);
  const leagues = useStore((s) => s.leagues);
  const [seg, setSeg] = useState<'team' | 'league'>('team');
  const [now, setNow] = useState(Date.now());
  const [code, setCode] = useState('');
  const standing = useStanding(30000); // 30초 폴링 = 준실시간
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const rows = standing.result?.rows ?? [];
  const range = useMemo(() => {
    const a = rows.map((r) => r.accuracy);
    return { min: Math.min(...a, 0.5), max: Math.max(...a, 0.51) };
  }, [rows]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 32, gap: 14 }}>
        <View>
          <T size={13} weight="900" color={th.accent} style={{ letterSpacing: 2 }}>WEEKLY SEASON · {weekLabel(kstWeekKey(now))}</T>
          <T size={28} weight="900">구단 랭킹</T>
          <Muted size={14} weight="700">시즌 종료까지 {formatCountdown(msUntilWeekEnd(now))} · 월요일 00:00 리셋{api.simulated ? ' · 시뮬레이션 집계' : ''}</Muted>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="구단 대항전" selected={seg === 'team'} onPress={() => setSeg('team')} />
          <Chip label="내 리그" selected={seg === 'league'} onPress={() => setSeg('league')} />
        </View>

        {seg === 'team' ? (
          <>
            {teamId && standing.myRow ? (
              <Card accent>
                <Muted size={12} weight="800">나의 구단 기여도 (이번 주)</Muted>
                <T size={40} weight="900" color={th.accent}>{standing.contribution == null ? '-' : `${standing.contribution >= 0 ? '+' : ''}${standing.contribution.toFixed(1)}`}</T>
                <Muted size={13} weight="600">내가 평균 팬보다 {teamName(teamId)}에 정답을 몇 개 더 보탰는지예요. 시도 {standing.me?.attempts ?? 0}회 · 정답 {standing.me?.correct ?? 0}회</Muted>
              </Card>
            ) : (
              <Card>
                <T size={16} weight="900">응원 구단을 고르면 내 기여도가 보여요</T>
                <View style={{ height: 10 }} />
                <Button label="응원 구단 선택" onPress={() => router.push('/team')} />
              </Card>
            )}
            {rows.map((r) => {
              const th2 = teamTheme(r.teamId);
              const mine = r.teamId === teamId;
              const pct = (r.accuracy * 100).toFixed(1);
              const w = 0.35 + 0.65 * ((r.accuracy - range.min) / Math.max(0.0001, range.max - range.min));
              return (
                <View
                  key={r.teamId}
                  accessible
                  accessibilityLabel={`${r.rank}위 ${teamName(r.teamId)} 정확도 ${pct}퍼센트, 참여 ${r.players}명${r.provisional ? ', 잠정' : ''}${mine ? ', 내 구단' : ''}`}
                  style={[styles.row, mine && { borderColor: th.accent, borderWidth: 2 }]}>
                  <T size={26} weight="900" color={mine ? th.accent : TEXT} style={{ width: 40 }}>{r.rank}</T>
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={styles.between}>
                      <T size={16} weight="900">{teamName(r.teamId)}</T>
                      <T size={18} weight="900" color={th2.accent}>{pct}%</T>
                    </View>
                    <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(w * 100)}%`, backgroundColor: th2.accent }]} /></View>
                    <Muted size={12} weight="700">{r.players.toLocaleString('ko-KR')}명 참여{r.provisional ? ' · 잠정(표본 적음)' : ''}</Muted>
                  </View>
                </View>
              );
            })}
            <Muted size={12} weight="600">순위는 '정확도'만 사용해요(속도·난이도 보너스 제외). 1인당 주간 100구까지만 반영하고, 표본이 적은 구단은 리그 평균 쪽으로 보정돼요.</Muted>
          </>
        ) : (
          <View style={{ gap: 12 }}>
            {leagues.length === 0 ? <Muted size={15} weight="600">아직 참여한 리그가 없어요.</Muted> : null}
            {leagues.map((l) => (
              <Pressable key={l.code} accessibilityRole="button" accessibilityLabel={`${l.name} 리그 열기`} onPress={() => router.push({ pathname: '/l/[code]', params: { code: l.code } })} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <T size={17} weight="900">{l.name}</T>
                  <Muted size={13} weight="700">{l.kind === 'team' ? '구단 리그' : '친구 리그'} · 코드 {l.code}</Muted>
                </View>
                <T size={20} weight="900" color={th.accent}>›</T>
              </Pressable>
            ))}
            <Button label="새 리그 만들기" onPress={() => router.push('/league/new')} />
            <Card style={{ gap: 8 }}>
              <T size={15} weight="900">초대 코드로 참여</T>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="예: K7M2QX"
                placeholderTextColor={TEXT_MUTED}
                autoCapitalize="characters"
                accessibilityLabel="초대 코드 입력"
                style={styles.input}
              />
              <Button variant="secondary" label="참여하기" disabled={code.length < 6} onPress={() => router.push({ pathname: '/l/[code]', params: { code } })} />
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 18, backgroundColor: SURFACE, borderWidth: 1, borderColor: SURFACE_2, minHeight: 76 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 8, borderRadius: 4, backgroundColor: SURFACE_2, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  input: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: '#2C3846', backgroundColor: SURFACE_2, color: TEXT, paddingHorizontal: 14, fontSize: 20, fontWeight: '900', letterSpacing: 4 },
});
