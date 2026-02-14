# core_dpc

Device Owner(DPC) 역할 전용 앱.

## 책임
- Device Owner 상태 확인/기본 정책 적용
- PackageInstaller 세션 기반 무인 설치/업데이트/삭제
- manager 앱과 AIDL IPC 연동

## IPC
- AIDL: `com.sistrun.core_dpc.ipc.ICoreDpcService`
- 서비스 액션: `com.sistrun.core_dpc.BIND`
- 바인딩 권한: `com.sistrun.core_dpc.permission.BIND_CORE_DPC_SERVICE` (signature)

## 프로비저닝
- 문서: `/Users/nahooni0511/workspace/sistrun-hub/apps/core_dpc/PROVISIONING.md`
- QR payload 샘플: `/Users/nahooni0511/workspace/sistrun-hub/apps/core_dpc/provisioning/qr_payload.json`
