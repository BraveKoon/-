import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { liveStreak } from '../core/streak';
import type { CardFormat, CardModel } from '../core/shareCard';
import { controversyCardModel, roundCardModel } from '../features/share/cardModels';
import { shareCardImage } from '../features/share/exportCard';
import { ShareCardView } from '../features/share/ShareCardView';
import { useStanding } from '../features/standing';
import { api, appInviteUrl } from '../services/api';
import { track } from '../services/analytics';
import { getState, useStore } from '../state/store';
import { Button, Chip, Muted, Screen, T } from '../ui/primitives';
import { useTheme } from '../ui/theme';

/** 공유 카드 생성: 스토리(9:16) / 카톡(1:1). 이미지 1장 = 정확도 + 스트릭 + 구단 기여도 + 초대 문구. */
export default function ShareScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const th = useTheme();
  const { kind, id, i, day } = useLocalSearchParams<{ kind: 'round' | 'controversy'; id?: string; i?: string; day?: string }>();
  const nickname = useStore((s) => s.nickname);
  const teamId = useStore((s) => s.teamId);
  const streak = useStore((s) => s.streak);
  const round = useStore((s) => s.rounds.find((r) => r.id === id) ?? null);
  const standing = useStanding();
  const [format, setFormat] = useState<CardFormat>('story');
  const [model, setModel] = useState<CardModel | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    if (kind === 'round' && round) {
      setModel(roundCardModel({ round, nickname, teamId, streak: liveStreak(streak, Date.now()), rank: standing.rank, contribution: standing.contribution }));
    } else if (kind === 'controversy') {
      api.getControversies(day ?? '').then((list) => {
        const it = list[Number(i ?? 0)];
        if (!it) return;
        const v = getState().votes[it.pitch.id];
        setModel(controversyCardModel({ pitch: it.pitch, votes: it.votes, userCall: v?.call ?? null, nickname, theme: th }));
      });
    }
  }, [kind, round, nickname, teamId, streak, standing.rank, standing.contribution, day, i, th]);

  const previewW = Math.min(width - 48, format === 'story' ? (height * 0.5 * 1080) / 1920 : 340);

  const onShare = async () => {
    setBusy(true);
    try {
      const ok = await shareCardImage(ref, format, kind ?? 'round');
      if (!ok) Alert.alert('공유할 수 없어요', '이 기기에서는 이미지 공유를 지원하지 않아요.');
    } catch {
      Alert.alert('이미지를 만들지 못했어요', '잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };

  const onInvite = async () => {
    track('invite_sent', { source: 'share' });
    await Share.share({ message: `스트존에서 같이 판정해요! 나는 ${model?.kind === 'round' ? `${model.accuracyPct}%` : '논란 판정'} 맞혔어. ${appInviteUrl(getState().anonId)}` }).catch(() => {});
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, gap: 14 }}>
        <T size={22} weight="900">공유 카드</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="스토리 9:16" selected={format === 'story'} onPress={() => setFormat('story')} />
          <Chip label="카톡 1:1" selected={format === 'square'} onPress={() => setFormat('square')} />
        </View>
        {model ? <ShareCardView ref={ref} model={model} format={format} width={previewW} /> : <Muted>카드를 만드는 중…</Muted>}
        <View style={{ width: '100%', gap: 10 }}>
          <Button big label={busy ? '만드는 중…' : '이미지로 공유'} disabled={!model || busy} onPress={onShare} accessibilityHint="인스타그램 스토리, 카카오톡 등으로 보낼 수 있어요" />
          <Button variant="secondary" label="친구 초대 링크 보내기" onPress={onInvite} />
        </View>
        <Muted size={12} weight="600" center>이미지는 {format === 'story' ? '1080×1920' : '1080×1080'}으로 저장돼요.{model?.simulated ? ' 시뮬레이션 데이터 고지가 카드에 포함돼요.' : ''}</Muted>
      </ScrollView>
    </Screen>
  );
}
