"""data.go.kr 표준데이터셋(식약처 식품영양성분 통합DB)을 JSON 엔드포인트로 전체 수집.

사용: python tools/fetch_mfds.py 15100070 out.jsonl.gz
  15100070 음식 / 15100065 원재료성식품 / 15100066 가공식품(약 30만 행, 큼)
브라우저 다운로드 버튼이 내부적으로 호출하는 /download/columList.json + /download/standard.json 을 그대로 사용.
"""
import gzip, json, sys, time, urllib.request, urllib.parse, http.cookiejar

BASE = "https://www.data.go.kr"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128"

def main(pk: str, out: str):
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    ref = f"{BASE}/data/{pk}/standard.do"
    op.open(urllib.request.Request(ref, headers={"User-Agent": UA})).read()
    hdrs = {"User-Agent": UA, "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01", "Referer": ref}
    def get(url):
        for attempt in range(5):
            try:
                return json.load(op.open(urllib.request.Request(url, headers=hdrs), timeout=180))
            except Exception as e:
                print("retry", attempt, e, file=sys.stderr); time.sleep(3 * (attempt + 1))
        raise SystemExit("failed: " + url)
    h = get(f"{BASE}/download/columList.json?pk={pk}&ext=CSV")
    cols = [(c["columCode"], c["columNm"]) for c in h["columList"]]
    total = int(h["totalCount"]); per = 10000
    print(pk, h["fileName"], "total", total, "cols", len(cols), file=sys.stderr)
    with gzip.open(out, "wt", encoding="utf-8") as f:
        f.write(json.dumps({"_meta": {"pk": pk, "fileName": h["fileName"], "total": total, "cols": cols}}, ensure_ascii=False) + "\n")
        pages = (total + per - 1) // per
        for page in range(1, pages + 1):
            q = [("publicDataPk", pk), ("totalCount", total), ("svcTableNm", h["tableVO"]["svcTableNm"]),
                 ("perPage", per), ("page", page)] + [("colNmList", c) for c in h["tableVO"]["colNmList"]]
            rows = get(f"{BASE}/download/standard.json?" + urllib.parse.urlencode(q))
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
            print(f"  page {page}/{pages}: {len(rows)} rows", file=sys.stderr)
            time.sleep(0.5)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
