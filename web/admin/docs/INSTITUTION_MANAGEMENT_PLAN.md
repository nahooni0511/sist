# web/admin 기관관리 기획안 (v0.1)

- 작성일: 2026-03-01
- 대상: `web/admin`, `api-server`
- 목적: 기관(납품처) 중심으로 운영 데이터를 관리하고, 기관별 납품 기기를 추적/운영할 수 있도록 한다.

## 1. 배경과 목표

현재 관리 콘솔은 `APK관리`, `기기관리`, `앱스토어 모니터` 중심이다.  
실제 운영은 "기관" 단위(예: 학교, 공원)로 계약/납품/유지보수가 진행되므로, 기관 중심 데이터 모델과 UI가 필요하다.

핵심 목표:

1. 기관 기본정보를 등록/조회/수정/상태관리할 수 있다.
2. 기관 타입별(현재: `학교`, `공원`)로 필요한 필드를 다르게 관리할 수 있다.
3. 기관별 납품 기기 이력(여러 기기 타입)을 관리할 수 있다.
4. 기존 `기기관리`와 양방향 연결되어 운영자가 빠르게 이동할 수 있다.
5. 기관별 계약 시작일/종료일(옵션)을 설정하고, 계약 기간에 따라 접근 권한을 제어할 수 있다.
6. 기관/기기 관련 주요 액션 로그(생성, 수정, 납품 등록, 납품 종료)를 추적할 수 있다.

## 2. 범위

### In Scope (MVP)

1. 메뉴에 `기관관리` 섹션 추가
2. 기관 목록/등록/상세(수정 포함)
3. 기관 타입: `학교`, `공원`
4. 타입별 필드 입력/검증
5. 기관-기기 납품 이력 등록/종료 및 이력 조회
6. 기기 신규 생성 시 기관 선택(옵션)으로 납품 이력 자동 생성
7. 기관 상세에서 미납품 기기(기관 미할당) 납품 등록
8. 액션 로그 기록 및 조회

## 3. IA / 라우팅 제안

`web/admin` 좌측 메뉴:

- APK관리 (`/apk`)
- 기기관리 (`/devices`)
- 앱스토어 모니터 (`/store`)
- 기관관리 (`/institutions`)  ← 신규

신규 페이지:

1. `GET /institutions` 기관 목록
2. `GET /institutions/new` 기관 등록
3. `GET /institutions/:institutionId` 기관 상세
4. `GET /institutions/:institutionId/edit` 기관 수정 (상세 내 인라인 편집으로 대체 가능)

기관 상세 탭:

1. 기본정보
2. 타입별 정보
3. 납품 기기
4. 액션 로그

## 4. 데이터 모델 제안

확장성을 위해 "타입별 동적 필드" 구조를 사용한다.

### 4.1 테이블 (초안)

1. `institution_types`
- `id` (PK)
- `code` (`SCHOOL`, `PARK`) unique
- `name` (`학교`, `공원`)
- `is_active`

2. `institution_type_fields`
- `id` (PK)
- `institution_type_id` (FK)
- `field_key` (예: `school_level`, `managing_agency`)
- `label`
- `data_type` (`TEXT`, `NUMBER`, `BOOLEAN`, `DATE`, `SELECT`)
- `is_required`
- `options_json` (SELECT 옵션)
- `sort_order`

3. `institutions`
- `id` (PK, UUID 권장)
- `name` (기관명, unique)
- `name`
- `institution_type_id` (FK)
- `status` (`ACTIVE`, `INACTIVE`, `PENDING`)
- `contact_name`
- `contact_phone`
- `address_road`
- `address_detail`
- `lat`, `lng`
- `memo`
- `contract_start_date` (옵션, `YYYY-MM-DD`)
- `contract_end_date` (옵션, `YYYY-MM-DD`, 종료일 미포함)
- `created_at`, `updated_at`

4. `institution_field_values`
- `institution_id` (FK)
- `institution_type_field_id` (FK)
- `value_text`
- `value_number`
- `value_bool`
- `value_date`
- PK (`institution_id`, `institution_type_field_id`)

5. `institution_device_deliveries`
- `id` (PK, UUID)
- `institution_id` (FK)
- `device_id` (FK: `devices.device_id`)
- `device_type_snapshot` (납품 당시 기기 타입 스냅샷)
- `delivered_at`
- `retrieved_at` (납품 종료/회수 시점, NULL이면 현재 납품중)
- `install_location` (기관 내 설치 위치)
- `memo`
- `created_at`, `updated_at`

6. `institution_action_logs`
- `id` (PK, UUID)
- `institution_id` (FK)
- `device_id` (nullable)
- `action_type` (`INSTITUTION_CREATED`, `INSTITUTION_UPDATED`, `DELIVERY_REGISTERED`, `DELIVERY_ENDED`, `DEVICE_CREATED_WITH_INSTITUTION`)
- `action_payload_json`
- `acted_by`
- `acted_at`

권장 규칙:

1. 한 기기는 동시에 하나의 기관에만 "납품중(= retrieved_at IS NULL)" 상태로 존재
2. 기관 변경은 기존 delivery 종료(`retrieved_at` 입력) 후 신규 delivery 생성으로 기록한다.
3. 기기 생성 시 `institutionId`가 전달되면 delivery 1건을 자동 생성한다.

## 5. 타입별 필드 정의 (초기안)

### 5.1 학교 (`SCHOOL`)

- `school_level` (필수, SELECT: 초/중/고/대/특수/기타)

### 5.2 공원 (`PARK`)

- `park_category` (필수, SELECT: 근린/어린이/체육/수변/기타)
- `managing_agency` (필수, TEXT)
- `park_area_m2` (선택, NUMBER)
- `operation_hours` (선택, TEXT)
- `zone_name` (선택, TEXT, 설치구역명)
- `night_lighting` (선택, BOOLEAN)

## 6. API 계약 초안

기존 패턴(`/admin/*`)과 동일하게 설계한다.

1. `GET /admin/institutions?query=&typeCode=&status=&hasActiveDevices=&page=&size=`
2. `POST /admin/institutions`
3. `GET /admin/institutions/:institutionId`
4. `PUT /admin/institutions/:institutionId`
5. `GET /admin/institutions/:institutionId/deliveries?status=ACTIVE|ENDED`
6. `POST /admin/institutions/:institutionId/deliveries` (미납품 기기 납품 등록)
7. `PATCH /admin/institutions/:institutionId/deliveries/:deliveryId/end`
8. `GET /admin/institution-types`
9. `GET /admin/institution-types/:typeCode/fields`
10. `GET /admin/institutions/:institutionId/logs?limit=`
11. `POST /admin/devices` (기존 API 확장: `institutionId?`, `deliveredAt?`, `installLocation?`)
12. `GET /admin/institution-logs?institutionId=&actionType=&deviceId=&limit=`
13. `POST /api/commands` 계약기간 제어 적용 (계약기간 외 `403`, `INSTITUTION_CONTRACT_DATE_DENIED`)

요청 예시 (`POST /admin/institutions`):

```json
{
  "name": "서울중앙초등학교",
  "typeCode": "SCHOOL",
  "status": "ACTIVE",
  "contactName": "홍길동",
  "contactPhone": "010-1234-5678",
  "addressRoad": "서울시 강남구 ...",
  "addressDetail": "체육관 1층",
  "lat": 37.4979,
  "lng": 127.0276,
  "contractStartDate": "2026-01-01",
  "contractEndDate": "2026-02-01",
  "fields": {
    "school_level": "초"
  }
}
```

정책 문구:

- 기관별 `contractStartDate` / `contractEndDate`은 옵션값이며, 값이 설정된 경우 계약 기간 내에서만 기기/서비스 접근 권한을 허용한다.
- 기준 정책은 `start <= 오늘 < end`(종료일 미포함)이며, 값이 비어있으면 기간 제한 없이 접근 가능으로 간주한다.
- 신규 기기 등록 시 `institutionId`가 함께 입력되면 해당 기관으로 납품 이력을 자동 생성한다.

요청 예시 (`POST /admin/institutions/:institutionId/deliveries`):

```json
{
  "deviceId": "park-0001",
  "deliveredAt": "2026-03-01T09:00:00.000Z",
  "installLocation": "운동장 입구 A존",
  "memo": "개통 완료"
}
```

요청 예시 (`POST /admin/devices`, 신규 기기 생성 시 기관 옵션 연결):

```json
{
  "deviceType": "시스트파크",
  "modelName": "SISTRUN-PARK-V2",
  "location": {
    "name": "서울중앙초 운동장",
    "lat": 37.4979,
    "lng": 127.0276
  },
  "institutionId": "inst_01J...",
  "deliveredAt": "2026-03-01T09:00:00.000Z",
  "installLocation": "운동장 입구 A존"
}
```

## 7. UI 상세 요구사항

### 7.1 기관 목록

- 컬럼: 기관명, 타입, 상태, 담당자, 연락처, 주소, 납품중 기기 수, 수정일
- 필터: 검색어(기관명/코드/담당자), 타입, 상태, 납품중 기기 유무
- 액션: 상세, 수정, 비활성화

### 7.2 기관 등록/수정

1. 공통 입력 폼
2. 타입 선택 시 타입별 폼 자동 렌더링
3. 시작시간/종료시간(옵션) 설정 UI 제공
4. 필수 필드 검증 및 에러 메시지

### 7.3 기관 상세 - 납품 기기 탭

- 납품중 기기 / 과거 납품 이력 구분
- 등록 액션: "납품 등록" 버튼 -> 모달에서 기관 미할당 기기 검색 후 등록
- 종료 액션: 납품 종료/회수 처리 (`retrieved_at` 기록)
- 컬럼: deviceId, deviceType, 상태(lastSeen), 설치위치, 납품일, 회수일, 메모

### 7.4 기기관리 연동

- 기기 상세 페이지에 "소속 기관" 표시 + 기관 상세로 이동 링크
- 기기 신규 등록 화면에서 기관 선택(옵션) 제공

### 7.5 액션 로그

- 기관 단위 로그 조회 가능
- 최소 기록 액션: 기관 생성, 기관 수정, 납품 등록, 납품 종료, 기기 생성(기관 포함)
- 로그 항목: 액션 종류, 대상(deviceId), 변경 요약(payload), 수행자, 시각

## 8. 구현 항목 제안

1. DB 스키마 추가 (`institution_*`, `institution_action_logs`)
2. `/admin/institutions*`, `/admin/institution-types*`, `/admin/institutions/:id/deliveries*`, `/admin/institutions/:id/logs` API 구현
3. `POST /admin/devices`에 `institutionId?` 기반 납품 이력 자동 생성 로직 추가
4. web/admin 라우트/메뉴/3개 화면(목록, 등록, 상세) + 기관 상세 내 납품 이력/로그 탭 구현

## 9. 마이그레이션/운영 고려사항

1. 기존 `devices.location_name`는 초기 백필 기준 데이터로 활용 가능
2. 백필 시 `location_name` 기준으로 기관 자동 생성은 오탐 가능성이 있어, 기본은 "수동 정제" 권장
3. 납품 이력 무결성을 위해 납품 등록/종료 변경은 트랜잭션 처리
4. 삭제 대신 `status=INACTIVE` 소프트 비활성화 권장

## 10. 완료 기준 (Definition of Done)

1. 학교/공원 기관 등록 및 조회/수정 가능
2. 타입별 필수 필드 검증 동작
3. 기기 신규 등록 시 기관 선택(옵션)으로 납품 이력 생성 가능
4. 기관 상세에서 기관 미할당 기기 납품 등록 및 납품 종료 처리 가능
5. 기기 상세에서 소속 기관 확인 가능
6. 기관/기기 데이터 정합성(중복 납품중 상태 방지) 보장
7. 기관 관련 액션 로그가 누락 없이 조회 가능
