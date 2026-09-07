// Diet Scheduler — UI
import { store, MEALS, MEAL_NAME, addDays, localDate } from './store.js';
import { targets, mealBudgets, decideCafeteria, snackPlan, sumItems, mealTotal, dayTotal, PORTIONS, PORTION_LABEL, NUTRS, NUTR_LABEL, NUTR_UNIT, pct } from './nutrition.js';
import { BREAKFAST, LUNCHBOX, RETORT, buildRecipe, scaleFor, retortItem, retortCombo, pickLunchbox, findRecipe } from './plans.js';
import { loadFoods, foodsReady, searchFoods, nutrientsFor, matchMenuItem, F } from './foods.js';
import { loadMenu, menuFor, cafeteriaItems, menuData, weekStarting } from './menu.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (x) => (x == null ? '-' : Math.round(x * 10) / 10);
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDate = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`; };

const ui = { tab: 'today', date: store.today(), panel: null, draft: null, menuWeek: null, foodsLoaded: false, menuLoaded: false };

/* ---------------- 부트 ---------------- */
async function boot() {
  store.load();
  handleWeightParam();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  loadMenu().then(() => { ui.menuLoaded = true; render(); });
  loadFoods().then(() => { ui.foodsLoaded = true; render(); }).catch(() => toast('음식 DB를 불러오지 못했습니다'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ui.date !== store.today()) { ui.date = store.today(); render(); } });
}

function handleWeightParam() {
  const u = new URL(location.href);
  const w = parseFloat(u.searchParams.get('w') || u.searchParams.get('weight'));
  if (w > 20 && w < 300) {
    const date = u.searchParams.get('d') || store.today();
    store.setWeight(date, w);
    toast(`체중 ${w}kg 기록됨 (${date})`);
    u.searchParams.delete('w'); u.searchParams.delete('weight'); u.searchParams.delete('d');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  }
}

function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, ms);
}

function modal(html) {
  const m = $('#modal'); $('.modal-body', m).innerHTML = html + '<div class="btns"><button class="btn block" data-action="modal-close">닫기</button></div>'; m.hidden = false;
}
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-action="modal-close"]')) $('#modal').hidden = true; });

/* ---------------- 공통 계산 ---------------- */
function ctx(iso) {
  const day = store.day(iso);
  const p = store.state.profile;
  const w = store.latestWeight(iso);
  const tg = targets(p, w ? w.kg : null);
  const mb = mealBudgets(day, tg, p);
  return { day, p, w, tg, ...mb, total: dayTotal(day) };
}

function recentLunchboxIds(iso, n = 3) {
  const ids = [];
  for (let i = 1; i <= n; i++) {
    const d = store.state.days[addDays(iso, -i)];
    if (!d) continue;
    for (const m of ['l', 'd']) { const id = d.plan?.[m] || d.meals?.[m]?.recipeId; if (id) ids.push(id); }
  }
  return ids;
}

function plannedRecipe(iso, meal, budgetKcal) {
  const day = store.day(iso);
  let rec = findRecipe(day.plan[meal]);
  if (!rec) {
    rec = meal === 'b' ? BREAKFAST[[...iso].reduce((a, c) => a + c.charCodeAt(0), 0) % BREAKFAST.length] : pickLunchbox(iso, meal, recentLunchboxIds(iso), budgetKcal);
    day.plan[meal] = rec.id; store.save();   // 한 번 정해진 계획은 고정 (내일 화면과 오늘 화면이 같도록)
  }
  return buildRecipe(rec, scaleFor(rec, budgetKcal));
}

/* ---------------- 렌더 ---------------- */
function render() {
  const p = store.state.profile;
  $('#who').textContent = p.name ? `${p.name} · ${fmtDate(ui.date)}` : fmtDate(ui.date);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
  const view = $('#view');
  view.innerHTML = { today: viewToday, tomorrow: viewTomorrow, menu: viewMenu, stats: viewStats, settings: viewSettings }[ui.tab]();
  if (ui.panel && ui.tab === 'today') { const el = $(`#panel-${ui.panel.meal}`); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

/* ===== 오늘 ===== */
function viewToday() {
  const iso = ui.date;
  const c = ctx(iso);
  const over = c.total.kcal > c.tg.kcal;
  let h = `<div class="card">
    <div class="row between"><h1 class="tight">${esc(fmtDate(iso))} ${iso === store.today() ? '오늘' : ''}</h1>
      <div class="row"><input class="inline" type="number" step="0.1" inputmode="decimal" id="w-in" placeholder="체중 kg" value="${store.state.weights[iso] ?? ''}"><button class="btn sm" data-action="save-weight">저장</button></div></div>
    <div class="muted">${c.w ? `최근 체중 ${c.w.kg}kg (${fmtDate(c.w.date)})` : '체중을 입력하면 목표가 계산됩니다'} · 목표 ${c.tg.kcal}kcal · 단백질 ${c.tg.prot}g</div>
    <div style="margin-top:8px" class="kv"><span>칼로리 ${c.total.kcal} / ${c.tg.kcal}</span><span class="${over ? 'chip bad' : 'chip'}">${over ? '초과 ' + (c.total.kcal - c.tg.kcal) : '남음 ' + (c.tg.kcal - c.total.kcal)}</span></div>
    <div class="bar ${over ? 'over' : ''}"><i style="width:${Math.min(100, pct(c.total.kcal, c.tg.kcal))}%"></i></div>
    <div style="margin-top:6px" class="kv"><span>단백질 ${r1(c.total.prot)} / ${c.tg.prot}g</span><span class="chip">${pct(c.total.prot, c.tg.prot)}%</span></div>
    <div class="bar prot"><i style="width:${Math.min(100, pct(c.total.prot, c.tg.prot))}%"></i></div>
    <div class="muted small" style="margin-top:6px">탄 ${r1(c.total.carb)}g · 지 ${r1(c.total.fat)}g · 섬유 ${r1(c.total.fiber)}g · 나트륨 ${Math.round(c.total.sodium)}mg</div>
  </div>`;
  for (const m of MEALS) h += mealCard(iso, m, c);
  h += `<div class="card"><label class="f">메모<textarea id="note" rows="2" placeholder="오늘 컨디션, 부작용, 특이사항">${esc(c.day.note || '')}</textarea></label><button class="btn sm" data-action="save-note">메모 저장</button></div>`;
  return h;
}

function mealCard(iso, m, c) {
  const log = c.day.meals[m];
  const b = c.budgets[m];
  const title = MEAL_NAME[m];
  const walk = (m === 'l' || m === 'd') ? `<div class="row" style="margin-top:8px"><button class="toggle ${c.day.walks[m] ? 'on' : ''}" data-action="walk" data-meal="${m}">${c.day.walks[m] ? '✓' : '○'} 식후 15분 산책</button></div>` : '';
  let body = '';
  if (log && log.source) {
    const t = mealTotal(log);
    body = `<div class="row between"><span class="chip ok">${srcLabel(log.source)}${log.done ? ' · 권고대로' : ''}</span><span class="muted">${t.kcal} kcal · 단백질 ${r1(t.prot)}g</span></div>
      <ul class="list">${(log.items || []).map((it) => `<li><span class="name">${esc(it.name)}<span class="sub">${it.grams ? Math.round(it.grams * (it.portion ?? 1)) + (it.unit === 'ml' ? 'ml' : 'g') + ' · ' : ''}${Math.round(it.kcal * (it.portion ?? 1))} kcal${it.est ? ' (추정)' : ''}</span></span><span class="chip">${PORTION_LABEL[it.portion ?? 1] || (it.portion ?? 1)}</span></li>`).join('')}</ul>
      <div class="btns"><button class="btn sm" data-action="edit" data-meal="${m}">수정</button><button class="btn sm ghost" data-action="unlog" data-meal="${m}">기록 취소</button></div>`;
  } else {
    body = recommendBlock(iso, m, c);
  }
  const panel = ui.panel && ui.panel.meal === m && ui.date === iso ? `<div class="panel" id="panel-${m}">${panelHTML(iso, m, c)}</div>` : '';
  return `<div class="card ${log && log.source ? 'logged' : ''}"><div class="row between"><h2 class="tight">${title}</h2><span class="chip">${log && log.source ? '섭취 ' + b.kcal + ' kcal' : '예산 ' + b.kcal + ' kcal · 단백질 ' + b.prot + 'g'}</span></div>${body}${panel}${walk}</div>`;
}

function srcLabel(s) { return { plan: '추천 식단', jsm: '진선미', retort: '레토르트', out: '외식', skip: '건너뜀', custom: '직접 입력' }[s] || s; }

function recommendBlock(iso, m, c) {
  const b = c.budgets[m];
  if (m === 'b') {
    const rec = plannedRecipe(iso, 'b', b.kcal);
    return `<div class="banner info"><b>${esc(rec.title)}</b> <span class="muted">(${rec.total.kcal} kcal · 단백질 ${r1(rec.total.prot)}g · 배율 ${rec.scale}x)</span><br><span class="small">${rec.parts.map((p) => `${esc(p.label)} ${p.grams}${p.unit}`).join(' · ')}</span></div>
      <div class="btns"><button class="btn primary" data-action="log-plan-done" data-meal="b">권고대로 먹었어요</button><button class="btn" data-action="open" data-mode="plan" data-meal="b">양 조절해서 기록</button><button class="btn sm ghost" data-action="recipe" data-id="${rec.id}" data-meal="b">레시피</button><button class="btn sm ghost" data-action="rotate" data-meal="b">다른 아침</button><button class="btn sm ghost" data-action="open" data-mode="retort" data-meal="b">간편식</button><button class="btn sm ghost" data-action="open" data-mode="out" data-meal="b">외식/검색</button><button class="btn sm ghost" data-action="skip" data-meal="b">건너뜀</button></div>`;
  }
  if (m === 's') {
    const sp = snackPlan(b, c.p);
    return `<div class="banner info"><b>프로틴 쉐이크 ${sp.scoops}스쿱${sp.nutsG ? ` + 견과류 ${sp.nutsG}g` : ''}</b> <span class="muted">(${sp.kcal} kcal · 단백질 ${sp.prot}g)</span><br><span class="small">${sp.scoops === 0 ? '단백질이 이미 충분해요. 견과류만 또는 건너뛰어도 됩니다.' : '오전·점심 섭취량을 반영해 계산했어요.'}</span></div>
      <div class="btns"><button class="btn primary" data-action="log-snack-done">그대로 먹었어요</button><button class="btn" data-action="open" data-mode="snack" data-meal="s">조절해서 기록</button><button class="btn sm ghost" data-action="open" data-mode="out" data-meal="s">다른 간식 검색</button><button class="btn sm ghost" data-action="skip" data-meal="s">건너뜀</button></div>`;
  }
  // 점심/저녁
  const items = ui.foodsLoaded || ui.menuLoaded ? cafeteriaItems(iso, m) : null;
  let banner = '';
  if (items === null) banner = `<div class="banner info muted">진선미 식단 정보가 없는 날입니다 (${ui.menuLoaded ? '주말/미게시' : '불러오는 중…'})</div>`;
  else if (items.length === 0) banner = `<div class="banner info muted">진선미 ${m === 'l' ? '중식' : '석식'} 미운영</div>`;
  else {
    const d = decideCafeteria(items, b.kcal, b.prot);
    const text = d.verdict === 'ok' ? `<b>진선미 OK</b> — 정량으로 드셔도 됩니다 (약 ${d.estKcal} kcal, 예산 ${b.kcal})`
      : d.verdict === 'partial' ? `<b>진선미 가능 (양 조절)</b> — ${d.plan.filter((x) => x.portion < 1).map((x) => `${esc(x.name.replace(/\*.*$/, ''))} ${PORTION_LABEL[x.portion]}`).join(', ')} 권장 → 약 ${d.planKcal} kcal (정량은 ${d.estKcal})`
      : `<b>도시락 권장</b> — 진선미 정량 약 ${d.estKcal} kcal로 예산(${b.kcal})을 크게 넘어요. 정말 맛있어 보이면 절반씩만.`;
    banner = `<div class="banner ${d.verdict}">${text}<div class="small muted" style="margin-top:4px">${items.map((it) => esc(it.name.replace(/\*.*$/, ''))).join(' · ')}</div></div>`;
  }
  const rec = plannedRecipe(iso, m, b.kcal);
  const combo = retortCombo(b, iso + m);
  return `${banner}
    <div class="banner info"><b>권고 도시락: ${esc(rec.title)}</b> <span class="muted">(${rec.total.kcal} kcal · 단백질 ${r1(rec.total.prot)}g · 배율 ${rec.scale}x)</span><br><span class="small">${rec.parts.map((p) => `${esc(p.label)} ${p.grams}${p.unit}`).join(' · ')}</span></div>
    <div class="banner info"><b>귀찮은 날 (레토르트)</b>: <span class="small">${combo.map((i) => esc(i.name)).join(' + ')} = ${combo.reduce((a, i) => a + i.kcal, 0)} kcal · 단백질 ${r1(combo.reduce((a, i) => a + i.prot, 0))}g</span></div>
    <div class="btns">
      ${items && items.length ? `<button class="btn primary" data-action="open" data-mode="jsm" data-meal="${m}">진선미로 기록</button>` : ''}
      <button class="btn ${items && items.length ? '' : 'primary'}" data-action="open" data-mode="plan" data-meal="${m}">도시락 기록</button>
      <button class="btn" data-action="open" data-mode="retort" data-meal="${m}">레토르트</button>
      <button class="btn" data-action="open" data-mode="out" data-meal="${m}">외식</button>
      <button class="btn sm ghost" data-action="recipe" data-id="${rec.id}" data-meal="${m}">레시피</button>
      <button class="btn sm ghost" data-action="rotate" data-meal="${m}">다른 도시락</button>
      <button class="btn sm ghost" data-action="skip" data-meal="${m}">건너뜀</button>
    </div>`;
}

/* ---------- 기록 패널 ---------- */
function openPanel(iso, m, mode, existing) {
  const c = ctx(iso);
  const b = c.budgets[m];
  let draft = { meal: m, mode, items: [], query: '', results: [] };
  if (existing && existing.items) {
    draft.items = existing.items.map((it) => ({ ...it }));
    draft.recipeId = existing.recipeId; draft.scale = existing.scale; draft.mode = mode = existing.source === 'skip' ? 'out' : (existing.source === 'plan' ? 'plan' : existing.source === 'jsm' ? 'jsm' : existing.source === 'retort' ? 'retort' : existing.source === 'out' && m === 's' ? 'snack' : 'out');
    if (existing.source === 'plan') draft.portion = existing.items[0]?.portion ?? 1;
    if (existing.source === 'out' && m === 's' && existing.snack) { draft.mode = 'snack'; draft.scoops = existing.snack.scoops; draft.nutsG = existing.snack.nutsG; }
  } else if (mode === 'jsm') {
    const items = cafeteriaItems(iso, m) || [];
    const d = decideCafeteria(items, b.kcal, b.prot);
    draft.items = items.map((it, i) => ({ ...it, portion: d ? d.plan[i].portion : 1 }));
  } else if (mode === 'plan') {
    const rec = plannedRecipe(iso, m, b.kcal);
    draft.recipeId = rec.id; draft.scale = rec.scale; draft.portion = 1;
    draft.items = [{ name: rec.title, ...rec.total, grams: rec.parts.reduce((a, p) => a + p.grams, 0), unit: 'g', portion: 1, est: true }];
  } else if (mode === 'retort') {
    draft.items = [];
  } else if (mode === 'snack') {
    const sp = snackPlan(b, c.p);
    draft.scoops = sp.scoops; draft.nutsG = sp.nutsG;
  }
  ui.panel = { meal: m, mode: draft.mode }; ui.draft = draft;
  render();
}

function snackItems(d, p) {
  const sh = p.shake, nuts = p.nuts;
  const items = [];
  if (d.scoops > 0) items.push({ name: `프로틴 쉐이크 ${d.scoops}스쿱`, grams: Math.round(sh.scoopG * d.scoops), unit: 'g', kcal: Math.round(sh.kcalPerScoop * d.scoops), prot: +(sh.protPerScoop * d.scoops).toFixed(1), carb: +(3 * d.scoops).toFixed(1), fat: +(1.5 * d.scoops).toFixed(1), sugar: +(1 * d.scoops).toFixed(1), fiber: 0, sodium: Math.round(80 * d.scoops), portion: 1 });
  if (d.nutsG > 0) items.push({ name: `견과류 ${d.nutsG}g`, grams: d.nutsG, unit: 'g', kcal: Math.round((nuts.kcalPer10g * d.nutsG) / 10), prot: +((nuts.protPer10g * d.nutsG) / 10).toFixed(1), carb: +(2 * d.nutsG / 10).toFixed(1), fat: +(5.2 * d.nutsG / 10).toFixed(1), sugar: +(0.4 * d.nutsG / 10).toFixed(1), fiber: +(0.8 * d.nutsG / 10).toFixed(1), sodium: 1, portion: 1 });
  return items.concat(d.items || []);
}

function panelHTML(iso, m, c) {
  const d = ui.draft; if (!d) return '';
  const b = c.budgets[m];
  const seg = (idx, cur) => `<span class="seg">${PORTIONS.map((p) => `<button class="${Math.abs(p - cur) < 0.01 ? 'on' : ''}" data-action="portion" data-idx="${idx}" data-p="${p}">${PORTION_LABEL[p]}</button>`).join('')}</span>`;
  let html = '';
  if (d.mode === 'jsm') {
    const t = sumItems(d.items);
    html = `<h3>진선미 ${m === 'l' ? '중식' : '석식'} — 메뉴별 실제 섭취량</h3>
      <ul class="list">${d.items.map((it, i) => `<li><span class="name">${esc(it.name.replace(/\*.*$/, ''))}<span class="sub">정량 ${it.grams}${it.unit === 'ml' ? 'ml' : 'g'} ≈ ${it.kcal} kcal${it.match ? ' · DB: ' + esc(it.match) : ' · 추정'}</span></span>${seg(i, it.portion)}</li>`).join('')}</ul>
      <div class="row between" style="margin-top:8px"><b>합계 ${t.kcal} kcal · 단백질 ${r1(t.prot)}g</b><span class="chip ${t.kcal > b.kcal * 1.1 ? 'warn' : 'ok'}">예산 ${b.kcal}</span></div>`;
  } else if (d.mode === 'plan') {
    const rec = buildRecipe(findRecipe(d.recipeId), d.scale || 1);
    const it = d.items[0];
    html = `<h3>${esc(rec.title)} — 얼마나 드셨나요?</h3>
      <div class="small muted">${rec.parts.map((p) => `${esc(p.label)} ${p.grams}${p.unit}`).join(' · ')}</div>
      <div class="row between" style="margin-top:8px"><span>섭취량</span>${seg(0, it.portion ?? 1)}</div>
      <div class="row between" style="margin-top:8px"><b>${Math.round(it.kcal * (it.portion ?? 1))} kcal · 단백질 ${r1(it.prot * (it.portion ?? 1))}g</b><span class="chip">예산 ${b.kcal}</span></div>
      <div class="btns"><button class="btn sm ghost" data-action="open" data-mode="out" data-meal="${m}">+ 다른 음식 추가(검색)</button></div>`;
  } else if (d.mode === 'retort') {
    const t = sumItems(d.items);
    html = `<h3>레토르트/간편식 — 먹은 것 체크</h3>
      <ul class="list">${RETORT.map((r) => { const it = retortItem(r); const n = d.items.filter((x) => x.rid === r.id).length; return `<li><span class="name">${esc(it.name)}<span class="sub">${it.kcal} kcal · 단백질 ${r1(it.prot)}g</span></span><span class="stepper"><button data-action="retort-dec" data-rid="${r.id}">−</button><span>${n}</span><button data-action="retort-inc" data-rid="${r.id}">+</button></span></li>`; }).join('')}</ul>
      <div class="row between" style="margin-top:8px"><b>합계 ${t.kcal} kcal · 단백질 ${r1(t.prot)}g</b><span class="chip ${t.kcal > b.kcal * 1.1 ? 'warn' : 'ok'}">예산 ${b.kcal}</span></div>
      <div class="btns"><button class="btn sm ghost" data-action="open" data-mode="out" data-meal="${m}">+ 검색해서 추가</button></div>`;
  } else if (d.mode === 'snack') {
    const items = snackItems(d, c.p);
    const t = sumItems(items);
    html = `<h3>간식 조절</h3>
      <div class="row between"><span>프로틴 쉐이크 (스쿱)</span><span class="stepper"><button data-action="scoop" data-v="-0.5">−</button><span>${d.scoops}</span><button data-action="scoop" data-v="0.5">+</button></span></div>
      <div class="row between" style="margin-top:6px"><span>견과류 (g)</span><span class="stepper"><button data-action="nuts" data-v="-5">−</button><span>${d.nutsG}</span><button data-action="nuts" data-v="5">+</button></span></div>
      ${d.items && d.items.length ? `<ul class="list">${d.items.map((it, i) => `<li><span class="name">${esc(it.name)}<span class="sub">${Math.round(it.kcal * (it.portion ?? 1))} kcal</span></span>${seg(i, it.portion ?? 1)}</li>`).join('')}</ul>` : ''}
      <div class="row between" style="margin-top:8px"><b>${t.kcal} kcal · 단백질 ${r1(t.prot)}g</b><span class="chip">예산 ${b.kcal} · 단백질 ${b.prot}g</span></div>
      <div class="btns"><button class="btn sm ghost" data-action="open" data-mode="out" data-meal="s">+ 다른 간식 검색</button></div>`;
  } else { // out / search
    const t = sumItems(d.items);
    html = `<h3>${m === 's' ? '간식' : '외식'} — 메뉴 검색 (초성 가능: ㄱㅊㅉㄱ)</h3>
      <input type="search" id="food-q" placeholder="예: 김치찌개, 스타벅스 라떼, 연두부" value="${esc(d.query)}" autocomplete="off">
      ${!ui.foodsLoaded ? '<div class="muted small">음식 DB 불러오는 중… (2.9MB, 처음 한 번만)</div>' : ''}
      ${d.results.length ? `<div class="results">${d.results.map((row, i) => `<div data-action="add-food" data-i="${i}"><span>${esc(row[F.name])}${row[F.brand] ? ` <span class="b">${esc(row[F.brand])}</span>` : ''}</span><span class="b">${row[F.serving] ? row[F.serving] + (row[F.unit] === 'ml' ? 'ml ' : 'g ') + Math.round(row[F.kcal] * row[F.serving] / 100) : '100' + row[F.unit] + ' ' + row[F.kcal]} kcal</span></div>`).join('')}</div>` : ''}
      <ul class="list">${d.items.map((it, i) => `<li><span class="name">${esc(it.name)}<span class="sub">정량 <input class="inline" style="width:70px;padding:2px 6px" type="number" data-action="grams" data-idx="${i}" value="${it.grams}">${it.unit === 'ml' ? 'ml' : 'g'} ≈ ${it.kcal} kcal</span></span>${seg(i, it.portion ?? 1)}<button class="btn sm ghost" data-action="remove" data-idx="${i}">✕</button></li>`).join('')}</ul>
      <div class="row between" style="margin-top:8px"><b>합계 ${t.kcal} kcal · 단백질 ${r1(t.prot)}g</b><span class="chip ${t.kcal > b.kcal * 1.1 ? 'warn' : 'ok'}">예산 ${b.kcal}</span></div>`;
  }
  return html + `<div class="btns"><button class="btn primary" data-action="save-panel">저장</button><button class="btn ghost" data-action="close-panel">닫기</button></div>`;
}

function savePanel() {
  const d = ui.draft; if (!d) return;
  const iso = ui.date; const day = store.day(iso); const m = d.meal;
  let log;
  if (d.mode === 'snack') {
    const items = snackItems(d, store.state.profile);
    log = { source: 'out', items, snack: { scoops: d.scoops, nutsG: d.nutsG }, at: new Date().toISOString(), done: false };
    const sp = snackPlan(ctx(iso).budgets[m], store.state.profile);
    log.done = sp.scoops === d.scoops && sp.nutsG === d.nutsG && !(d.items || []).length;
  } else if (d.mode === 'plan') {
    const it = d.items[0];
    log = { source: 'plan', items: d.items, recipeId: d.recipeId, scale: d.scale, at: new Date().toISOString(), done: (it.portion ?? 1) === 1 && d.items.length === 1 };
    day.plan[m] = d.recipeId;
  } else {
    if (!d.items.length && d.mode !== 'retort') { toast('항목을 추가해 주세요'); return; }
    log = { source: d.mode === 'jsm' ? 'jsm' : d.mode === 'retort' ? 'retort' : 'out', items: d.items, at: new Date().toISOString(), done: false };
  }
  day.meals[m] = log;
  store.save();
  ui.panel = null; ui.draft = null;
  toast(`${MEAL_NAME[m]} 기록 완료`);
  render();
}

/* ===== 내일 ===== */
function viewTomorrow() {
  const iso = addDays(store.today(), 1);
  const c = ctx(iso);
  const day = c.day;
  let h = `<h1>내일 준비 — ${esc(fmtDate(iso))}</h1>`;
  const bRec = plannedRecipe(iso, 'b', c.budgets.b.kcal);
  h += `<div class="card"><div class="row between"><h2 class="tight">아침: ${esc(bRec.title)}</h2><span class="chip">${bRec.total.kcal} kcal</span></div><div class="small muted">${esc(bRec.prep)}</div>
    <div class="check"><input type="checkbox" data-action="prep" data-meal="b" data-date="${iso}" ${day.prepared.b ? 'checked' : ''}><span>오늘 저녁에 준비해 둠</span></div>
    <div class="btns"><button class="btn sm" data-action="recipe" data-id="${bRec.id}">레시피</button><button class="btn sm ghost" data-action="rotate-date" data-meal="b" data-date="${iso}">다른 아침</button></div></div>`;
  for (const m of ['l', 'd']) {
    const items = cafeteriaItems(iso, m);
    const b = c.budgets[m];
    let cafe = '';
    if (items && items.length) {
      const d = decideCafeteria(items, b.kcal, b.prot);
      cafe = `<div class="banner ${d.verdict}"><b>진선미 ${m === 'l' ? '중식' : '석식'}</b> 약 ${d.estKcal} kcal (예산 ${b.kcal}) — ${d.verdict === 'ok' ? '정량 OK' : d.verdict === 'partial' ? '양 조절하면 가능' : '도시락 권장'}<div class="small muted">${items.map((it) => esc(it.name.replace(/\*.*$/, ''))).join(' · ')}</div></div>`;
    } else cafe = `<div class="banner info muted">진선미 ${m === 'l' ? '중식' : '석식'} 정보 없음/미운영 → 도시락 준비</div>`;
    const rec = plannedRecipe(iso, m, b.kcal);
    h += `<div class="card"><h2>${MEAL_NAME[m]}</h2>${cafe}
      <div class="row between"><b>도시락: ${esc(rec.title)}</b><span class="chip">${rec.total.kcal} kcal · 단 ${r1(rec.total.prot)}g</span></div>
      <div class="small muted">${rec.parts.map((p) => `${esc(p.label)} ${p.grams}${p.unit}`).join(' · ')}</div>
      <div class="small" style="margin-top:4px">📝 ${esc(rec.prep)}</div>
      <div class="check"><input type="checkbox" data-action="prep" data-meal="${m}" data-date="${iso}" ${day.prepared[m] ? 'checked' : ''}><span>재료 준비 완료</span></div>
      <div class="btns"><button class="btn sm" data-action="recipe" data-id="${rec.id}">레시피</button><button class="btn sm ghost" data-action="rotate-date" data-meal="${m}" data-date="${iso}">다른 도시락</button></div>
      <div class="small muted" style="margin-top:8px">레토르트 대안: ${retortCombo(b, iso + m).map((i) => esc(i.name)).join(' + ')}</div></div>`;
  }
  h += `<div class="card muted small">예산은 내일 기록이 없는 상태의 기본 배분입니다. 실제 예산은 내일 아침 섭취량에 따라 자동 조정됩니다.</div>`;
  return h;
}

/* ===== 식단표 ===== */
function viewMenu() {
  const md = menuData();
  if (!md) return `<h1>진선미관 식단표</h1><div class="card muted">불러오는 중…</div>`;
  const weeks = md.weeks || [];
  if (!weeks.length) return `<h1>진선미관 식단표</h1><div class="card muted">식단 데이터가 없습니다. ${esc(md.error || '')}</div>`;
  const wk = weeks.find((w) => w.week_start === ui.menuWeek) || weekStarting(store.today()) || weeks[weeks.length - 1];
  const today = store.today();
  let h = `<h1>진선미관 식단표</h1><div class="row between card" style="padding:10px 14px"><span class="seg">${weeks.map((w) => `<button class="${w.week_start === wk.week_start ? 'on' : ''}" data-action="menu-week" data-w="${w.week_start}">${w.week_start.slice(5).replace('-', '/')}~</button>`).join('')}</span><span class="muted small">갱신 ${esc((md.updated_at || '').slice(0, 16).replace('T', ' '))}</span></div>`;
  h += `<div class="card" style="padding:6px 8px;overflow-x:auto"><table class="menu-table"><thead><tr><th></th><th>중식</th><th>석식</th></tr></thead><tbody>`;
  for (const d of wk.days) {
    const cell = (list) => list.length ? list.map((x) => esc(x.replace(/\*.*$/, ''))).join('<br>') + (ui.foodsLoaded ? `<div class="muted small" style="margin-top:4px">≈ ${list.map((x) => cafeteriaItemsFromList([x])[0].kcal).reduce((a, b) => a + b, 0)} kcal</div>` : '') : '<span class="muted">—</span>';
    h += `<tr><th>${d.dow}<br><span class="small">${d.date.slice(5)}</span></th><td class="${d.date === today ? 'today' : ''}">${cell(d.lunch)}</td><td class="${d.date === today ? 'today' : ''}">${cell(d.dinner)}</td></tr>`;
  }
  h += `</tbody></table></div><div class="card muted small">출처: 이화여대 공식 식당 페이지(진·선·미관). 칼로리는 메뉴명으로 식약처 DB를 매칭한 추정치이며 실제와 다를 수 있습니다. 식단은 매일 자동 갱신됩니다.</div>`;
  return h;
}
function cafeteriaItemsFromList(list) { return list.map((x) => matchMenuItem(x)); }

/* ===== 기록/통계 ===== */
function lastNDays(n, end = store.today()) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i)); return out; }

function viewStats() {
  const days = lastNDays(7);
  const rows = days.map((iso) => { const c = ctx(iso); return { iso, t: c.total, tg: c.tg, w: store.state.weights[iso], walks: c.day.walks, has: MEALS.some((m) => c.day.meals[m]?.source) }; });
  const logged = rows.filter((r) => r.has);
  const avg = (k) => logged.length ? Math.round((logged.reduce((a, r) => a + (r.t[k] || 0), 0) / logged.length) * 10) / 10 : 0;
  const tg = ctx(store.today()).tg;
  let h = `<h1>기록</h1>`;
  // 체중 (30일)
  const wdays = lastNDays(30);
  const wpts = wdays.map((iso, i) => ({ i, iso, kg: store.state.weights[iso] })).filter((p) => p.kg != null);
  if (wpts.length >= 2) {
    const W = 600, H = 160, pad = 28;
    const min = Math.min(...wpts.map((p) => p.kg)) - 0.5, max = Math.max(...wpts.map((p) => p.kg)) + 0.5;
    const x = (i) => pad + (i / 29) * (W - pad * 2), y = (kg) => H - pad - ((kg - min) / (max - min)) * (H - pad * 2);
    const path = wpts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
    const first = wpts[0], last = wpts[wpts.length - 1];
    h += `<div class="card"><div class="row between"><h2 class="tight">체중 30일</h2><span class="chip ${last.kg <= first.kg ? 'ok' : 'warn'}">${(last.kg - first.kg > 0 ? '+' : '') + (last.kg - first.kg).toFixed(1)} kg</span></div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="체중 추이"><line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="var(--line)"/><path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round"/>
      ${wpts.map((p) => `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="4" fill="var(--brand)" stroke="var(--card)" stroke-width="2"><title>${p.iso} ${p.kg}kg</title></circle>`).join('')}
      <text x="${x(first.i)}" y="${y(first.kg) - 8}" font-size="11" fill="var(--muted)" text-anchor="middle">${first.kg}</text><text x="${x(last.i)}" y="${y(last.kg) - 8}" font-size="11" fill="var(--ink)" text-anchor="middle" font-weight="600">${last.kg}</text></svg></div>`;
  }
  // 칼로리 7일 막대
  const W = 600, H = 170, pad = 28, bw = 48;
  const maxK = Math.max(tg.kcal * 1.2, ...rows.map((r) => r.t.kcal)) || 1;
  const yK = (v) => H - pad - (v / maxK) * (H - pad * 2);
  h += `<div class="card"><h2>칼로리 7일 <span class="muted small">평균 ${avg('kcal')} / 목표 ${tg.kcal}</span></h2>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="7일 칼로리"><line x1="${pad}" x2="${W - pad}" y1="${yK(tg.kcal)}" y2="${yK(tg.kcal)}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="${W - pad}" y="${yK(tg.kcal) - 4}" font-size="11" fill="var(--muted)" text-anchor="end">목표 ${tg.kcal}</text>
    ${rows.map((r, i) => { const x = pad + 12 + i * ((W - pad * 2 - 24) / 7); const hh = Math.max(0, (H - pad) - yK(r.t.kcal)); const over = r.t.kcal > r.tg.kcal; return `<rect x="${x}" y="${yK(r.t.kcal)}" width="${bw}" height="${hh}" rx="4" fill="${over ? 'var(--bad)' : 'var(--brand)'}"><title>${r.iso}: ${r.t.kcal} kcal</title></rect><text x="${x + bw / 2}" y="${H - pad + 14}" font-size="11" fill="var(--muted)" text-anchor="middle">${fmtDate(r.iso).slice(0, -4)}</text>${r.t.kcal ? `<text x="${x + bw / 2}" y="${yK(r.t.kcal) - 4}" font-size="11" fill="var(--ink)" text-anchor="middle">${r.t.kcal}</text>` : ''}`; }).join('')}
    <line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="var(--line)"/></svg></div>`;
  // 단백질 7일
  const maxP = Math.max(tg.prot * 1.2, ...rows.map((r) => r.t.prot)) || 1;
  const yP = (v) => H - pad - (v / maxP) * (H - pad * 2);
  h += `<div class="card"><h2>단백질 7일 <span class="muted small">평균 ${avg('prot')}g / 목표 ${tg.prot}g</span></h2>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="7일 단백질"><line x1="${pad}" x2="${W - pad}" y1="${yP(tg.prot)}" y2="${yP(tg.prot)}" stroke="var(--muted)" stroke-dasharray="4 4"/>
    ${rows.map((r, i) => { const x = pad + 12 + i * ((W - pad * 2 - 24) / 7); const hh = Math.max(0, (H - pad) - yP(r.t.prot)); return `<rect x="${x}" y="${yP(r.t.prot)}" width="${bw}" height="${hh}" rx="4" fill="var(--accent)"><title>${r.iso}: ${r1(r.t.prot)} g</title></rect><text x="${x + bw / 2}" y="${H - pad + 14}" font-size="11" fill="var(--muted)" text-anchor="middle">${fmtDate(r.iso).slice(0, -4)}</text>${r.t.prot ? `<text x="${x + bw / 2}" y="${yP(r.t.prot) - 4}" font-size="11" fill="var(--ink)" text-anchor="middle">${Math.round(r.t.prot)}</text>` : ''}`; }).join('')}
    <line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="var(--line)"/></svg></div>`;
  // 산책 & 준수
  const walkCount = rows.reduce((a, r) => a + (r.walks.l ? 1 : 0) + (r.walks.d ? 1 : 0), 0);
  h += `<div class="card"><div class="row between"><h2 class="tight">식후 산책 7일</h2><span class="chip ${walkCount >= 10 ? 'ok' : walkCount >= 6 ? 'warn' : ''}">${walkCount} / 14</span></div>
    <div class="dots" style="margin-top:8px">${rows.map((r) => `<span class="dot ${r.walks.l && r.walks.d ? 'on' : (r.walks.l || r.walks.d) ? 'half' : ''}" title="${r.iso}">${fmtDate(r.iso).slice(-2, -1)}</span>`).join('')}</div>
    <div class="muted small" style="margin-top:6px">점심·저녁 각 15분. 초록=둘 다, 연두=하나만.</div></div>`;
  // 7일 영양 평균 표
  h += `<div class="card"><h2>7일 평균 영양 <span class="muted small">(기록 있는 ${logged.length}일)</span></h2><table class="menu-table"><tbody>
    ${NUTRS.map((k) => `<tr><th>${NUTR_LABEL[k]}</th><td>${avg(k)} ${NUTR_UNIT[k]}</td><td class="muted">목표 ${tg[k] ?? '-'} ${NUTR_UNIT[k]}${k === 'sodium' ? ' 이하' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  // 히스토리
  const all = Object.keys(store.state.days).filter((k) => MEALS.some((m) => store.state.days[k].meals?.[m]?.source)).sort().reverse().slice(0, 60);
  h += `<div class="card"><h2>지난 기록</h2>${all.length ? `<ul class="list hist">${all.map((iso) => { const t = dayTotal(store.state.days[iso]); const dd = store.state.days[iso]; return `<li data-action="goto" data-date="${iso}" style="cursor:pointer"><span class="name"><span class="d">${fmtDate(iso)}</span> ${store.state.weights[iso] ? '· ' + store.state.weights[iso] + 'kg' : ''}<span class="sub">${MEALS.filter((m) => dd.meals[m]?.source).map((m) => MEAL_NAME[m] + ':' + srcLabel(dd.meals[m].source)).join(' ')} ${dd.walks.l || dd.walks.d ? '· 산책 ' + ((dd.walks.l ? 1 : 0) + (dd.walks.d ? 1 : 0)) : ''}</span></span><span class="chip">${t.kcal} kcal · ${Math.round(t.prot)}g</span></li>`; }).join('')}</ul>` : '<div class="muted">아직 기록이 없습니다</div>'}</div>`;
  h += `<div class="card"><h2>백업</h2><div class="btns"><button class="btn" data-action="export">JSON 내보내기</button><button class="btn" data-action="import">JSON 가져오기</button></div><div class="muted small" style="margin-top:6px">기록은 이 기기(브라우저)에만 저장됩니다. 가끔 내보내기로 백업해 두세요.</div></div>`;
  return h;
}

/* ===== 설정 ===== */
function viewSettings() {
  const p = store.state.profile;
  const w = store.latestWeight();
  const tg = targets(p, w ? w.kg : null);
  const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
  return `<h1>설정</h1>
  <div class="card"><h2>프로필</h2>
    <div class="grid2">
      <label class="f">이름<input type="text" id="p-name" value="${esc(p.name)}"></label>
      <label class="f">성별<select id="p-sex">${opt('M', p.sex, '남')}${opt('F', p.sex, '여')}</select></label>
      <label class="f">나이<input type="number" id="p-age" value="${p.age}"></label>
      <label class="f">키 (cm)<input type="number" id="p-height" value="${p.heightCm}"></label>
      <label class="f">활동량<select id="p-activity">${opt(1.2, p.activity, '거의 안 움직임 1.2')}${opt(1.375, p.activity, '가벼운 활동 1.375')}${opt(1.55, p.activity, '보통 1.55')}${opt(1.725, p.activity, '활발 1.725')}</select></label>
      <label class="f">단백질 g/kg<input type="number" step="0.1" id="p-ppk" value="${p.proteinPerKg}"></label>
      <label class="f">하루 적자 (kcal)<input type="number" step="50" id="p-deficit" value="${p.deficit}"></label>
      <label class="f">목표 칼로리 직접 지정 (비우면 자동)<input type="number" step="10" id="p-goal" value="${p.goalKcal ?? ''}" placeholder="자동"></label>
    </div>
    <div class="banner info small">현재 계산: 기초대사 ${tg.bmr} · 유지 ${tg.tdee} · <b>목표 ${tg.kcal} kcal</b> · 단백질 ${tg.prot}g ${w ? `(체중 ${w.kg}kg 기준)` : '(체중 미입력: 70kg 가정)'}<br>마운자로 복용 중엔 식욕이 줄어 기본 하한(남 1300 / 여 1100)을 두었습니다. 의료진 지시가 있으면 목표 칼로리를 직접 지정하세요.</div>
  </div>
  <div class="card"><h2>끼니 배분 (비율)</h2><div class="grid2">
    ${MEALS.map((m) => `<label class="f">${MEAL_NAME[m]}<input type="number" step="0.01" min="0" max="1" id="split-${m}" value="${p.split[m]}"></label>`).join('')}</div>
    <div class="muted small">합이 1이 아니면 자동으로 정규화됩니다. 아침을 안 먹으면 그 예산이 점심/간식/저녁으로 배분됩니다.</div></div>
  <div class="card"><h2>프로틴 쉐이크 · 견과</h2><div class="grid2">
    <label class="f">1스쿱 (g)<input type="number" id="sh-g" value="${p.shake.scoopG}"></label>
    <label class="f">1스쿱 칼로리<input type="number" id="sh-k" value="${p.shake.kcalPerScoop}"></label>
    <label class="f">1스쿱 단백질 (g)<input type="number" id="sh-p" value="${p.shake.protPerScoop}"></label>
    <label class="f">최대 스쿱<input type="number" step="0.5" id="sh-max" value="${p.shake.maxScoops}"></label>
    <label class="f">견과 10g당 칼로리<input type="number" id="nt-k" value="${p.nuts.kcalPer10g}"></label>
    <label class="f">견과 10g당 단백질<input type="number" step="0.1" id="nt-p" value="${p.nuts.protPer10g}"></label></div></div>
  <div class="btns"><button class="btn primary block" data-action="save-profile">설정 저장</button></div>
  <div class="card"><h2>체중 자동 기록</h2><div class="small">앱 주소 뒤에 <code>?w=체중</code>을 붙여 열면 오늘 체중으로 저장됩니다. 예: <code>${esc(location.origin + location.pathname)}?w=72.3</code></div>
    <details style="margin-top:8px"><summary>iPhone 단축어 자동화 (Zepp Life/윈마이 → 건강 앱)</summary><ol class="steps small">
      <li>단축어 앱 → 새 단축어: "건강 샘플 찾기" (유형: 체중, 정렬: 시작일 최신순, 제한: 1)</li>
      <li>"URL 열기": <code>${esc(location.origin + location.pathname)}?w=</code> 뒤에 위 결과의 "값"을 변수로 붙임</li>
      <li>자동화 탭 → 개인용 자동화 → "시간" (예: 07:30, 매일) 또는 "앱이 닫힐 때: Zepp Life" → 즉시 실행</li>
      <li>잠금 상태에서는 건강 데이터에 접근할 수 없으니 평소 폰을 보는 시간으로 설정</li></ol></details>
    <details style="margin-top:8px"><summary>Galaxy 자동화 (openScale / Health Connect)</summary><ol class="steps small">
      <li>가장 확실한 방법: <b>openScale</b>(무료, Mi 체중계 직접 연결) + <b>openScale-sync</b>의 Webhook 또는 MacroDroid로 측정 즉시 위 URL 열기</li>
      <li>삼성헬스를 쓰는 경우: 삼성헬스 → 설정 → Health Connect 연동 후 MacroDroid/Tasker(Health Connect 플러그인)로 최신 체중을 읽어 URL 열기</li>
      <li>둘 다 번거로우면 아침에 숫자만 입력해도 10초면 끝납니다</li></ol></details></div>
  <div class="card"><h2>정보</h2><div class="small muted">칼로리 DB: 식품의약품안전처 식품영양성분 통합DB(음식·원재료·가공식품 표준데이터셋, 공공데이터포털), 농촌진흥청 국가표준식품성분표. 식단: 이화여자대학교 식당 안내 페이지. 추천 식단의 영양값은 재료 대표값 기준 추정치입니다. 이 앱은 의료 조언이 아니며, 마운자로 관련 결정은 의료진과 상의하세요.</div>
    <div class="btns"><button class="btn sm ghost" data-action="reload-app">앱 새로고침(업데이트)</button></div></div>`;
}

/* ---------------- 이벤트 ---------------- */
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ui.tab = b.dataset.tab; if (ui.tab === 'today') ui.date = store.today(); render(); });

$('#view').addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'food-q') {
    ui.draft.query = t.value;
    if (!foodsReady()) { loadFoods().then(() => { ui.foodsLoaded = true; ui.draft.results = searchFoods(ui.draft.query); render(); refocus(); }); return; }
    ui.draft.results = searchFoods(t.value);
    const box = $('.results'); const html = ui.draft.results.map((row, i) => `<div data-action="add-food" data-i="${i}"><span>${esc(row[F.name])}${row[F.brand] ? ` <span class="b">${esc(row[F.brand])}</span>` : ''}</span><span class="b">${row[F.serving] ? row[F.serving] + (row[F.unit] === 'ml' ? 'ml ' : 'g ') + Math.round(row[F.kcal] * row[F.serving] / 100) : '100' + row[F.unit] + ' ' + row[F.kcal]} kcal</span></div>`).join('');
    if (box) box.innerHTML = html; else if (html) { t.insertAdjacentHTML('afterend', `<div class="results">${html}</div>`); }
  }
});
function refocus() { const q = $('#food-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }

$('#view').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.action === 'prep') { const d = store.day(t.dataset.date); d.prepared[t.dataset.meal] = t.checked; store.save(); }
  if (t.dataset.action === 'grams') { const i = +t.dataset.idx; const it = ui.draft.items[i]; const g = +t.value; if (g > 0 && it.row) { const n = nutrientsFor(it.row, g); Object.assign(it, n, { name: it.name, portion: it.portion, row: it.row }); render(); refocus(); } }
});

$('#view').addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action; const m = el.dataset.meal; const iso = ui.date;
  const day = store.day(iso);
  switch (a) {
    case 'save-weight': { const v = parseFloat($('#w-in').value); if (v > 20 && v < 300) { store.setWeight(iso, v); toast('체중 저장'); render(); } else toast('체중을 확인해 주세요'); break; }
    case 'save-note': day.note = $('#note').value; store.save(); toast('메모 저장'); break;
    case 'walk': day.walks[m] = !day.walks[m]; store.save(); render(); break;
    case 'skip': day.meals[m] = { source: 'skip', items: [], at: new Date().toISOString() }; store.save(); ui.panel = null; render(); break;
    case 'unlog': day.meals[m] = null; store.save(); ui.panel = null; render(); break;
    case 'edit': openPanel(iso, m, null, day.meals[m]); break;
    case 'open': openPanel(iso, m, el.dataset.mode, (ui.draft && ui.draft.meal === m && el.dataset.mode === 'out') ? { items: ui.draft.mode === 'snack' ? [] : ui.draft.items, source: 'out' } : null); if (ui.draft && ui.draft.mode === 'out') setTimeout(refocus, 50); break;
    case 'close-panel': ui.panel = null; ui.draft = null; render(); break;
    case 'save-panel': savePanel(); break;
    case 'log-plan-done': { const c = ctx(iso); const rec = plannedRecipe(iso, 'b', c.budgets.b.kcal); day.meals.b = { source: 'plan', recipeId: rec.id, scale: rec.scale, done: true, at: new Date().toISOString(), items: [{ name: rec.title, ...rec.total, grams: rec.parts.reduce((s, p) => s + p.grams, 0), unit: 'g', portion: 1, est: true }] }; day.plan.b = rec.id; store.save(); toast('아침 기록 완료'); render(); break; }
    case 'log-snack-done': { const c = ctx(iso); const sp = snackPlan(c.budgets.s, c.p); day.meals.s = { source: 'out', snack: { scoops: sp.scoops, nutsG: sp.nutsG }, done: true, at: new Date().toISOString(), items: snackItems({ scoops: sp.scoops, nutsG: sp.nutsG }, c.p) }; store.save(); toast('간식 기록 완료'); render(); break; }
    case 'rotate': rotatePlan(iso, m); render(); break;
    case 'rotate-date': rotatePlan(el.dataset.date, m); render(); break;
    case 'recipe': { const r = findRecipe(el.dataset.id); if (!r) break; const c = ctx(el.dataset.date || iso); const b = c.budgets[m || 'l'] || c.budgets.l; const rec = buildRecipe(r, scaleFor(r, b ? b.kcal : 500)); modal(`<h2>${esc(rec.title)} <span class="muted small">${rec.total.kcal} kcal · 단백질 ${r1(rec.total.prot)}g · 배율 ${rec.scale}x</span></h2><ul class="list">${rec.parts.map((p) => `<li><span class="name">${esc(p.label)}</span><span class="muted">${p.grams}${p.unit} · ${p.kcal} kcal</span></li>`).join('')}</ul><h3 style="margin-top:10px">만들기</h3><ol class="steps">${rec.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol><div class="banner info small">📝 ${esc(rec.prep)}</div><div class="small muted">탄 ${r1(rec.total.carb)}g · 지 ${r1(rec.total.fat)}g · 섬유 ${r1(rec.total.fiber)}g · 나트륨 ${rec.total.sodium}mg</div>`); break; }
    case 'portion': { const i = +el.dataset.idx; ui.draft.items[i].portion = +el.dataset.p; render(); break; }
    case 'retort-inc': { const r = RETORT.find((x) => x.id === el.dataset.rid); ui.draft.items.push({ ...retortItem(r), rid: r.id, unit: 'g', portion: 1 }); render(); break; }
    case 'retort-dec': { const i = ui.draft.items.findIndex((x) => x.rid === el.dataset.rid); if (i >= 0) ui.draft.items.splice(i, 1); render(); break; }
    case 'scoop': ui.draft.scoops = Math.max(0, Math.min(3, ui.draft.scoops + +el.dataset.v)); render(); break;
    case 'nuts': ui.draft.nutsG = Math.max(0, Math.min(60, ui.draft.nutsG + +el.dataset.v)); render(); break;
    case 'add-food': { const row = ui.draft.results[+el.dataset.i]; const n = nutrientsFor(row); ui.draft.items.push({ ...n, portion: 1, row }); ui.draft.results = []; ui.draft.query = ''; render(); refocus(); break; }
    case 'remove': ui.draft.items.splice(+el.dataset.idx, 1); render(); break;
    case 'menu-week': ui.menuWeek = el.dataset.w; render(); break;
    case 'goto': ui.date = el.dataset.date; ui.tab = 'today'; ui.panel = null; render(); break;
    case 'export': exportJSON(); break;
    case 'import': importJSON(); break;
    case 'save-profile': saveProfile(); break;
    case 'reload-app': navigator.serviceWorker?.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))).then(() => caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))).then(() => location.reload(true)); break;
  }
});

function rotatePlan(iso, m) {
  const day = store.day(iso);
  const list = m === 'b' ? BREAKFAST : LUNCHBOX;
  const c = ctx(iso);
  const cur = plannedRecipe(iso, m, c.budgets[m].kcal).id;
  const i = list.findIndex((r) => r.id === cur);
  day.plan[m] = list[(i + 1) % list.length].id;
  store.save();
}

function saveProfile() {
  const p = store.state.profile;
  p.name = $('#p-name').value.trim(); p.sex = $('#p-sex').value; p.age = +$('#p-age').value || p.age; p.heightCm = +$('#p-height').value || p.heightCm;
  p.activity = +$('#p-activity').value; p.proteinPerKg = +$('#p-ppk').value || 1.4; p.deficit = +$('#p-deficit').value || 0;
  const g = parseFloat($('#p-goal').value); p.goalKcal = g > 0 ? g : null;
  let sum = 0; for (const m of MEALS) { p.split[m] = Math.max(0, +$(`#split-${m}`).value || 0); sum += p.split[m]; }
  if (sum > 0) for (const m of MEALS) p.split[m] = Math.round((p.split[m] / sum) * 100) / 100;
  p.shake = { scoopG: +$('#sh-g').value || 30, kcalPerScoop: +$('#sh-k').value || 120, protPerScoop: +$('#sh-p').value || 24, maxScoops: +$('#sh-max').value || 2 };
  p.nuts = { kcalPer10g: +$('#nt-k').value || 60, protPer10g: +$('#nt-p').value || 2 };
  store.save(); toast('설정 저장'); render();
}

function exportJSON() {
  const text = store.exportJSON();
  const name = `diet-scheduler-${store.today()}.json`;
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([text], name, { type: 'application/json' })] })) {
    navigator.share({ files: [new File([text], name, { type: 'application/json' })], title: name }).catch(() => {});
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
}
function importJSON() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then((t) => { try { store.importJSON(t); toast('가져오기 완료'); render(); } catch (e) { toast('가져오기 실패: ' + e.message); } }); };
  inp.click();
}

boot();
