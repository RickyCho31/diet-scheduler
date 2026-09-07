// 목표 계산 + 끼니별 예산 자동 조절 + 진선미/도시락 결정 로직
import { MEALS } from './store.js';

export const NUTRS = ['kcal', 'carb', 'prot', 'fat', 'sugar', 'fiber', 'sodium'];
export const NUTR_LABEL = { kcal: '칼로리', carb: '탄수화물', prot: '단백질', fat: '지방', sugar: '당류', fiber: '식이섬유', sodium: '나트륨' };
export const NUTR_UNIT = { kcal: 'kcal', carb: 'g', prot: 'g', fat: 'g', sugar: 'g', fiber: 'g', sodium: 'mg' };

export function bmr(p, weightKg) {
  // Mifflin-St Jeor
  const base = 10 * weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'F' ? base - 161 : base + 5;
}

/**
 * 성별·나이 기반 권장값 (GLP-1/티르제파타이드 병용 식이의 일반 원칙)
 * - 하한: 여 1200 / 남 1500 kcal (의료진 감독 없는 초절식 금지 → 담석·췌장염·근손실 위험)
 * - 감량 속도: 0.5~1.0 kg/주가 안전 범위. 1.5 kg/주 초과가 지속되면 담석 위험 상승
 * - 단백질: 1.2~1.6 g/kg. 50세 이상은 근손실 예방을 위해 1.5 g/kg
 * - 지방: 총열량의 25~30% 이하. 고지방 한 끼는 위장 부작용·췌장 부담 → 튀김·크림류 줄이기
 */
export function recommended(profile) {
  const female = profile.sex === 'F';
  const senior = (profile.age || 40) >= 50;
  return {
    floorKcal: female ? 1200 : 1500,
    proteinPerKg: senior ? 1.5 : 1.4,
    pace: 0.6,
    paceMin: 0.4, paceMax: 1.0, paceDanger: 1.5,
    deficitMax: 1000,
    fatShare: 0.28, carbShare: 0.40,
    notes: [
      `하루 최소 ${female ? 1200 : 1500} kcal는 지키세요 (식욕이 없어도). 초절식은 담석·췌장염·근손실 위험을 키웁니다.`,
      '주 0.5~1.0 kg 감량이 안전 범위입니다. 주 1.5 kg 이상이 2주 넘게 이어지면 열량을 올리세요.',
      `단백질 ${senior ? 1.5 : 1.4} g/kg 이상, 매 끼니 20~30 g씩 나눠서. 근육을 지키는 핵심입니다.`,
      '기름진 한 끼(튀김·크림·삼겹살)는 메스꺼움과 췌장 부담을 키웁니다. 지방은 총열량의 30% 이하로.',
      '물 1.5~2 L, 식이섬유 25 g. 상복부 통증이 심하거나 지속되면 즉시 진료.',
    ],
  };
}

export function targets(profile, weightKg) {
  const w = weightKg || 70;
  const rec = recommended(profile);
  const b = bmr(profile, w);
  const tdee = b * (profile.activity || 1.375);
  const pace = Math.min(rec.paceMax, Math.max(rec.paceMin, profile.pace || rec.pace));
  const deficitWanted = Math.min(rec.deficitMax, Math.round((pace * 7700) / 7));
  let kcal, mode, floored = false;
  if (profile.goalKcal) { kcal = profile.goalKcal; mode = 'manual'; }
  else { kcal = tdee - deficitWanted; mode = 'auto'; }
  if (kcal < rec.floorKcal && mode === 'auto') { kcal = rec.floorKcal; floored = true; }
  kcal = Math.round(kcal / 10) * 10;
  const deficit = Math.round(tdee - kcal);
  const expectedPace = Math.round(((deficit * 7) / 7700) * 100) / 100;
  const ppk = profile.proteinPerKg || rec.proteinPerKg;
  const prot = Math.round(w * ppk);
  return {
    kcal, prot, bmr: Math.round(b), tdee: Math.round(tdee), deficit, expectedPace, pace, mode, floored, floorKcal: rec.floorKcal, ppk,
    carb: Math.round((kcal * rec.carbShare) / 4), fat: Math.round((kcal * rec.fatShare) / 9),
    fiber: 25, sodium: 2000, sugar: Math.round((kcal * 0.08) / 4),
    belowFloor: kcal < rec.floorKcal,
  };
}

/** 최근 체중 기록으로 주당 감량 속도 추정 (최소제곱 기울기). 반환 kg/주, 데이터 부족 시 null */
export function weightTrend(weights, endIso, days = 14) {
  const pts = Object.keys(weights).filter((k) => k <= endIso).sort().slice(-60)
    .map((k) => ({ t: (new Date(k + 'T12:00:00') - new Date(endIso + 'T12:00:00')) / 86400000, kg: weights[k] }))
    .filter((p) => p.t >= -days);
  if (pts.length < 3 || (pts[pts.length - 1].t - pts[0].t) < 5) return null;
  const n = pts.length, mt = pts.reduce((a, p) => a + p.t, 0) / n, mk = pts.reduce((a, p) => a + p.kg, 0) / n;
  const slope = pts.reduce((a, p) => a + (p.t - mt) * (p.kg - mk), 0) / pts.reduce((a, p) => a + (p.t - mt) ** 2, 0);
  return { perWeek: Math.round(slope * 7 * 100) / 100, n, span: Math.round(pts[pts.length - 1].t - pts[0].t) };
}

/** 로그 항목들의 실제 섭취 합계 (portion 반영) */
export function sumItems(items) {
  const out = Object.fromEntries(NUTRS.map((k) => [k, 0]));
  for (const it of items || []) {
    const p = it.portion ?? 1;
    for (const k of NUTRS) if (it[k] != null) out[k] += it[k] * p;
  }
  for (const k of NUTRS) out[k] = Math.round(out[k] * 10) / 10;
  out.kcal = Math.round(out.kcal);
  return out;
}

export function mealTotal(log) {
  if (!log || !log.items) return sumItems([]);
  return sumItems(log.items);
}

export function dayTotal(day) {
  const acc = Object.fromEntries(NUTRS.map((k) => [k, 0]));
  for (const m of MEALS) {
    const t = mealTotal(day.meals[m]);
    for (const k of NUTRS) acc[k] += t[k];
  }
  for (const k of NUTRS) acc[k] = Math.round(acc[k] * 10) / 10;
  acc.kcal = Math.round(acc.kcal);
  return acc;
}

/**
 * 끼니별 예산. 이미 기록된 끼니는 실제값, 남은 끼니는 남은 예산을 비율로 재분배.
 * 각 끼니는 기본 배분의 0.55~1.4배로 제한 (한 끼에 몰아먹기 방지), 초과분은 다음 끼니로 이월.
 */
export function mealBudgets(day, tg, profile) {
  const split = profile.split;
  const logged = {};
  let consumedK = 0, consumedP = 0;
  for (const m of MEALS) {
    const log = day.meals[m];
    if (log && log.source) {
      const t = mealTotal(log);
      logged[m] = t; consumedK += t.kcal; consumedP += t.prot;
    }
  }
  const remainingMeals = MEALS.filter((m) => !logged[m]);
  const remainK = tg.kcal - consumedK;
  const remainP = tg.prot - consumedP;
  const shareSum = remainingMeals.reduce((a, m) => a + split[m], 0) || 1;
  const out = {};
  let carryK = 0, carryP = 0;
  remainingMeals.forEach((m, idx) => {
    const base = tg.kcal * split[m];
    const baseP = tg.prot * split[m];
    let k = (remainK * split[m]) / shareSum + carryK;
    let p = (remainP * split[m]) / shareSum + carryP;
    const lo = base * 0.55, hi = base * 1.4;
    const isLast = idx === remainingMeals.length - 1;
    if (!isLast) {
      const clamped = Math.min(hi, Math.max(lo, k));
      carryK = k - clamped; k = clamped;
      const cp = Math.min(baseP * 1.6, Math.max(baseP * 0.5, p));
      carryP = p - cp; p = cp;
    }
    out[m] = { kcal: Math.max(0, Math.round(k)), prot: Math.max(0, Math.round(p)), base: Math.round(base), over: k < lo * 0.6 };
  });
  for (const m of MEALS) if (logged[m]) out[m] = { kcal: logged[m].kcal, prot: logged[m].prot, base: Math.round(tg.kcal * split[m]), logged: true };
  return { budgets: out, consumed: { kcal: consumedK, prot: Math.round(consumedP) }, remaining: { kcal: remainK, prot: Math.round(remainP) } };
}

export const PORTIONS = [0, 0.25, 0.33, 0.5, 1];
export const PORTION_LABEL = { 0: '0', 0.25: '¼', 0.33: '⅓', 0.5: '½', 1: '정량' };

/**
 * 진선미 메뉴(추정 영양)와 예산으로 결정.
 * 반환: {verdict:'ok'|'partial'|'lunchbox', estKcal, plan:[{name, portion}], planKcal}
 */
export function decideCafeteria(items, budgetKcal, budgetProt) {
  if (!items || !items.length) return null;
  const full = items.reduce((a, it) => a + it.kcal, 0);
  const fullP = items.reduce((a, it) => a + (it.prot || 0), 0);
  const limit = budgetKcal * 1.08;
  if (full <= limit) return { verdict: 'ok', estKcal: full, estProt: Math.round(fullP), plan: items.map((it) => ({ name: it.name, portion: 1 })), planKcal: full };
  // 줄이기 순서: 후식/음료 → 밥/면/탄수 → 튀김 → 국 → 나머지 (단백질 메인은 마지막)
  const order = { dessert: 0, drink: 0, starchy: 1, rice: 1, 'rice-dish': 1, noodle: 1, fried: 2, soup: 3, side: 4, namul: 4, salad: 5, kimchi: 5, fruit: 5, 'protein-side': 6, main: 7 };
  const plan = items.map((it) => ({ name: it.name, portion: 1, kcal: it.kcal, kind: it.kind || 'side' }));
  const steps = [0.5, 0.33, 0.25, 0];
  let cur = full;
  for (const step of steps) {
    const sorted = [...plan].sort((a, b) => (order[a.kind] ?? 4) - (order[b.kind] ?? 4) || b.kcal - a.kcal);
    for (const p of sorted) {
      if (cur <= limit) break;
      if (p.kind === 'main' && step < 0.5) continue;  // 단백질 메인은 절반까지만
      if (p.kcal < 60) continue;                        // 숭늉·김치처럼 작은 항목은 줄여도 의미 없음
      if (p.portion > step) { cur -= p.kcal * (p.portion - step); p.portion = step; }
    }
    if (cur <= limit) break;
  }
  const planKcal = Math.round(cur);
  const reducedCount = plan.filter((p) => p.portion < 1).length;
  const verdict = cur <= limit && full <= budgetKcal * 1.9 && reducedCount <= Math.ceil(plan.length / 2) ? 'partial' : 'lunchbox';
  return { verdict, estKcal: Math.round(full), estProt: Math.round(fullP), plan: plan.map(({ name, portion }) => ({ name, portion })), planKcal };
}

/** 간식(프로틴 쉐이크 + 견과) 자동 산정 */
export function snackPlan(budget, profile, expectedDinnerProt = 0) {
  const sh = profile.shake, nuts = profile.nuts;
  const protGap = Math.max(0, budget.prot);
  let scoops = Math.min(sh.maxScoops, Math.max(0, Math.round((protGap / sh.protPerScoop) * 2) / 2));
  if (budget.kcal < sh.kcalPerScoop * 0.6) scoops = Math.min(scoops, 0.5);
  if (scoops === 0 && budget.prot >= 8) scoops = 0.5;
  let kcalLeft = budget.kcal - scoops * sh.kcalPerScoop;
  let nutsG = 0;
  if (kcalLeft >= 150) nutsG = 25; else if (kcalLeft >= 100) nutsG = 15; else if (kcalLeft >= 60) nutsG = 10;
  return { scoops, nutsG, kcal: Math.round(scoops * sh.kcalPerScoop + (nutsG / 10) * nuts.kcalPer10g), prot: Math.round(scoops * sh.protPerScoop + (nutsG / 10) * nuts.protPer10g) };
}

export function pct(a, b) { return b ? Math.min(999, Math.round((a / b) * 100)) : 0; }
