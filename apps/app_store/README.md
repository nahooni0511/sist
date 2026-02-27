# Sistrun App Store (Expo)

태블릿/모바일용 APK 스토어 앱입니다.

## 기능
- 앱 리스트 조회 (`GET /api/apps`)
- 앱 검색 (이름/패키지/앱ID)
- 설치 버튼 (`받기`)
- 업데이트 버튼 (`업데이트`)
- 설치 상태 필터 (`전체`, `업데이트`, `설치됨`)

## 실행
```bash
cd /Users/nahooni0511/workspace/sistrun-hub/apps/app_store
npm install
npm run android
```

## API 서버 주소
- 기본값
  - Android Emulator: `http://10.0.2.2:4000`
  - iOS/Web: `http://localhost:4000`
- 환경변수로 변경
```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:4000 npm run android
```

## 설치/업데이트 동작
- Android에서 APK를 앱 내부 캐시에 다운로드 후 설치 인텐트를 실행합니다.
- 설치 권한(알 수 없는 앱 설치 허용)이 필요할 수 있습니다.
