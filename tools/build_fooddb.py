"""식약처 통합DB 원본(jsonl.gz) → 앱용 압축 JSON(data/foods.json).

행 형식: [name, brand, cat, unit, serving, kcal, carb, prot, fat, sugar, fiber, sodium]
 - 영양값은 100g(또는 100ml) 기준. serving = 1인분(g/ml) 또는 null.
 - cat: D=음식(외식 포함), R=원재료, P=가공식품
 - 같은 (이름, 브랜드)의 중복 행은 최신(CRT_YMD) 1건만 유지.
사용: python tools/build_fooddb.py [가공식품 원본 경로(선택)]
"""
import gzip, json, re, sys, collections, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "foods.json")

def load(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        next(f)
        for line in f:
            yield json.loads(line)

def num(v, nd=1):
    try:
        if v in (None, ""): return None
        x = float(v)
        return round(x, nd) if nd else int(round(x))
    except ValueError:
        return None

def size_num(v):
    """'230g' / '300ml' / '201.7' / '80ml(g)' → 숫자, 없으면 None"""
    if not v: return None
    m = re.match(r"\s*([0-9]+(?:\.[0-9]+)?)", str(v))
    return round(float(m.group(1)), 1) if m else None

def clean_name(nm):
    nm = re.sub(r"\s+", " ", nm or "").strip()
    return nm

# 가공식품 중 앱에 유용한 분류만 (레토르트/간편식 대체품 탐색용)
P_KEEP_LV4 = {"두부", "두유", "햄", "소시지", "양념육", "식육간편조리", "기타 식육가공품", "샐러드", "도시락",
              "주먹밥/김밥/초밥", "밥류", "죽", "국/탕류", "찌개/전골류", "반찬", "만두", "시리얼", "견과류",
              "견과류 가공품", "발효유", "농후발효유", "우유", "가공우유", "치즈", "체중조절용 조제식품",
              "기타 즉석식품", "즉석 면요리", "라면", "어묵", "어육가공품", "두류가공품", "샌드위치", "김",
              "곡물빵", "식빵", "베이글", "떡", "액상커피", "탄산수", "달걀", "알가공품"}
P_KEEP_LV3 = {"알가공품류", "두부류 또는 묵류", "특수영양식품"}

def main():
    rows = []
    seen = {}
    def add(r, cat, brand=None):
        name = clean_name(r.get("FOOD_NM"))
        if not name: return
        key = (cat, name.replace(" ", ""), brand or "")
        ymd = r.get("CRT_YMD") or ""
        rec = [name, brand, cat,
               "ml" if (r.get("NUT_CON_SRTR_QUA") or "").endswith("ml") else "g",
               size_num(r.get("SERV_SIZE")) or size_num(r.get("FOOD_SIZE")),
               num(r.get("ENERC"), 0), num(r.get("CHOCDF")), num(r.get("PROT")), num(r.get("FATCE")),
               num(r.get("SUGAR")), num(r.get("FIBTG")), num(r.get("NAT"), 0)]
        if rec[5] is None: return
        if key in seen and seen[key][0] >= ymd: return
        seen[key] = (ymd, rec)

    for r in load(os.path.join(RAW, "mfds_raw_15100070.jsonl.gz")):
        brand = r.get("REST_NM")
        if brand in (None, "", "해당없음"): brand = None
        add(r, "D", brand)
    for r in load(os.path.join(RAW, "mfds_raw_15100065.jsonl.gz")):
        add(r, "R")
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        for r in load(sys.argv[1]):
            if r.get("FOOD_LV4_NM") in P_KEEP_LV4 or r.get("FOOD_LV3_NM") in P_KEEP_LV3:
                add(r, "P", (r.get("MFR_NM") or None))
    rows = [v[1] for v in seen.values()]
    rows.sort(key=lambda x: (x[2], x[0]))
    # 원재료/가공식품에는 1인분이 없으므로 대표 1회 제공량 기본값(앱에서 재조정 가능)
    cats = collections.Counter(x[2] for x in rows)
    out = {"_meta": {"source": "식품의약품안전처 식품영양성분 통합DB 표준데이터셋(음식/원재료/가공식품), 농촌진흥청 국가표준식품성분표",
                     "fields": ["name", "brand", "cat", "unit", "serving", "kcal", "carb", "prot", "fat", "sugar", "fiber", "sodium"],
                     "basis": "영양값은 100g/100ml 기준", "counts": dict(cats)},
           "rows": rows}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("rows", len(rows), dict(cats), "bytes", os.path.getsize(OUT))

if __name__ == "__main__":
    main()
