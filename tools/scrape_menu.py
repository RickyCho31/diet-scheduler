"""이화여대 진선미관 주간 식단 스크래퍼 (공식 사이트 HTML → JSON).

사용: python tools/scrape_menu.py [YYYY-MM-DD ...]
  인자 없음: 이번 주 + 다음 주(있으면). 결과는 data/menu/<주 시작일>.json 과 data/menu/latest.json(최근 2주 병합).
"""
import html, json, os, re, sys, datetime, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data", "menu")
URL = "https://www.ewha.ac.kr/ewha/life/restaurant.do?mode=view&articleNo=903"
DAY_KO = ["월", "화", "수", "목", "금", "토", "일"]

def fetch(date=None):
    url = URL + (f"&srDt={date}" if date else "")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (DietScheduler menu bot)"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")

def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()

def parse(page):
    wrap = page[page.find('id="go-menu"'):]
    m = re.search(r'b-date-box.*?<span>(.*?)</span>', wrap, re.S)
    rng = re.findall(r"(\d{4}\.\d{2}\.\d{2})", m.group(1)) if m else []
    if len(rng) < 2:
        return None
    start = datetime.date.fromisoformat(rng[0].replace(".", "-"))
    days = []
    for i, block in enumerate(re.findall(r'<li class="b-menu-day[^"]*">(.*?)</li>', wrap, re.S)):
        d = start + datetime.timedelta(days=i)
        meals = {}
        for kind in ("breakfast", "lunch", "dinner"):
            mm = re.search(r'<div class="b-menu[^"]*\b' + kind + r'"[^>]*>(.*?)</div>', block, re.S)
            items = []
            if mm:
                pre = re.search(r"<pre>(.*?)</pre>", mm.group(1), re.S)
                if pre:
                    items = [html.unescape(x.strip()) for x in pre.group(1).splitlines() if x.strip()]
            items = [x for x in items if "운영 없습니다" not in x and "운영없습니다" not in x]
            meals[kind] = items
        days.append({"date": d.isoformat(), "dow": DAY_KO[d.weekday()], **meals})
    return {"week_start": start.isoformat(), "week_end": (start + datetime.timedelta(days=6)).isoformat(),
            "source": URL, "fetched_at": datetime.datetime.now().isoformat(timespec="seconds"), "days": days}

def has_menu(week):
    return week and any(d["lunch"] or d["dinner"] or d["breakfast"] for d in week["days"])

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    today = datetime.date.today()
    targets = sys.argv[1:] or [today.isoformat(), (today + datetime.timedelta(days=7)).isoformat()]
    for t in targets:
        week = parse(fetch(t))
        if not has_menu(week):
            print("no menu for week of", t, file=sys.stderr); continue
        path = os.path.join(OUT_DIR, week["week_start"] + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(week, f, ensure_ascii=False, indent=1)
        print("saved", path, file=sys.stderr)
    # latest.json = 최근 2개 주간 파일
    files = sorted(x for x in os.listdir(OUT_DIR) if re.match(r"\d{4}-\d{2}-\d{2}\.json$", x))
    weeks = [json.load(open(os.path.join(OUT_DIR, x), encoding="utf-8")) for x in files[-2:]]
    with open(os.path.join(OUT_DIR, "latest.json"), "w", encoding="utf-8") as f:
        json.dump({"updated_at": datetime.datetime.now().isoformat(timespec="seconds"), "weeks": weeks}, f, ensure_ascii=False, indent=1)
    print("latest.json:", [w["week_start"] for w in weeks], file=sys.stderr)

if __name__ == "__main__":
    main()
