# core_dpc Device Owner 프로비저닝

## 대상
- 공장초기화 직후(Setup Wizard 단계) 기기
- AOSP 단말 기준 QR 프로비저닝

## 절차(요약)
1. 기기를 공장초기화 후 초기 설정 화면에서 QR 프로비저닝 진입
2. `/apps/core_dpc/provisioning/qr_payload.json` 구조로 QR 생성
3. QR 스캔 후 `core_dpc` 다운로드/설치
4. 설치 완료 후 Device Owner 설정 완료
5. `manager` 앱 실행 -> 설정 화면에서 `DO 상태 확인`

## 주의
- `android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM`는 APK SHA-256(Base64)로 정확히 설정
- 기존 운영 기기는 강제 전환하지 말고, 신규/초기화 기기부터 적용
- Device Owner 여부는 manager UI(`DO 상태 확인`) 또는 core_dpc 앱에서 확인
