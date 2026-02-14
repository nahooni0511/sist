# PE Board (Expo / Android)

안드로이드 32인치 전자칠판(가로 16:9) 수업용 운영 앱입니다.

## 1) 실행 방법

### 요구 사항
- Node.js 20+
- Android SDK / ADB
- Expo CLI (`npx expo ...`)

### 설치
```bash
cd /Users/nahooni0511/workspace/sistrun-hub/apps/pe-board
npm install
```

### 에뮬레이터 실행 (32인치 1080p AVD 예시)
```bash
emulator -avd TV_32inch_1080p
```

### 앱 실행
```bash
cd /Users/nahooni0511/workspace/sistrun-hub/apps/pe-board
npm run android
```

### 타입 체크
```bash
npm run typecheck
```

## 2) 폴더 구조

```text
apps/pe-board
├─ App.tsx
├─ app.json
├─ assets/
│  └─ sounds/                # 더미 WAV (사용자 교체 가능)
├─ stitch/                   # UI 시안 참조
└─ src/
   ├─ components/            # 레이아웃/설정 모달/공통 UI
   ├─ context/               # 전역 상태 + 런타임 엔진
   ├─ data/                  # 기본 프리셋/템플릿/사운드 메타
   ├─ hooks/                 # 사운드 엔진
   ├─ screens/               # 홈/타이머/팀/점수판/사운드/템플릿
   ├─ theme.ts               # 다크/라이트 테마
   ├─ types/                 # 타입 정의
   └─ utils/                 # 시간/랜덤/스토리지 유틸
```

## 3) 구현 화면

- 홈(대시보드)
- 타이머(서킷/스테이션)
- 팀/번호(랜덤 팀편성 + 번호뽑기)
- 점수판(종목 프리셋, Undo, 경기 타이머)
- 사운드(호루라기/벨/신호음)
- 템플릿(단계 자동 전환)
- 설정 모달(볼륨/사운드/항상켜짐/다크모드/초기화)

## 4) 사운드 파일 안내

기본 더미 파일(저작권 문제 없는 합성음):

- `assets/sounds/whistle.wav`
- `assets/sounds/short_bell.wav`
- `assets/sounds/long_bell.wav`
- `assets/sounds/start_signal.wav`
- `assets/sounds/stop_signal.wav`
- `assets/sounds/clap.wav`
- `assets/sounds/countdown.wav`
- `assets/sounds/confirm.wav`

원하는 음원으로 교체 시 파일명은 그대로 유지하세요.

## 5) 수동 테스트 체크리스트 (전자칠판 터치 기준)

- [ ] 앱 시작 후 로그인 없이 즉시 홈 화면 진입
- [ ] 모든 주요 버튼 터치 타겟이 충분히 크고(64dp 이상) 즉시 반응
- [ ] 타이머: 준비→운동→휴식 자동 전환, 라운드 종료 시 완료음 재생
- [ ] 타이머: 시작/일시정지/다음/이전/리셋 동작
- [ ] 타이머: 앱 백그라운드 후 복귀 시 잔여시간/경과시간 크게 틀어지지 않음
- [ ] 팀편성: 학생 수/팀 수 입력, 다시 섞기, 핀 고정 동작
- [ ] 팀편성: 최근 히스토리 기반으로 동일 조합 반복이 줄어듦
- [ ] 번호뽑기: 1~N 범위에서 애니메이션 후 숫자 표시
- [ ] 점수판: +1/+2/+3/-1, 파울/타임아웃, 세트 승리, Undo 동작
- [ ] 점수판: 경기 타이머 시작/일시정지/리셋 동작
- [ ] 사운드보드: 탭 재생/길게 눌러 반복 재생 동작
- [ ] 설정: 볼륨/사운드 ON/OFF/다크모드/항상켜짐/풀스크린/초기화 반영
