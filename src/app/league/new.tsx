import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SURFACE_2, TEXT, TEXT_MUTED, teamName } from '../../core/teams';
import { newLeagueCode } from '../../services/api';
import { track } from '../../services/analytics';
import { actions, useStore } from '../../state/store';
import { Button, Chip, Muted, Screen, T } from '../../ui/primitives';

/** 초대 링크 하나로 미니 리그 생성: 이름 + 종류(친구/구단) → 코드 발급 → 초대 링크 공유 */
export default function NewLeague() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const teamId = useStore((s) => s.teamId);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'friends' | 'team'>('friends');
  const label = name.trim() || (kind === 'team' ? `${teamName(teamId)} 팬 리그` : '우리 리그');
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 32, gap: 14 }}>
        <T size={26} weight="900">미니 리그 만들기</T>
        <Muted size={14} weight="600">만들면 초대 링크가 생겨요. 링크를 받은 친구는 가입 없이 바로 참여할 수 있어요.</Muted>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="친구 리그" selected={kind === 'friends'} onPress={() => setKind('friends')} />
          <Chip label="구단 팬 리그" selected={kind === 'team'} onPress={() => setKind('team')} />
        </View>
        <TextInput value={name} onChangeText={setName} maxLength={16} placeholder="리그 이름 (예: 동기 야구방)" placeholderTextColor={TEXT_MUTED} accessibilityLabel="리그 이름" style={styles.input} />
        <Button
          big
          label="리그 만들기"
          onPress={() => {
            const code = newLeagueCode();
            actions.addLeague({ code, name: label, kind, mine: true });
            track('invite_create', { kind });
            router.replace({ pathname: '/l/[code]', params: { code, created: '1' } });
          }}
        />
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  input: { minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: '#2C3846', backgroundColor: SURFACE_2, color: TEXT, paddingHorizontal: 14, fontSize: 18, fontWeight: '700' },
});
