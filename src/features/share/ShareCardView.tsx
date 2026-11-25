import { forwardRef, useMemo, type ComponentRef } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { buildCardSvg, CARD_SIZE, type CardFormat, type CardModel } from '../../core/shareCard';

/**
 * 앱 안 미리보기 = 서버 생성 이미지와 같은 SVG 문자열. 내보내기는 captureRef로 1080px 폭 PNG.
 * collapsable={false}는 Android에서 View가 최적화로 사라져 캡처가 실패하는 것을 막는다.
 */
export const ShareCardView = forwardRef<ComponentRef<typeof View>, { model: CardModel; format: CardFormat; width: number }>(function ShareCardView(
  { model, format, width },
  ref,
) {
  const { w, h } = CARD_SIZE[format];
  const xml = useMemo(() => buildCardSvg(model, format), [model, format]);
  return (
    <View ref={ref} collapsable={false} style={{ width, height: (width * h) / w, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0B0F14' }}>
      <SvgXml xml={xml} width="100%" height="100%" />
    </View>
  );
});
