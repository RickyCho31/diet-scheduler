# 조사: 진선미관 식단 출처 (2026-09-07)

## 결론
- **공식 출처**: https://www.ewha.ac.kr/ewha/life/restaurant.do?mode=view&articleNo=903 (`#go-menu`)
- 서버 렌더링 HTML, JS 불필요, 로그인 불필요, robots.txt 허용. RSS/JSON API 없음.
- **칼로리/영양 정보 없음** → 메뉴명으로 칼로리 DB 매칭 필요.
- 주 단위 갱신(월~일). 다음 주는 월요일 시점에 미게시 → 매일 1회 스크래핑이 안전.

## HTML 구조
- `div.b-menu-wrap#go-menu`
  - `div.b-date-box > span` : `2026.09.07 ~ 2026.09.13`
  - `li.b-menu-day` × 7
    - `div.b-day` : `월 (09.07)`
    - `div.b-menu.b-menu-b.breakfast` (진선미관은 비어 있음)
    - `div.b-menu.b-menu-l.lunch` / `div.b-menu.b-menu-d.dinner`
      - `p.m-title` (`- 중식 -`), `pre` (한 줄에 메뉴 하나)
- `*` 뒤는 소스/드레싱 (`S`=소스, `D`=드레싱). 예: `새우까스*머스타드S`, `그린샐러드*키위D`
- 일요일 미운영. 방학 중엔 `<pre>운영 없습니다.</pre>`.
- 주 선택: `&srDt=YYYY-MM-DD` (해당 날짜가 포함된 주). 2024-09까지 과거 데이터 확인됨.
- "다음" 링크는 항상 `disabled` → `<pre>` 존재 여부로 판단.

## 기타
- 다른 식당: I-House 339841, 공대식당 905, 한우리집 899, E-House 201동 900 (같은 구조).
- 에브리타임/캠퍼스픽/학식앱/생협 사이트: 확인 불가 또는 미제공.
