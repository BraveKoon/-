# App Store 출시 가이드

자동화된 부분과 **사람이 직접 해야 하는 부분**을 나눠 적었습니다. ☐ 표시가 사용자 작업입니다.

| 단계 | 누가 | 소요 |
|---|---|---|
| 0. 출시 전 결정 3가지 | 사용자 | — |
| 1. GitHub 설정 (Pages·기본 브랜치) | 사용자 | 2분 |
| 2. Expo 계정·토큰 | 사용자 | 5분 |
| 3. **1회 로컬 설정**: iOS 인증서 생성 | 사용자 (본인 PC, Node 22) | 15분 |
| 4. App Store Connect 앱 등록 | 사용자 | 5분 |
| 5. iOS 빌드 → TestFlight 업로드 | **자동** (GitHub Actions + EAS) | 20~40분 |
| 6. TestFlight 실기기 테스트 | 사용자 | — |
| 7. 스토어 정보·스크린샷 입력 | 준비 완료(파일), 입력은 사용자 또는 `eas metadata:push` | 10분 |
| 8. 심사 제출 · 출시 | 사용자 (App Store Connect) | 심사 1~3일 |

> 인증서 생성과 심사 제출을 자동으로 하지 않는 이유: Apple 로그인(2단계 인증)이 필요하거나, 심사·출시는 되돌리기 어려운 외부 행위이기 때문입니다. eas-cli 27.11.0 소스 기준으로 **배포 인증서는 비대화형(CI)에서 새로 만들 수 없습니다**.

---

## 0. 출시 전 결정 3가지 ☐
1. **번들 ID**: 현재 `app.strzone.fan`. 바꾸려면 `app.json`의 `ios.bundleIdentifier`(와 `android.package`)를 알려주세요. 한 번 출시하면 바꿀 수 없습니다.
2. **구단명·구단 색 사용 (심사 지침 5.2.1 지식재산권)**: 앱 안에 KBO 10개 구단 이름과 대표 색을 씁니다(로고는 미사용). 권리 확인 없이 쓰면 심사에서 권리 증빙을 요구받거나 거절될 수 있습니다. 스토어 문구·키워드에는 이미 KBO·구단명을 넣지 않았습니다.
3. **시뮬레이션 데이터로 심사를 받을지 (지침 2.1/2.3)**: 지금 구단 순위·팬 투표·리그 멤버는 기기 안의 시뮬레이션입니다. 화면에 "시뮬레이션"을 표시하고 있지만, 심사에서 "실제 경쟁이 아닌 가짜 데이터"로 보고 거절할 수 있습니다.
   - **권장**: 지금은 **TestFlight 테스트까지만** 진행 → 서버(Supabase) 연동으로 순위·투표·리그를 실제 데이터로 바꾼 뒤 심사 제출.
   - 바로 심사를 받는다면: 심사 메모(아래 §8)에 시뮬레이션임을 명시하고, 리그의 "데모 멤버"는 숨기는 편이 안전합니다(요청하시면 PR로 처리).

## 1. GitHub 설정 ☐
- Settings → **Pages** → Build and deployment → Source: **GitHub Actions**
  → 개인정보처리방침 `https://bravekoon.github.io/-/privacy/`, 지원 `…/support/`, 초대 `…/l/?c=코드` 가 배포됩니다(스토어 등록에 개인정보처리방침 URL 필수).
- Settings → General → **Default branch: `main`**

## 2. Expo 계정·토큰 ☐
1. https://expo.dev 가입(무료 플랜으로 시작 가능, iOS 빌드는 월 한도 내).
2. 계정 설정 → **Access tokens** → 새 토큰 생성.
3. GitHub → Settings → Secrets and variables → Actions → **New repository secret**: 이름 `EXPO_TOKEN`, 값 = 토큰.

## 3. 1회 로컬 설정: iOS 배포 인증서 ☐
본인 컴퓨터(Mac/Windows/Linux 모두 가능, **Node 22** 필요)에서:
```bash
git clone https://github.com/BraveKoon/-.git strzone && cd strzone
npm ci
npx eas-cli@27.11.0 login                    # Expo 계정
npx eas-cli@27.11.0 init                     # EAS 프로젝트 생성·연결 → app.json에 projectId가 추가됨
npx eas-cli@27.11.0 credentials -p ios       # 메뉴에서 production 프로필 선택
```
`credentials` 메뉴에서(표시 문구는 버전에 따라 조금 다를 수 있음):
- **빌드 자격 증명 설정**(Build Credentials → 전부 설정): Apple ID 로그인(2단계 인증) → 번들 ID 등록, **배포 인증서**, **프로비저닝 프로파일**을 EAS가 생성·보관합니다.
- **App Store Connect API Key 설정**(제출용 키 → 새로 만들기): EAS가 키를 만들어 보관합니다. 이렇게 하면 CI에 Apple 키를 따로 넣지 않아도 TestFlight 업로드가 됩니다.

끝나면 `app.json`에 생긴 **`extra.eas.projectId` 값과 Expo 계정명(owner)** 을 알려주세요 → 제가 PR로 커밋합니다. (안 알려주셔도 CI가 `eas init`으로 같은 프로젝트를 연결합니다.)

> API 키를 EAS에 저장하지 않고 직접 관리하려면: App Store Connect → 사용자 및 액세스 → 통합 → App Store Connect API에서 키(권한: App Manager 이상)를 만들고 GitHub Secrets에 `ASC_API_KEY_P8`(.p8 파일 내용 전체), `ASC_KEY_ID`, `ASC_ISSUER_ID`, `APPLE_TEAM_ID`를 넣으면 워크플로가 그 키를 씁니다.

## 4. App Store Connect 앱 등록 ☐
1. App Store Connect → 나의 앱 → **＋ → 신규 앱**: 플랫폼 iOS / 이름 `스트존 - 야구 판정 구단 대항전`(이미 쓰인 이름이면 변경) / 기본 언어 **한국어** / 번들 ID `app.strzone.fan`(3단계 후 목록에 나타남) / SKU `strzone-ios`.
2. 앱 → 앱 정보 → **Apple ID**(숫자 10자리 내외) 복사.
3. GitHub → Settings → Secrets and variables → Actions → **Variables** 탭 → `ASC_APP_ID` = 그 숫자.
4. 그 숫자를 알려주시면 `src/config.ts`의 `APP_STORE_ID`에 넣어 초대 페이지·공유 문구에 스토어 링크를 연결하겠습니다.

## 5. iOS 빌드 → TestFlight 업로드 (자동)
- **자동**: 버전을 올린 PR이 `main`에 머지되면 Release 워크플로가 GitHub Release를 만든 뒤 `app-store.yml`을 호출합니다.
- **수동**: Actions → *App Store (iOS 빌드 → TestFlight 업로드)* → Run workflow.
- 흐름: `npm ci` → EAS 프로젝트 연결 → `eas build -p ios --profile production --non-interactive --wait`(빌드 번호는 EAS가 자동 증가) → `eas submit … --non-interactive`(TestFlight 업로드).
- `EXPO_TOKEN`이 없으면 경고만 남기고 건너뜁니다. `ASC_APP_ID`가 없으면 빌드만 하고 업로드는 건너뜁니다.

## 6. TestFlight 실기기 테스트 ☐
App Store Connect → TestFlight → 내부 테스트 그룹에 본인 추가 → iPhone의 TestFlight 앱으로 설치. 아직 검증하지 못한 항목:
- [ ] 3D 판정 화면 렌더링·프레임(구형 기기 포함), 끄면 2D 전환
- [ ] 햅틱, 로컬 알림(17:30 / 21:30), 알림 권한 요청 흐름
- [ ] 공유 카드 → 인스타 스토리·카카오톡 공유 시트
- [ ] `strzone://l/코드` 딥링크(초대 페이지의 "앱에서 열기"), 첫 실행 시 초대 링크로 열면 리그 화면 유지
- [ ] VoiceOver로 퀴즈 한 판 진행

## 7. 스토어 정보 ☐ (파일은 준비 완료)
- 문구·카테고리·연령 등급 답변: [`store.config.json`](../store.config.json) (eas-cli 메타데이터 스키마 검증 통과)
  - 제목 `스트존 - 야구 판정 구단 대항전`, 부제 `볼·스트라이크 맞히고 우리 구단 1위로`, 카테고리 스포츠/엔터테인먼트, 연령 등급 질문 전부 "없음" → **4+** 예상
  - 반영: 로컬에서 `npx eas-cli@27.11.0 metadata:push`(3단계 로그인 상태) 또는 App Store Connect 화면에 복사
- 스크린샷(iPhone 6.9", 1320×2868, 5장): [`store/screenshots/ko/iphone-6.9/`](../store/screenshots/ko/iphone-6.9/) — `npx tsx scripts/store-screenshots.mts`로 재생성
- **앱 개인정보(App Privacy)**: "데이터를 수집하지 않음" — 현재 버전은 서버 전송·분석 SDK·광고 식별자가 없습니다(서버 연동 시 변경 필요).
- 수출 규정 암호화: `app.json`에 `ITSAppUsesNonExemptEncryption = false` 설정됨 → 업로드 때 질문 없음.
- 개인정보 매니페스트(PrivacyInfo): 추적 없음, 수집 없음, 사유 API(UserDefaults·파일 시간·부팅 시간·디스크 공간) 선언됨.

## 8. 심사 제출 · 출시 ☐
1. App Store Connect → 앱 → iOS 앱 버전 → 빌드 선택(TestFlight에 올라온 것) → 아래 심사 메모 붙여넣기 → **심사에 제출**.
2. `store.config.json`은 **수동 출시**(`automaticRelease: false`)로 설정 → 승인 후 원하는 시점에 "이 버전 출시".

심사 메모(붙여넣기용):
```
스트존은 회원가입이 필요 없는 야구 볼·스트라이크 판정 앱입니다. 앱을 처음 열면 바로 5구 퀴즈가 시작됩니다.
- 투구와 팬 투표, 구단 순위 집계는 현재 시뮬레이션 데이터이며 모든 화면과 공유 이미지에 "시뮬레이션"이라고 표시됩니다.
- 금전 보상, 경품, 베팅, 인앱 결제, 광고가 없습니다.
- 개인정보를 서버로 수집하지 않으며 모든 기록은 기기에만 저장됩니다. 알림은 기기에서 예약되는 로컬 알림만 사용합니다.
- 3D 화면이 무거우면 [내 기록 → 설정 → 3D 판정 연출]에서 끌 수 있습니다.

Strzone is a sign-up-free baseball ball/strike judging app. Pitches, fan votes and team rankings are currently simulated and are labeled as such on every screen and share image. No payments, rewards, betting or ads. No personal data leaves the device; only local notifications are used.
```
