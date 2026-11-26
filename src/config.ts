/**
 * 외부 링크 설정 (한 곳에서 관리).
 * 도메인을 소유하기 전까지는 GitHub Pages(site/ 폴더, .github/workflows/pages.yml)를 웹 주소로 쓴다.
 * 도메인을 사면: WEB_BASE_URL만 바꾸고, app.json에 associatedDomains(iOS)/intentFilters(Android)를 다시 추가한다.
 */
export const WEB_BASE_URL = 'https://bravekoon.github.io/-';
/** App Store Connect의 Apple ID(숫자). 앱 등록 후 채우면 초대 페이지·공유 문구에 스토어 링크가 붙는다. */
export const APP_STORE_ID = '';

export const appStoreUrl = () => (APP_STORE_ID ? `https://apps.apple.com/kr/app/id${APP_STORE_ID}` : `${WEB_BASE_URL}/`);
/** 리그 초대: 웹 착지 페이지가 strzone://l/CODE 로 앱을 열거나 설치를 안내한다 */
export const leagueInviteUrl = (code: string) => `${WEB_BASE_URL}/l/?c=${encodeURIComponent(code)}`;
export const appInviteUrl = () => appStoreUrl();
export const PRIVACY_URL = `${WEB_BASE_URL}/privacy/`;
export const SUPPORT_URL = `${WEB_BASE_URL}/support/`;
