// 추천 식단(아침/도시락/간식/레토르트) 라이브러리. 영양값은 100g(ml) 기준 재료표에서 계산.
// 재료값 출처: 식약처 통합DB/농진청 성분표 대표값을 반올림한 근사치 (앱 내 표기: 추정)

export const ING = {
  // name: [kcal, carb, prot, fat, sugar, fiber, sodium] per 100 g/ml
  오트밀: [375, 66, 13, 7, 1, 10, 5],
  무가당두유: [40, 2, 3.6, 2.2, 0.5, 0.5, 60],
  두유190: [65, 6, 4, 3, 4, 0.5, 70],
  그릭요거트: [65, 4, 9, 1.5, 3.5, 0, 40],
  바나나: [89, 23, 1.1, 0.3, 12, 2.6, 1],
  블루베리: [57, 14, 0.7, 0.3, 10, 2.4, 1],
  치아씨드: [486, 42, 17, 31, 0, 34, 16],
  아몬드: [594, 20, 23, 51, 4, 11, 2],
  견과믹스: [600, 20, 18, 52, 4, 8, 5],
  삶은계란: [143, 0.7, 12.6, 9.5, 0.7, 0, 140],
  닭가슴살: [110, 2, 22, 1.5, 1, 0, 450],
  닭가슴살소시지: [130, 4, 20, 4, 1, 0, 600],
  현미밥: [170, 38, 3, 0.5, 0, 2, 3],
  즉석현미밥: [160, 35, 3, 0.7, 0, 1.5, 5],
  연두부: [50, 2.5, 5, 2.5, 0.5, 0.3, 5],
  두부: [84, 3, 8, 5, 0.5, 1, 5],
  방울토마토: [20, 4, 1, 0.2, 2.5, 1.2, 5],
  오이: [12, 2.5, 0.7, 0.1, 1.5, 0.5, 2],
  양상추: [14, 3, 1, 0.2, 1, 1, 10],
  브로콜리: [35, 7, 3, 0.4, 1.5, 3, 30],
  냉동야채: [60, 12, 2.5, 0.5, 3, 3, 40],
  고구마: [130, 30, 1.5, 0.2, 8, 3, 15],
  단호박: [60, 14, 1.5, 0.2, 5, 2, 1],
  참치캔: [116, 0, 26, 1, 0, 0, 350],
  새우: [99, 0.2, 24, 0.3, 0, 0, 200],
  병아리콩: [164, 27, 9, 2.6, 5, 7, 250],
  파프리카: [26, 6, 1, 0.2, 4, 2, 3],
  김치: [18, 3, 1, 0.3, 1.5, 1.5, 500],
  올리브오일: [900, 0, 0, 100, 0, 0, 0],
  참기름: [900, 0, 0, 100, 0, 0, 0],
  간장: [55, 8, 6, 0, 3, 0, 5500],
  고추장: [190, 42, 4, 1, 25, 3, 2500],
  발사믹: [88, 17, 0.5, 0, 15, 0, 20],
  김: [350, 40, 40, 4, 1, 30, 600],
  사과: [52, 14, 0.3, 0.2, 10, 2.4, 1],
  저지방우유: [42, 5, 3.4, 1, 5, 0, 45],
  프로틴바: [380, 35, 30, 12, 8, 8, 300],
  누룽지: [380, 82, 7, 1, 0, 1, 5],
  편의점샐러드: [90, 6, 10, 3, 3, 2, 300],
  훈제연어: [117, 0, 18, 4.3, 0, 0, 800],
  카레레토르트: [95, 12, 2.5, 4, 3, 1.5, 450],
  계란흰자: [52, 0.7, 11, 0.2, 0.7, 0, 160],
};

const LABEL = { 두유190: '두유 1팩', 무가당두유: '무가당 두유', 삶은계란: '삶은 계란', 닭가슴살: '훈제 닭가슴살', 닭가슴살소시지: '닭가슴살 소시지', 즉석현미밥: '즉석 현미밥', 냉동야채: '냉동 야채믹스', 견과믹스: '견과류', 편의점샐러드: '편의점 샐러드', 카레레토르트: '레토르트 카레', 참치캔: '참치캔(기름 뺀)' };
const LIQUID = /(두유|우유|음료)/;

function nut(name, g) {
  const v = ING[name];
  const k = g / 100;
  return { name, grams: g, unit: LIQUID.test(name) ? 'ml' : 'g', kcal: Math.round(v[0] * k), carb: +(v[1] * k).toFixed(1), prot: +(v[2] * k).toFixed(1), fat: +(v[3] * k).toFixed(1), sugar: +(v[4] * k).toFixed(1), fiber: +(v[5] * k).toFixed(1), sodium: Math.round(v[6] * k) };
}

/** 레시피를 배율(scale)로 확대/축소하여 재료·영양 반환. 고정 재료(fixed:true)와 액체(팩 단위)는 스케일 제외 */
export function buildRecipe(recipe, scale = 1) {
  const parts = recipe.ing.map(([name, g, opts]) => ({ ...nut(name, Math.round(g * (((opts && opts.fixed) || LIQUID.test(name)) ? 1 : scale))), label: (opts && opts.label) || LABEL[name] || name }));
  const total = parts.reduce((a, p) => { for (const k of ['kcal', 'carb', 'prot', 'fat', 'sugar', 'fiber', 'sodium']) a[k] = +((a[k] || 0) + p[k]).toFixed(1); return a; }, {});
  total.kcal = Math.round(total.kcal);
  return { id: recipe.id, title: recipe.title, parts, total, steps: recipe.steps, prep: recipe.prep, tags: recipe.tags || [], scale };
}

/** 예산에 맞는 배율 (0.6~1.3, 0.05 단위) */
export function scaleFor(recipe, budgetKcal) {
  const base = buildRecipe(recipe, 1).total.kcal;
  if (!base) return 1;
  const s = Math.max(0.6, Math.min(1.2, budgetKcal / base));
  return Math.round(s * 20) / 20;
}

export function baseKcal(recipe) { return buildRecipe(recipe, 1).total.kcal; }

export const BREAKFAST = [
  { id: 'b-oats', title: '오버나이트 오트밀', tags: ['전날준비'], prep: '전날 밤: 오트밀+두유+치아씨드를 통에 섞어 냉장. 아침에 블루베리 올려 바로.',
    ing: [['오트밀', 40], ['무가당두유', 190, { fixed: true }], ['치아씨드', 6], ['블루베리', 50]],
    steps: ['밀폐용기에 오트밀·치아씨드를 넣고 두유를 붓는다', '냉장고에서 하룻밤(6시간 이상)', '아침에 블루베리(냉동 가능)를 올린다', '단백질이 부족한 날은 프로틴 ½스쿱을 섞어도 됨'] },
  { id: 'b-greek', title: '그릭요거트 오트볼', tags: ['5분'], prep: '재료만 있으면 아침에 바로. 바나나는 전날 사두기.',
    ing: [['그릭요거트', 150], ['오트밀', 20], ['바나나', 60], ['아몬드', 10]],
    steps: ['그릇에 그릭요거트를 담는다', '오트밀·바나나 슬라이스·아몬드를 올린다'] },
  { id: 'b-egg', title: '삶은계란 + 두유 + 토마토', tags: ['전날준비'], prep: '전날 계란 2~3개 삶아 냉장. 아침엔 까기만.',
    ing: [['삶은계란', 100], ['두유190', 190], ['방울토마토', 100]],
    steps: ['계란은 끓는 물 10분 → 찬물', '두유 1팩, 방울토마토 한 줌과 함께'] },
];

export const LUNCHBOX = [
  { id: 'l-chicken', title: '닭가슴살 현미 도시락', tags: ['전날준비', '10분'], prep: '전날: 현미밥 소분, 닭가슴살 해동, 브로콜리 데쳐서 통에 담기.',
    ing: [['현미밥', 120], ['닭가슴살', 100], ['브로콜리', 80], ['방울토마토', 80], ['김치', 30]],
    steps: ['현미밥은 즉석밥 ½~⅔ 또는 소분한 밥', '훈제/수비드 닭가슴살은 데우기만', '브로콜리는 끓는 물 1분 데치기', '김치는 물기 빼고 조금만'] },
  { id: 'l-tofu-egg', title: '두부 계란 덮밥', tags: ['10분'], prep: '두부는 키친타월로 물기만 빼두기. 밥은 소분.',
    ing: [['현미밥', 100], ['두부', 150], ['삶은계란', 50, { label: '계란 1개' }], ['냉동야채', 80], ['간장', 8], ['참기름', 3]],
    steps: ['팬에 두부를 1cm로 썰어 굽는다(기름 최소)', '계란 1개 스크램블 또는 프라이', '냉동야채 볶아 밥 위에 두부·계란과 올리고 간장·참기름'] },
  { id: 'l-tuna', title: '참치 야채 비빔밥', tags: ['전날준비', '5분'], prep: '전날: 오이·파프리카 썰어 통에. 참치캔·고추장은 당일.',
    ing: [['현미밥', 100], ['참치캔', 85], ['오이', 60], ['파프리카', 50], ['삶은계란', 50, { label: '계란 1개' }], ['고추장', 10], ['참기름', 3]],
    steps: ['참치는 기름을 꼭 짠다', '밥 위에 채소·참치·계란, 고추장 1작은술', '참기름 몇 방울 넣고 비빔'] },
  { id: 'l-sweet', title: '고구마 닭가슴살 샐러드', tags: ['전날준비'], prep: '전날: 고구마 찌고 닭가슴살 준비. 드레싱은 먹기 직전.',
    ing: [['고구마', 150], ['닭가슴살', 100], ['양상추', 80], ['파프리카', 50], ['발사믹', 10], ['올리브오일', 4]],
    steps: ['고구마는 전자레인지 5~6분 또는 찜', '양상추·파프리카 위에 닭가슴살·고구마', '발사믹+올리브오일 살짝'] },
  { id: 'l-yeondubu', title: '연두부 새우 샐러드', tags: ['5분', '가벼움'], prep: '연두부·냉동새우만 있으면 됨. 저녁 가볍게 갈 때 추천.',
    ing: [['연두부', 250], ['새우', 80], ['양상추', 60], ['방울토마토', 80], ['간장', 8], ['참기름', 3]],
    steps: ['냉동새우는 끓는 물 2분', '연두부 위에 새우·채소', '간장+참기름(+식초) 드레싱'] },
  { id: 'l-fried-rice', title: '계란 야채 볶음밥(저유)', tags: ['10분'], prep: '냉동야채·계란·밥만. 전날 만들어 도시락통에 넣어도 됨.',
    ing: [['현미밥', 120], ['삶은계란', 100, { label: '계란 2개' }], ['냉동야채', 100], ['올리브오일', 5], ['김', 2]],
    steps: ['팬에 기름 1작은술, 냉동야채 볶기', '계란 2개 풀어 스크램블', '밥 넣고 소금 약간, 김가루'] },
  { id: 'l-pumpkin', title: '단호박 그릭요거트 볼', tags: ['가벼움', '전날준비'], prep: '단호박 쪄서 냉장. 저녁 예산이 적은 날.',
    ing: [['단호박', 200], ['그릭요거트', 100], ['견과믹스', 10]],
    steps: ['단호박은 씨 빼고 전자레인지 6~7분', '그릭요거트·견과 올리기'] },
  { id: 'l-sausage', title: '닭가슴살 소시지 병아리콩 볼', tags: ['5분', '전날준비'], prep: '병아리콩 통조림, 소시지, 채소만.',
    ing: [['닭가슴살소시지', 100], ['병아리콩', 100], ['방울토마토', 80], ['오이', 60], ['올리브오일', 4]],
    steps: ['소시지는 전자레인지 40초', '병아리콩은 물기 빼고 채소와 섞기', '올리브오일·후추'] },
];

// 레토르트/간편 대체품 (항상 함께 제시). unitG = 1개 분량
export const RETORT = [
  { id: 'r-yeondubu', name: '연두부 1팩(300g) + 간장', ing: [['연두부', 300], ['간장', 5]], role: 'protein' },
  { id: 'r-chicken', name: '훈제 닭가슴살 1팩(100g)', ing: [['닭가슴살', 100]], role: 'protein' },
  { id: 'r-sausage', name: '닭가슴살 소시지 1개(70g)', ing: [['닭가슴살소시지', 70]], role: 'protein' },
  { id: 'r-egg', name: '삶은계란 2개', ing: [['삶은계란', 100]], role: 'protein' },
  { id: 'r-soymilk', name: '두유 1팩(190ml)', ing: [['두유190', 190]], role: 'protein' },
  { id: 'r-greek', name: '그릭요거트 1컵(100g)', ing: [['그릭요거트', 100]], role: 'protein' },
  { id: 'r-rice', name: '즉석 현미밥 ½개(105g)', ing: [['즉석현미밥', 105]], role: 'carb' },
  { id: 'r-sweet', name: '찐 고구마 1개(150g)', ing: [['고구마', 150]], role: 'carb' },
  { id: 'r-nurungji', name: '컵누룽지 1개(40g)', ing: [['누룽지', 40]], role: 'carb' },
  { id: 'r-salad', name: '편의점 닭가슴살 샐러드(200g)', ing: [['편의점샐러드', 200]], role: 'meal' },
  { id: 'r-tomato', name: '방울토마토 한 줌(100g)', ing: [['방울토마토', 100]], role: 'veg' },
  { id: 'r-bar', name: '프로틴바 1개(50g)', ing: [['프로틴바', 50]], role: 'protein' },
];

export function retortItem(r) {
  const parts = r.ing.map(([n, g]) => nut(n, g));
  const t = parts.reduce((a, p) => { for (const k of ['kcal', 'carb', 'prot', 'fat', 'sugar', 'fiber', 'sodium']) a[k] = +((a[k] || 0) + p[k]).toFixed(1); return a; }, {});
  t.kcal = Math.round(t.kcal);
  return { id: r.id, name: r.name, role: r.role, ...t, grams: parts.reduce((a, p) => a + p.grams, 0) };
}

const RETORT_KIND = { 'r-yeondubu': 'tofu', 'r-chicken': 'chicken', 'r-sausage': 'chicken', 'r-egg': 'egg', 'r-soymilk': 'soy', 'r-greek': 'dairy', 'r-bar': 'bar' };

/** 예산에 맞는 레토르트 조합 제안 (단백질 1~2종 + 탄수 0~1 + 채소). 날짜로 조금씩 바뀜 */
export function retortCombo(budget, iso = '') {
  const items = RETORT.map(retortItem);
  const seed = [...iso].reduce((a, c) => a + c.charCodeAt(0), 0);
  const prot = items.filter((i) => i.role === 'protein' && i.id !== 'r-bar').sort((a, b) => b.prot / b.kcal - a.prot / a.kcal);
  // 첫 단백질: 밀도 상위 3개 중 날짜 기반 선택
  const top = prot.slice(0, 3);
  const first = top[seed % top.length];
  const pick = [first];
  let k = first.kcal, p = first.prot;
  const kinds = new Set([RETORT_KIND[first.id]]);
  for (const it of prot) {
    if (p >= budget.prot * 0.8 || pick.length >= 2) break;
    if (kinds.has(RETORT_KIND[it.id])) continue;
    if (k + it.kcal <= budget.kcal * 0.8) { pick.push(it); k += it.kcal; p += it.prot; kinds.add(RETORT_KIND[it.id]); }
  }
  const carb = items.filter((i) => i.role === 'carb').sort((a, b) => a.kcal - b.kcal);
  const fitting = carb.filter((it) => k + it.kcal <= budget.kcal);
  if (fitting.length) { const c = fitting[fitting.length - 1]; pick.push(c); k += c.kcal; }
  const veg = items.find((i) => i.role === 'veg');
  if (veg && k + veg.kcal <= budget.kcal + 20) { pick.push(veg); k += veg.kcal; }
  return pick;
}

/** 도시락 선택: 최근 3일과 겹치지 않는 후보 중 예산에 가까운 상위 3개에서 날짜 기반 선택 */
export function pickLunchbox(iso, meal, recentIds = [], budgetKcal = 500) {
  let pool = LUNCHBOX.filter((r) => !recentIds.includes(r.id));
  if (pool.length < 3) pool = LUNCHBOX;
  const ranked = pool.map((r) => ({ r, d: Math.abs(baseKcal(r) - budgetKcal) })).sort((a, b) => a.d - b.d).slice(0, 3);
  const seed = [...iso].reduce((a, c) => a + c.charCodeAt(0), 0) + (meal === 'd' ? 7 : 0);
  return ranked[seed % ranked.length].r;
}

export function findRecipe(id) { return [...BREAKFAST, ...LUNCHBOX].find((r) => r.id === id); }
