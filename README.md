# Diet Scheduler

마운자로 다이어트용 개인 식단 앱. 이화여대 진선미관 주간 식단을 매일 자동으로 가져오고,
아침·점심·간식·저녁을 **먹은 양에 따라 자동 조절**해서 "오늘 뭘 얼마나 먹을지"를 대신 결정해 줍니다.
안드로이드(Galaxy)와 iPhone 모두 브라우저에서 "홈 화면에 추가"로 설치하는 PWA입니다.

## 구성
| 경로 | 역할 |
|---|---|
| `index.html`, `js/`, `css/`, `sw.js`, `manifest.webmanifest` | PWA 앱 본체 (빌드 없이 그대로 배포) |
| `data/foods.json` | 식약처 통합DB 기반 칼로리 DB (28,522개, 음식·원재료·가공식품) |
| `data/menu/latest.json` | 진선미관 주간 식단 (GitHub Actions가 매일 갱신) |
| `tools/scrape_menu.py` | 식단 스크래퍼 |
| `tools/fetch_mfds.py`, `tools/build_fooddb.py` | 칼로리 DB 수집·변환 |
| `.github/workflows/menu.yml` | 매일 07:00 KST 식단 갱신 |
| `docs/` | 조사 노트, 설치 가이드 |

## 배포 & 설치
[docs/SETUP.md](docs/SETUP.md) 참고 (GitHub Pages에 올리고 두 폰에서 홈 화면에 추가).

## 데이터 출처
- 식단: 이화여자대학교 식당 안내 페이지 (진·선·미관)
- 칼로리: 식품의약품안전처 식품영양성분 통합DB 표준데이터셋(공공데이터포털, 이용허락 제한 없음), 농촌진흥청 국가표준식품성분표
- 추천 식단 영양값은 재료 대표값 기준 추정치입니다. 이 앱은 의료 조언이 아닙니다.
