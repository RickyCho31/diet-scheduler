# 조사: 체중 자동 기록 (2026-09-07)

## 결론
- **PWA(웹앱)는 삼성헬스 / Health Connect / 애플건강을 직접 읽을 수 없음** (네이티브 SDK만 존재).
- iOS Safari는 Web Bluetooth 미지원. 안드로이드 Chrome은 지원(수동 탭 필요).
- Mi Body Composition Scale 2는 Zepp Life 전용. Zepp Life(안드로이드)는 Health Connect 미지원(Google Fit만, 2026년 말 종료 예정). iOS Zepp Life는 애플건강에 체중 기록함.
- 윈마이(Yunmai): iOS 애플건강 기록 OK. 안드로이드 삼성헬스 연동은 2020년부터 사실상 고장.

## 권장 경로 (노력 낮은 순)
1. **PWA 유지 + URL로 체중 전달** (백엔드 불필요)
   - iPhone: 애플건강 → 단축어 자동화("건강 샘플 찾기: 체중, 최근 1개" → "URL 열기" `https://<앱주소>/?w=72.3`). 잠금 상태에선 건강 데이터 접근 불가 → 평소 폰을 보는 시간대에 트리거하거나 "Zepp Life 종료 시" 트리거.
   - Fold 7: **openScale + openScale-sync** (Mi Scale 2를 BLE로 직접 읽음, Zepp Life 불필요, 측정 시 Webhook/Health Connect 자동 기록) 또는 Tasker/MacroDroid로 Health Connect 읽어 URL 열기.
2. Capacitor 래핑 + `@capgo/capacitor-health` (HealthKit + Health Connect 읽기). 앱 열 때 최신 체중 읽음. 개인용 사이드로드/TestFlight.
3. PWA에 Web Bluetooth "지금 측정" 버튼 (안드로이드 전용, 수동).

## 참고
- openScale: https://github.com/oliexdev/openScale , openScale-sync: https://github.com/oliexdev/openScale-sync
- HC Webhook: https://github.com/mcnaveen/health-connect-webhook
- @capgo/capacitor-health: https://github.com/Cap-go/capacitor-health
- 삼성헬스 → Health Connect 체중 동기화: https://developer.samsung.com/health/blog/en/accessing-samsung-health-data-through-health-connect
