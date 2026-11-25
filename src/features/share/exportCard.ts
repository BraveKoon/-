import * as Sharing from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { CARD_SIZE, type CardFormat } from '../../core/shareCard';
import { track } from '../../services/analytics';

/** 카드 View → 1080px PNG → 시스템 공유 시트(인스타 스토리/카카오톡/저장 모두 시트에서 선택). */
export async function shareCardImage(ref: RefObject<ComponentRef<typeof View> | null>, format: CardFormat, source: string): Promise<boolean> {
  track('share_tap', { source, format });
  if (!ref.current) return false;
  const { w, h } = CARD_SIZE[format];
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile', width: w, height: h, fileName: `strzone-${source}-${format}` });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '스트존 공유' });
  track('share_complete', { source, format });
  return true;
}
