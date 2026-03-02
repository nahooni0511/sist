# Sistrun Hub TODO

## 1) 푸시(FCM) 적용

### 1-1. Firebase/GCP 초기 세팅 (아직 계정 없음)
- [ ] Firebase 조직/계정 생성 및 결제 플랜 결정(Spark vs Blaze)
- [ ] Firebase 프로젝트 생성 (`sistrun-hub-prod`, `sistrun-hub-dev` 분리 권장)
- [ ] Android 앱 등록: 패키지명 `kr.sist.appstore`
- [ ] `google-services.json` 다운로드 및 `apps/app_store`에 반영
- [ ] Cloud Messaging API 활성화(연결된 GCP 프로젝트)

### 1-2. 서버 인증/권한 세팅 (HTTP v1)
- [ ] FCM 전용 서비스 계정 생성 (`fcm-sender`)
- [ ] IAM 권한 부여 (`roles/firebasecloudmessaging.admin`)
- [ ] 서비스 계정 키(JSON) 발급
- [ ] 키를 Git에 커밋하지 않도록 `.gitignore`/비밀관리 정책 확정
- [ ] 운영 환경 변수 설계
  - [ ] `FCM_PROJECT_ID`
  - [ ] `FCM_SERVICE_ACCOUNT_JSON_B64` (또는 Secret Manager 경로)

### 1-3. API 서버 구현 (`api-server`)
- [ ] FCM v1 발송 모듈 추가(OAuth2 access token 발급 + send API 호출)
- [ ] 디바이스 토큰 등록/갱신 API 추가
  - [ ] `POST /v1/push-tokens`
  - [ ] `DELETE /v1/push-tokens/:token` 또는 soft delete
- [ ] 푸시 발송 트리거 API/서비스 추가
  - [ ] 앱 업데이트 게시 시 대상 디바이스에 알림 발송
  - [ ] 실패 코드(UNREGISTERED 등) 처리 및 토큰 비활성화
- [ ] 백오프/재시도/서킷브레이커 정책 추가
- [ ] 구조화 로그(요청 ID, token hash, FCM 응답 코드) 저장

### 1-4. DB 스키마 추가
- [ ] `device_push_tokens` 테이블 추가
  - [ ] `id`, `device_id`, `fcm_token`, `platform`, `app_package`, `is_active`, `last_seen_at`, `created_at`, `updated_at`
- [ ] `push_send_logs` 테이블 추가
  - [ ] `id`, `device_id`, `token_id`, `message_type`, `payload_json`, `status`, `error_code`, `error_message`, `sent_at`
- [ ] 인덱스/유니크 제약 추가
  - [ ] `UNIQUE(device_id, fcm_token)`
  - [ ] `INDEX(is_active, updated_at)`

### 1-5. 앱 구현 (`apps/app_store`)
- [ ] FCM 토큰 획득 + 알림 권한 요청(Android 13+)
- [ ] 앱 시작/토큰 갱신 시 서버로 토큰 업서트
- [ ] 알림 탭 시 해당 업데이트 화면으로 딥링크 이동
- [ ] 포그라운드/백그라운드/종료 상태 수신 처리
- [ ] 알림 채널(업데이트, 장애, 공지) 분리

### 1-6. 운영/보안
- [ ] 키 로테이션 주기 정의(예: 90일)
- [ ] 키 유출 대응 런북 작성(폐기/재발급/배포)
- [ ] 개발/스테이징/운영 프로젝트 분리 운영
- [ ] 발송량 모니터링 및 실패율 알람 설정

---

## 2) EAS Update

### 2-1. 릴리스 정책
- [ ] 채널 전략 확정 (`dev`, `staging`, `production`)
- [ ] 브랜치-채널 매핑 확정 (`main -> production`, `develop -> staging`)
- [ ] `runtimeVersion` 정책 확정 (`appVersion` 또는 custom)
- [ ] 긴급 롤백 정책 문서화

### 2-2. 설정/인프라
- [ ] Expo/EAS 계정 및 프로젝트 연결
- [ ] `eas.json` 프로파일 정리(build/update 환경 분리)
- [ ] 환경변수 전략 확정 (`EXPO_PUBLIC_*`, secret vars)
- [ ] 업데이트 서명/무결성 정책 점검

### 2-3. 배포 워크플로우
- [ ] 프리릴리스 체크리스트 작성
  - [ ] 타입체크/린트/테스트
  - [ ] API 호환성 확인
  - [ ] 리그레션 스모크 테스트
- [ ] 배포 커맨드 표준화
  - [ ] `eas update --branch <branch> --message "<msg>"`
- [ ] 배포 후 검증 절차
  - [ ] 특정 기기 강제 새로고침/재시작 후 반영 확인
  - [ ] 오류율/크래시 모니터링

---

## 3) 앱 디자인

### 3-1. 디자인 시스템
- [ ] 다크 테마 기반 토큰 정의(색상/타이포/간격/라운드)
- [ ] 컴포넌트 규격 확정(카드/버튼/칩/배너/진행바)
- [ ] 상태 규칙 정의(설치/업데이트/최신/실패/대기)

### 3-2. 화면 개선
- [ ] 앱 리스트 카드 가독성 개선(아이콘, 버전, 용량, 액션 버튼)
- [ ] 검색 UX 개선(디바운스, empty state, no-result state)
- [ ] 업데이트 큐 패널 개선(단계/에러/재시도 정책 시각화)
- [ ] 온보딩(설치 허용/알림 권한) 안내 카피 및 동선 정리
- [ ] 태블릿(가로/세로) 반응형 레이아웃 최적화

### 3-3. 접근성/현지화
- [ ] 최소 터치 영역/폰트 크기 기준 준수
- [ ] 스크린리더 라벨 점검
- [ ] 한국어 기본 + 다국어 확장 구조 준비(i18n 키 분리)

---

## 4) 테스트

### 4-1. 자동화 테스트
- [ ] 유닛 테스트
  - [ ] 버전 비교/분류 로직
  - [ ] 다운로드 상태 전이 로직
  - [ ] 설치 큐 정책(중단/계속/재시도)
- [ ] 통합 테스트
  - [ ] API 응답 -> 앱 상태 반영
  - [ ] 다운로드/검증 실패 시 복구
- [ ] E2E(기기 기반) 시나리오
  - [ ] 신규 설치
  - [ ] 업데이트(USER_ACTION_NOT_REQUIRED 시도 + fallback)
  - [ ] 셀프 업데이트 후 복구

### 4-2. 수동 QA 체크리스트
- [ ] 네트워크 불안정(오프라인/저속)에서 재시도 확인
- [ ] 재부팅/앱 강제종료 후 큐 복구 확인
- [ ] 저장공간 부족/손상 APK 시 에러 메시지 확인
- [ ] 알 수 없는 앱 설치 허용 미설정 상태 fallback 확인
- [ ] 알림 권한 거부 상태 UX 확인

### 4-3. 릴리스 게이트
- [ ] P0/P1 버그 0건
- [ ] 치명적 크래시율 목표치 이하
- [ ] 설치 성공률/업데이트 성공률 목표치 달성
- [ ] 운영 로그/대시보드 확인 완료
