# 4. 핵심 화면 코드 안내

스택: **Expo SDK 58 + React Native 0.88 + TypeScript + Expo Router** (iOS/Android/Web 단일 코드). 상태는 의존성 없는 소형 스토어(`useSyncExternalStore` + AsyncStorage). 판정·점수·랭킹·공유 카드는 **UI와 분리된 순수 TS**(`src/core`)라 앱·서버·스크립트·테스트가 같은 코드를 쓴다.

```
src/core/        순수 로직(테스트 대상): zone, pitchGen, scoring, ranking, streak, teams/color, shareCard(SVG), fanVotes, notificationPlan
src/services/    api(서버 경계: MockApi→Supabase), haptics, notifications(로컬 예약), analytics(KPI 이벤트)
src/state/       persisted store (익명 프로필·기록·스트릭·리그·설정)
src/features/    play/PitchStage(스테이지), share/(카드 모델·뷰·내보내기), standing(내 구단 순위 훅)
src/app/         Expo Router 화면: (tabs)/{index,ranking,me}, play, result, share, controversy/[i], team, league/new, l/[code]
supabase/schema.sql   서버 권위 채점·집계 (SQL)        scripts/   카드·클립 렌더러, SQL 대조 검증
```

## 4-1. 퀴즈 — `src/app/play.tsx` + `src/features/play/PitchStage.tsx`

스테이지는 `src/features/play/Stage.tsx`가 고른다: **3D(`PitchStage3D`, three.js + @react-three/fiber)** 기본, 설정에서 끄거나 WebGL이 없거나 3D 렌더가 예외를 던지면(에러 경계) **2D(`PitchStage`)**. 두 구현은 같은 props, 같은 판정 데이터, 같은 오버레이(`StageOverlay`: 판정 도장·스크린리더 라벨)를 쓴다. `@react-three/fiber`는 `react-native` 진입점이 있어 같은 import로 웹=WebGL, iOS/Android=expo-gl.

3D 장면 구성: `Ballpark`(구장·리본 전광판) · `Batter` · `PitchScene`(공·궤적·존). `useFrame`에서 매 프레임 `positionAt(k, T·u)`로 공 위치, 존 머티리얼 투명도(220ms), 카메라(주심 ↔ 1루 쪽 리플레이, 지수 감쇠 보간)를 갱신한다. 세로 화면에서도 구도가 같도록 카메라는 수평 시야각으로 정의(`verticalFov`).

상태 머신: `flight → decide → reveal → (next) → … → result`
- **flight(0.95s)**: 공이 릴리스→플레이트로 비행. 경로는 `samplePath()`(원근 스케일 0.16→1, 중간 휨)를 `Animated.Value.interpolate`로 네이티브 드라이버 재생. *존은 숨김*(타자 실루엣·홈플레이트만) → 판정은 공의 정지 위치 기반.
- **decide(≤4s)**: 타이머 바(scaleX), 버튼 활성. 시간 초과는 자동 오답. 접근성 옵션 `relaxedTiming`이면 타이머/자동진행 없음(속도 보너스 0, 정확도는 동일 집계).
- **reveal**: `PitchStage mode="reveal"` → 존 220ms 페이드인 → 공→가장 가까운 경계점 점선 → 판정 도장(스프링 250ms) + 햅틱. 1.5초 후 자동 진행(탭으로 즉시 진행).
- 완료 시 `actions.completeRound()`(기록 + 스트릭) → `/result`로 `replace`(뒤로가기로 재제출 불가).

```tsx
// play.tsx — 채점은 core를 그대로 호출 (서버 전환 시 api.submitAnswer로 교체)
const v = judge(pitch);                       // ABS 정답 + edgeMarginIn
const score = scorePitch({ correct, edgeMarginIn: v.edgeMarginIn, rtMs: rt, combo });
```

## 4-2. 결과 비교 — `src/app/result.tsx`
- `AnimatedNumber`(카운트업) → **공유 버튼을 가장 큰 요소로 배치**, 카운트업 직후 1회 팝(300ms).
- 투구 칩(1✓ 2✓ 3✓ 4✕ 5✕) 선택 → 같은 `PitchStage`를 `mode="reveal"`로 재사용(첫 오답 투구가 기본 선택). "다시 보기"는 비행 애니메이션만 재생.
- 구단 미선택이면 선택 유도 카드, 알림 미동의면 맥락 있는 동의 카드(첫 판 직후 1회).

## 4-3. 공유 카드 생성 — `src/core/shareCard.ts`, `src/features/share/*`
- **단일 소스**: `buildCardSvg(model, 'story'|'square')`가 SVG 문자열을 만든다.
  - 앱: `SvgXml`로 미리보기 → `react-native-view-shot`으로 **1080px PNG** 캡처 → `expo-sharing` 시스템 공유 시트(인스타 스토리/카톡/저장).
  - 서버/스크립트: 같은 문자열을 Playwright/resvg로 래스터화 → 앱 미리보기와 서버 생성물이 **픽셀 단위로 동일 레이아웃**.
- 포맷: **스토리 1080×1920(9:16)**, **카톡 1080×1080(1:1)**. 내용: 정확도(거대 숫자) · 투구 5개 위치(정답=채움, 오답=링 → 색각 이상 대응) · 연속 기록 · 구단 순위 · 구단 기여도 · 초대 문구 · (시뮬레이션이면) 고지 문구.
- **오늘의 논란 판정 카드/클립**: `buildControversyCardSvg`(정지 이미지) / `buildControversyClipFrame(model, p)`(p∈[0,1] 프레임). `scripts/render-samples.mts --clip`이 150프레임을 렌더해 ffmpeg로 **1080×1920 5초 mp4**를 만든다. 프로덕션에서는 같은 로직을 매일 04:00 KST 배치로 돌려 *그날의 논란 판정 3개 클립/이미지를 미리 생성*해 두고, 앱의 공유 카드/커뮤니티 업로드용으로 제공한다.

샘플(실제 생성물): `docs/samples/round-story.png`, `round-square.png`, `controversy-story.png`, `controversy-square.png`, `controversy-clip.mp4`.

## 4-4. 실행 방법
```bash
npm install
npm start                 # Expo (iOS/Android/Web). 서버 없이 MockApi로 동작
npm test                  # 단위 테스트 37개
npm run typecheck
npm run verify:sql        # 로컬 PostgreSQL 16 필요: SQL ↔ TS 대조
NODE_PATH=$(npm root -g) npx tsx scripts/render-samples.mts --clip   # 카드/클립 렌더 (Playwright, ffmpeg 필요)
```

## 4-5. 검증한 것 / 못 한 것 (정직하게)
| 구분 | 상태 |
|---|---|
| 순수 로직 | ✅ vitest 37개 통과(3D 궤적 7개 포함) |
| SQL ↔ TS 일치 | ✅ 실제 PostgreSQL 16에서 15개 항목 통과 |
| 타입 | ✅ `tsc --noEmit` 통과 |
| 번들 | ✅ `expo export --platform web` 성공 |
| 3D 스테이지 | ✅ 헤드리스 Chromium(소프트웨어 WebGL)에서 비행 중/판정/공개/결과 비교 렌더 확인, 콘솔 오류 0. ❌ expo-gl(iOS/Android) 실기기 렌더·프레임레이트 미검증 |
| 사용자 흐름 | ✅ 헤드리스 Chromium(390×844)으로 첫 실행→자동 퀴즈→5구→결과→공유→구단 선택→탭 3개→논란 판정 투표/공개 구동, 콘솔 오류 0 |
| iOS/Android 실기기 | ❌ **미검증**: 햅틱, 로컬 알림 예약, `view-shot` 캡처→공유 시트, `SvgXml` 폰트 렌더, 딥링크(Universal/App Links), 스토어 빌드 |
| Supabase 연동 | ❌ 앱은 `MockApi` 사용. 스키마만 실제 PG에서 검증, RLS 정책은 Supabase 환경에서 별도 확인 필요 |
| 접근성 | ⚠️ 대비/타깃 크기만 자동 검증. 스크린리더 실기기·외부 감사 미실시 |
| 웹 한계 | 웹은 개발용 확인 경로(햅틱 없음). 출시 대상은 iOS/Android |
