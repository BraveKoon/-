# 릴리즈 절차

## 1. 브랜치 · PR
- 모든 변경은 기능 브랜치 → **`main` 대상 PR(초안)** 으로 올린다. `main`에 직접 푸시하지 않는다.
- PR마다 CI(`.github/workflows/ci.yml`)가 타입 검사 · 단위 테스트 · **SQL↔TS 대조(PostgreSQL 16)** · 웹 번들을 돌린다.
- 사용자에게 보이는 변경은 PR 안에서 `CHANGELOG.md`의 `## [Unreleased]`에 적는다.

## 2. 버전 규칙 (SemVer)
| 변경 | 버전 |
|---|---|
| 버그 수정·문구 | PATCH `0.1.1` |
| 기능 추가(하위 호환) | MINOR `0.2.0` |
| 데이터/저장 형식 호환 깨짐, 정식 출시 | MAJOR `1.0.0` (정식 출시 = 1.0.0, 개막 목표) |
`0.x` 태그는 GitHub에서 **프리릴리즈**로 표시된다.

## 3. 릴리즈 만들기 (자동)
1. `Unreleased`에 내용이 쌓이면 릴리즈 PR을 만든다: `node scripts/release.mjs bump X.Y.Z` → `package.json`·`app.json` 버전과 CHANGELOG 섹션(날짜는 KST)이 함께 바뀐다.
2. 릴리즈 PR을 `main`에 머지하면 `.github/workflows/release.yml`이 자동 실행된다:
   - `package.json` 버전의 GitHub Release가 이미 있으면 **아무것도 하지 않음**(일반 기능 PR 머지는 릴리즈를 만들지 않는다)
   - 없으면: 버전 3곳 일치 확인(`release.mjs check`) → 타입 검사·테스트 → 웹 빌드 zip → 머지 커밋에 `vX.Y.Z` **태그 생성 + GitHub Release**(본문 = CHANGELOG 해당 섹션, 첨부 = 웹 빌드 zip · 공유 카드 샘플 · 논란 판정 클립). `0.x`는 프리릴리즈.
3. 태그는 워크플로가 만든다(개발 세션에서 태그를 직접 푸시하지 않음). 재실행이 필요하면 Actions → Release → *Run workflow*.
4. 실패하면 태그/릴리즈를 지우지 말고 원인을 고쳐 **PATCH 버전으로 다시** 릴리즈한다(버전 재사용 금지).

## 4. 스토어 배포 (iOS/Android) — 사람의 준비가 필요한 단계
자동화(`.github/workflows/eas-build.yml`, 수동 실행)는 만들어 두었지만, 아래가 준비되기 전에는 **경고만 남기고 건너뛴다**.
1. Expo 계정에서 `npx eas-cli init` → `app.json`에 `extra.eas.projectId` 기록
2. GitHub 저장소 시크릿 `EXPO_TOKEN` 등록
3. Apple Developer Program / Google Play Console 계정, 서명 자격증명(`eas credentials`)
4. 스토어 메타데이터·개인정보 처리방침·심사 문구(시뮬레이션 고지, 베팅/도박 아님)
스토어 제출은 심사·과금·법적 책임이 걸린 외부 행위라 **자동으로 하지 않고**, 준비되면 수동 실행(`preview` → `production`)한다.
