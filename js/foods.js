// 식약처 통합DB 로딩 + 검색 + 진선미 메뉴명 매칭
import { choseong, isChoseongOnly, norm } from './hangul.js';

let DB = null;      // {rows:[...], index:[{n, c, i}]}
let loading = null;

export const F = { name: 0, brand: 1, cat: 2, unit: 3, serving: 4, kcal: 5, carb: 6, prot: 7, fat: 8, sugar: 9, fiber: 10, sodium: 11 };

export function loadFoods() {
  if (DB) return Promise.resolve(DB);
  if (loading) return loading;
  loading = fetch('data/foods.json').then((r) => r.json()).then((j) => {
    const rows = j.rows;
    const index = rows.map((r, i) => { const n = norm(r[F.name]) + (r[F.brand] ? '|' + norm(r[F.brand]) : ''); return { n, c: choseong(n), i }; });
    DB = { rows, index, meta: j._meta };
    return DB;
  });
  return loading;
}

export function foodsReady() { return !!DB; }

/** row → 1인분(또는 지정 g) 기준 영양 객체 */
export function nutrientsFor(row, grams) {
  const g = grams ?? row[F.serving] ?? 100;
  const k = g / 100;
  const v = (i) => (row[i] == null ? null : Math.round(row[i] * k * 10) / 10);
  return {
    name: row[F.name] + (row[F.brand] ? ` (${row[F.brand]})` : ''),
    grams: g, unit: row[F.unit],
    kcal: Math.round((row[F.kcal] || 0) * k),
    carb: v(F.carb), prot: v(F.prot), fat: v(F.fat), sugar: v(F.sugar), fiber: v(F.fiber), sodium: v(F.sodium),
    src: 'db',
  };
}

const CAT_ORDER = { D: 0, P: 1, R: 2 };

export function searchFoods(q, limit = 30) {
  if (!DB) return [];
  const tokens = q.trim().split(/\s+/).map(norm).filter(Boolean);
  if (!tokens.length) return [];
  const toks = tokens.map((t) => ({ t, cho: isChoseongOnly(t) }));
  const hits = [];
  for (const e of DB.index) {
    let score = 0;
    for (const { t, cho } of toks) {
      const p = cho ? e.c.indexOf(t) : e.n.indexOf(t);
      if (p < 0) { score = -1; break; }
      score += (p === 0 ? 0 : 5) + e.n.length / 100;
    }
    if (score >= 0) {
      const row = DB.rows[e.i];
      score += CAT_ORDER[row[F.cat]] * 2 + (row[F.brand] ? 1 : 0);
      hits.push({ score, row });
      if (hits.length > 4000) break;
    }
  }
  hits.sort((a, b) => a.score - b.score);
  return hits.slice(0, limit).map((h) => h.row);
}

/* ---------- 진선미 메뉴명 → 칼로리 추정 ---------- */
const PORTION_RULES = [
  // [정규식, 기본 제공량(g/ml), 분류, 폴백 100g당 kcal/carb/prot/fat/sodium]
  [/(나물밥|영양밥|콩나물밥|곤드레|버섯밥|굴밥|무밥)/, 250, 'rice-dish', [150, 30, 4, 1.5, 200]],
  [/(볶음밥|덮밥|비빔밥|카레라이스|오므라이스|리조또|국밥|김밥|주먹밥)/, 300, 'rice-dish', [150, 24, 5, 4, 300]],
  [/(밥|잡곡|현미|흑미|기장|보리)$/, 200, 'rice', [160, 35, 3, 0.5, 5]],
  [/(우동|라면|국수|파스타|스파게티|짬뽕|짜장|냉면|칼국수|쫄면|비빔면|막국수|소바|떡국|만둣국)/, 450, 'noodle', [110, 18, 4, 2, 300]],
  [/(국|탕|찌개|전골|스프|수프|개장|곰탕|설렁탕|순두부|스튜)$/, 250, 'soup', [35, 3, 2.5, 1.5, 300]],
  [/(숭늉|식혜|수정과|음료|주스|차)$/, 150, 'drink', [15, 3.5, 0.2, 0, 5]],
  [/(견과류강정|견과강정|땅콩강정|쌀강정|멸치강정|콩강정)/, 40, 'dessert', [450, 45, 10, 25, 200]],
  [/(까스|카츠|튀김|강정|탕수|치킨|너겟|후라이드|프라이|텐더|돈가스|돈까스|깐풍|유린기|사모사|고로케|크로켓|만두|춘권|핫도그)/, 130, 'fried', [250, 18, 15, 14, 400]],
  [/(채볶음|버섯볶음|나물|무침|숙주|시금치|콩나물|취나물|고사리|도라지|미나리|부추|지짐$|겉절이)/, 60, 'namul', [70, 6, 2.5, 4, 350]],
  [/(구이|스테이크|불고기|제육|두루치기|볶음|장조림|조림|찜|갈비|수육|보쌈|편육|함박|미트볼|떡갈비|동그랑땡|전$|부침|계란말이|오믈렛|소시지|햄|떡볶이|잡채|마파|카레$|커리$)/, 120, 'main', [170, 8, 14, 9, 450]],
  [/(김치|깍두기|석박지|총각|백김치|열무)/, 40, 'kimchi', [25, 4, 1.5, 0.3, 600]],
  [/(샐러드|쌈채소|생채|피클|단무지)/, 70, 'salad', [45, 6, 1.5, 1.5, 150]],
  [/(두부|계란|달걀|어묵|오뎅|묵)/, 100, 'protein-side', [110, 5, 8, 6, 350]],
  [/(과일|사과|바나나|귤|오렌지|수박|포도|방울토마토|키위|파인애플|멜론|배$|딸기)/, 80, 'fruit', [55, 13, 0.6, 0.2, 2]],
  [/(요구르트|요거트|우유|두유|푸딩|케이크|쿠키|떡|빵|과자|아이스크림|젤리)/, 80, 'dessert', [180, 28, 4, 6, 120]],
  [/(감자|고구마|옥수수|단호박)/, 100, 'starchy', [110, 25, 2, 0.5, 100]],
];
const DEFAULT_RULE = [null, 80, 'side', [90, 8, 4, 4, 300]];

export function cleanMenuName(raw) {
  let s = raw.replace(/\*.*$/, '');          // 소스/드레싱 표기 제거 (새우까스*머스타드S)
  s = s.replace(/\(.*?\)/g, '').replace(/[&/+]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

export function classifyMenuItem(raw) {
  const name = cleanMenuName(raw);
  for (const [re, grams, kind, fb] of PORTION_RULES) if (re.test(name)) return { name, grams, kind, fb };
  return { name, grams: DEFAULT_RULE[1], kind: DEFAULT_RULE[2], fb: DEFAULT_RULE[3] };
}

/** 메뉴명으로 DB(음식 분류)에서 가장 가까운 항목 찾기 */
export function matchMenuItem(raw) {
  const cls = classifyMenuItem(raw);
  let best = null;
  if (DB) {
    const target = norm(cls.name);
    const wantUnit = (cls.kind === 'soup' || cls.kind === 'drink') ? 'ml' : 'g';
    const unitPenalty = (row) => (row[F.unit] === wantUnit ? 0 : 1);
    let bestScore = 1e9;
    const consider = (row, sc) => { sc += unitPenalty(row) * 0.5; if (sc < bestScore) { bestScore = sc; best = row; } };
    for (const e of DB.index) {
      const row = DB.rows[e.i];
      if (row[F.cat] !== 'D' || row[F.brand]) continue;
      const flat = e.n.replace(/_/g, '');
      if (e.n === target || flat === target) { consider(row, 0); continue; }
      if (target.length < 3) continue;
      if (e.k === undefined) e.k = classifyMenuItem(row[F.name]).kind;   // 분류는 행마다 한 번만 계산
      if (e.k !== cls.kind) continue;                                     // 부분 일치는 같은 분류끼리만 (김치볶음밥 ≠ 김치볶음)
      const base = e.n.split('_')[0];
      if (base === target) { consider(row, 2 + (e.n.length - target.length) / 10); continue; }          // 김치찌개_돼지고기
      if (flat.includes(target)) { consider(row, 4 + (flat.length - target.length) / 10); continue; }   // 돌솥비빔밥 ⊂ 돌솥비빔밥_양념장
      if (base.length >= 4 && target.includes(base)) consider(row, 6 + (target.length - base.length) / 10); // 옥수수김치볶음밥 ⊃ 김치볶음밥
    }
    if (bestScore > 8) best = null;
  }
  const grams = cls.grams;
  if (best) {
    const n = nutrientsFor(best, grams);
    n.name = raw; n.est = true; n.match = best[F.name]; n.kind = cls.kind;
    return n;
  }
  const [k, c, p, f, na] = cls.fb;
  const r = grams / 100;
  return { name: raw, grams, unit: 'g', kcal: Math.round(k * r), carb: +(c * r).toFixed(1), prot: +(p * r).toFixed(1), fat: +(f * r).toFixed(1), sugar: null, fiber: null, sodium: Math.round(na * r), est: true, match: null, kind: cls.kind, src: 'fallback' };
}
