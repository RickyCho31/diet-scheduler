# 조사: 표준 칼로리/영양 DB (2026-09-07)

## 결론
- **식약처 식품영양성분 통합DB 표준데이터셋**(data.go.kr)이 최적. CSV 다운로드, 이용허락 제한 없음(출처 표기).
  - 음식(외식·프랜차이즈 포함) 15100070 : ~2만 행, CSV 한 번에 다운로드 가능 (5만 행 제한 이내)
  - 원재료성식품 15100065 : ~3.6천 행 (= 농진청 국가표준식품성분표 10.4 축약본)
  - 가공식품 15100066 : ~30만 행 → data.go.kr 그리드 5만 행 제한. 전체는 K-FIND xlsx(192MB) 또는 API.
  - 식품영양성분DB 통합 자료집 15047698 : 548개 실측 외식 메뉴 xlsx (품질 높음)
- 컬럼: 에너지(kcal), 탄수화물, 단백질, 지방, 당류, 식이섬유, 나트륨, 칼슘, 철, 칼륨, 콜레스테롤, 포화지방 등 24개. 100g 기준 + 1인분/식품중량 참고.
- **Open API(apis.data.go.kr)는 CORS 미지원** → 정적 웹앱에서 직접 호출 불가. 프록시 필요.
- 별도 "외식영양성분 DB"는 없음 → 음식 데이터셋에 통합됨.
- 피할 것: 15112364 (공공누리 4유형, 상업/변경 불가).

## 권장 구현
1. CSV 오프라인 다운로드 → Python으로 큐레이션(수천 행) → 압축 JSON으로 앱에 번들.
2. 클라이언트 검색: 초성 검색 지원 (MiniSearch/FlexSearch 또는 자체 구현).
3. 나중에 전체 30만 가공식품 검색이 필요하면 Cloudflare Worker 프록시로 API 호출.
4. 출처 표기: "식품의약품안전처 식품영양성분 통합DB, 농촌진흥청 국가표준식품성분표 DB 10.x"

## 링크
- https://www.data.go.kr/data/15100070/standard.do (음식)
- https://www.data.go.kr/data/15100065/standard.do (원재료)
- https://www.data.go.kr/data/15100066/standard.do (가공식품)
- https://www.data.go.kr/data/15047698/fileData.do (자료집 548)
- https://various.foodsafetykorea.go.kr/nutrient/general/down/historyList.do (K-FIND 전체 xlsx)
- API: https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02 (serviceKey 필요, 10k/day)
