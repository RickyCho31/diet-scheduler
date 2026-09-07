# 설치 가이드

## 1. GitHub에 올리기 (한 번만)
1. GitHub에서 새 저장소 생성 (예: `diet-scheduler`, Public 또는 Private 모두 가능 — Private이면 Pages는 Pro 플랜 필요)
2. 이 폴더에서:
   ```bash
   git remote add origin https://github.com/<계정>/diet-scheduler.git
   git push -u origin main
   ```
3. 저장소 **Settings → Pages → Build and deployment → Source: Deploy from a branch**, Branch: `main` / `/ (root)` 저장
4. 1~2분 뒤 `https://<계정>.github.io/diet-scheduler/` 에서 앱이 열립니다.
5. **Settings → Actions → General → Workflow permissions**: "Read and write permissions" 선택 (식단 봇이 커밋할 수 있도록)
6. Actions 탭에서 "진선미관 식단 갱신" 워크플로를 한 번 수동 실행(Run workflow)해서 동작 확인

## 2. 폰에 설치
- **Galaxy (Chrome 또는 삼성 인터넷)**: 앱 주소 열기 → 메뉴(⋮) → "홈 화면에 추가" / "앱 설치"
- **iPhone (Safari)**: 앱 주소 열기 → 공유(□↑) → "홈 화면에 추가"
- 각자의 폰에 따로 설치하면 됩니다. 기록은 각 기기에만 저장됩니다(서로 섞이지 않음).

## 3. 첫 설정
설정 탭에서 이름·성별·나이·키·활동량·단백질 목표를 입력하고 저장. 오늘 탭에서 체중을 입력하면 목표 칼로리가 계산됩니다.
프로틴 파우더의 1스쿱 g/칼로리/단백질은 쓰는 제품 라벨대로 바꿔 주세요.

## 4. 체중 자동 기록 (선택)
앱 주소 뒤에 `?w=72.3` 처럼 붙여 열면 오늘 체중이 저장됩니다.
- iPhone: 단축어 "건강 샘플 찾기(체중, 최신 1개)" → "URL 열기" → 자동화(아침 시간 또는 Zepp Life 종료 시)
- Galaxy: openScale + openScale-sync(Webhook) 또는 MacroDroid로 Health Connect 체중 읽어 URL 열기
자세한 내용은 앱 설정 탭 하단과 `docs/research-weight-sync.md` 참고.

## 5. 로컬에서 테스트
```bash
python -m http.server 8765
```
후 http://127.0.0.1:8765/ 접속.

## 6. 데이터 갱신
- 식단: `python tools/scrape_menu.py` (Actions가 매일 자동 실행)
- 칼로리 DB 재생성: `python tools/fetch_mfds.py 15100070 data/raw/mfds_raw_15100070.jsonl.gz` 등으로 원본 수집 후 `python tools/build_fooddb.py`
