# 기관관리 MVP TODO PLAN

- 작성일: 2026-03-02
- 적용 대상: `web/admin`, `api-server`

## 목표

- [ ] 기관 중심 운영 관리(학교/공원) 기능을 관리자 콘솔에서 제공한다.
- [ ] 기관별 납품 이력과 액션 로그를 추적 가능하게 한다.
- [ ] 기기 생성 시 기관 선택(옵션) 경로와 기관 상세의 미납품 기기 등록 경로를 모두 제공한다.
- [ ] 기관 계약 기간(`YYYY-MM-DD`) 기반 접근 제어를 서버에서 강제한다.

## 범위

- [ ] 기관 타입/타입별 필드 정의 조회 API
- [ ] 기관 목록/등록/수정/상세 API
- [ ] 기관 납품 이력 등록/종료/조회 API
- [ ] 기관 로그(기관별/글로벌) API
- [ ] 미납품 기기 조회 API
- [ ] `POST /admin/devices` 기관 옵션 확장
- [ ] `POST /api/commands` 기관 계약기간 강제
- [ ] web/admin 기관관리 메뉴/화면 구현

## 확정 정책

- [ ] 기관 타입 필드 저장은 동적 테이블(`institution_type_fields`, `institution_field_values`) 사용
- [ ] 기관명(`name`) unique 제약
- [ ] 계약일 포맷은 `YYYY-MM-DD`, 기준 타임존은 `Asia/Seoul`
- [ ] 계약기간 정책: 둘다없음 허용, `start <= 오늘 < end`(종료일 미포함), 단일 경계(start-only/end-only) 지원
- [ ] 기기 생성 시 `institutionId`만 전달되면 `deliveredAt`은 서버 현재시각 자동값
- [ ] 기관 납품 등록 대상은 현재 미납품(active delivery 없음) 기기만 제공
- [ ] 액션 로그 payload는 `before/after diff + 핵심 메타` 저장
- [ ] 기관 삭제 API는 미구현, `status=INACTIVE` 운영

## API 체크리스트

- [ ] `GET /admin/institution-types`
- [ ] `GET /admin/institution-types/:typeCode/fields`
- [ ] `GET /admin/institutions`
- [ ] `POST /admin/institutions`
- [ ] `GET /admin/institutions/:institutionId`
- [ ] `PUT /admin/institutions/:institutionId`
- [ ] `GET /admin/institutions/:institutionId/deliveries`
- [ ] `POST /admin/institutions/:institutionId/deliveries`
- [ ] `PATCH /admin/institutions/:institutionId/deliveries/:deliveryId/end`
- [ ] `GET /admin/institutions/:institutionId/logs`
- [ ] `GET /admin/institution-logs`
- [ ] `GET /admin/institutions/unassigned-devices`
- [ ] `POST /admin/devices` 확장 필드(`institutionId`, `deliveredAt`, `installLocation`, `deliveryMemo`)
- [ ] `GET /admin/devices/:deviceId` 확장 응답(`activeInstitution`, `activeDelivery`)
- [ ] `POST /api/commands` 계약기간 외 접근 차단(403 + `INSTITUTION_CONTRACT_DATE_DENIED`)

## DB 체크리스트

- [ ] `institution_types` 생성
- [ ] `institution_type_fields` 생성
- [ ] `institutions` 생성
- [ ] `institution_field_values` 생성
- [ ] `institution_device_deliveries` 생성
- [ ] `institution_action_logs` 생성
- [ ] active delivery unique 제약(`uq_active_delivery_device`) 적용
- [ ] 인덱스(`idx_deliveries_*`, `idx_logs_*`, `idx_institutions_*`) 적용
- [ ] institution 기본 타입 seed(`SCHOOL`, `PARK`) 반영
- [ ] institution 타입별 기본 필드 seed 반영

## web/admin 체크리스트

- [ ] 사이드바 메뉴에 `기관관리` 추가
- [ ] 라우트 추가: `/institutions`, `/institutions/new`, `/institutions/:institutionId`, `/institutions/:institutionId/edit`, `/institutions/logs`
- [ ] 기관 목록 페이지 구현(필터/검색/상세/수정 이동)
- [ ] 기관 등록/수정 공용 폼 구현(타입별 동적 필드 포함)
- [ ] 기관 상세 페이지 구현(기본정보/납품이력/로그 탭)
- [ ] 기관 상세에서 미납품 기기 납품 등록 UI 구현
- [ ] 기관 상세에서 납품 종료 액션 구현
- [ ] 기관 글로벌 로그 페이지 구현
- [ ] 기기 생성 페이지에 기관 선택(옵션) + 납품 정보 입력 추가
- [ ] 기기 상세 페이지에 소속 기관/납품 정보 표시
- [ ] 계약기간 403 에러 메시지 사용자 친화적으로 표시

## 테스트 체크리스트

- [ ] 기관 등록 성공(`SCHOOL`, 필수필드 충족)
- [ ] 기관 등록 실패(필수 동적 필드 누락)
- [ ] 기관 등록 실패(`contractStartDate` 형식 오류)
- [ ] 기관 수정 성공 + 로그 diff 생성 확인
- [ ] 기관명 중복 시 409(`INSTITUTION_NAME_CONFLICT`)
- [ ] 기기 생성(기관 미선택) 시 납품 이력 미생성
- [ ] 기기 생성(기관 선택) 시 납품 이력/로그 자동생성
- [ ] 기관 상세 납품 등록 시 미납품 기기만 노출
- [ ] 중복 납품 등록 차단(`DEVICE_ALREADY_DELIVERED`)
- [ ] 납품 종료 성공(`retrieved_at` 기록 + 로그)
- [ ] 계약기간(시작/종료 모두 설정) 차단/허용 검증
- [ ] 계약기간(start-only) 차단/허용 검증
- [ ] 계약기간(end-only) 차단/허용 검증
- [ ] 기관별 로그 필터 정확성 검증
- [ ] 글로벌 로그 필터 조합(`institutionId`, `deviceId`, `actionType`) 검증
- [ ] web/admin E2E 흐름(목록→등록/수정→상세→납품등록/종료→로그) 검증
- [ ] 타입체크 통과(`api-server`, `web/admin` `tsc --noEmit`)

## 릴리스 체크리스트

- [ ] DDL 반영 후 서버 기동 시 에러 없는지 확인
- [ ] institution seed 데이터 생성 확인
- [ ] web/admin 배포 후 라우팅/메뉴 동작 확인
- [ ] 샘플 기관 2건(학교/공원) 생성 검증
- [ ] 샘플 기기 2건으로 두 경로 검증(기기생성 기관옵션, 기관상세 미납품등록)
- [ ] 계약기간 외 명령 차단 정책이 계약 데이터와 일치하는지 확인

## DoD 매핑

- [ ] DoD-1: 학교/공원 기관 등록/조회/수정 가능
- [ ] DoD-2: 타입별 필수 필드 검증 동작
- [ ] DoD-3: 기기 신규 등록 시 기관 선택(옵션)으로 납품 이력 생성 가능
- [ ] DoD-4: 기관 상세에서 미납품 기기 납품 등록 및 납품 종료 가능
- [ ] DoD-5: 기기 상세에서 소속 기관 확인 가능
- [ ] DoD-6: 중복 납품중 상태 방지 정합성 보장
- [ ] DoD-7: 기관 액션 로그 누락 없이 조회 가능
