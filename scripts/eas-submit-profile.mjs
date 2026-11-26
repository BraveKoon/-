#!/usr/bin/env node
/**
 * CI 전용: eas.json의 submit.production.ios를 환경 변수로 채운다(파일은 커밋하지 않음).
 *   ASC_APP_ID            → ascAppId (비대화형 submit 필수)
 *   EXPO_ASC_API_KEY_PATH / EXPO_ASC_KEY_ID / EXPO_ASC_ISSUER_ID → ascApiKeyPath / ascApiKeyId / ascApiKeyIssuerId
 *     (없으면 EAS에 저장된 App Store Connect API 키를 사용)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const ios = (((eas.submit ??= {}).production ??= {}).ios ??= {});
const env = process.env;
if (env.ASC_APP_ID) ios.ascAppId = String(env.ASC_APP_ID).trim();
if (env.EXPO_ASC_API_KEY_PATH && env.EXPO_ASC_KEY_ID) {
  ios.ascApiKeyPath = env.EXPO_ASC_API_KEY_PATH;
  ios.ascApiKeyId = env.EXPO_ASC_KEY_ID;
  if (env.EXPO_ASC_ISSUER_ID) ios.ascApiKeyIssuerId = env.EXPO_ASC_ISSUER_ID;
}
if (ios.ascAppId && !/^\d+$/.test(ios.ascAppId)) {
  console.error('ASC_APP_ID는 App Store Connect 앱 정보의 "Apple ID"(숫자)여야 합니다.');
  process.exit(1);
}
writeFileSync('eas.json', JSON.stringify(eas, null, 2) + '\n');
console.log('submit.production.ios =', JSON.stringify({ ...ios, ascApiKeyPath: ios.ascApiKeyPath ? '(set)' : undefined }));
