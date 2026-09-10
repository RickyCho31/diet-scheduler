// Diet Scheduler — UI
import { store, MEALS, MEAL_NAME, addDays, localDate } from './store.js';
import { targets, recommended, weightTrend, weightAvg, mealBudgets, decideCafeteria, snackPlan, sumItems, mealTotal, dayTotal, PORTIONS, PORTION_LABEL, NUTRS, MICROS, ALL_KEYS, NUTR_LABEL, NUTR_UNIT, UPPER_LIMIT, SUPPLEMENTS, supplementFor, pct } from './nutrition.js';
import { BREAKFAST, LUNCHBOX, RETORT, breakfastsFor, lunchboxesFor, retortsFor, buildRecipe, scaleFor, retortItem, retortCombo, pickLunchbox, findRecipe } from './plans.js';
import { loadFoods, foodsReady, searchFoods, nutrientsFor, matchMenuItem, F } from './foods.js';
import { loadMenu, menuFor, cafeteriaItems, menuData, weekStarting } from './menu.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (x) => (x == null ? '-' : Math.round(x * 10) / 10);
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDate = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`; };

const ui = { tab: 'today', date: store.today(), panel: null, draft: null, menuWeek: null, foodsLoaded: false, menuLoaded: false, range: { w: 30, k: 14, p: 14 } };
try { Object.assign(ui.range, JSON.parse(localStorage.getItem('ds.range') || '{}')); } catch {}

/* ---------------- 부트 ---------------- */
async function boot() {
  store.load();
  handleWeightParam();
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
  loadMenu().then(() => { ui.menuLoaded = true; render(); });
  backfillMicros();
  loadFoods().then(() => { ui.foodsLoaded = true; const n = backfillMicros(); if (n) toast(`지난 기록 ${n}건에 미량영양소를 보정했습니다`); render(); }).catch(() => toast('음식 DB를 불러오지 못했습니다'));
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
  return { day, p, w, tg, ...mb, total: dayTotal(day, p) };
}

function recentLunchboxIds(iso, n = 5) {
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
  const p = store.state.profile;
  let rec = findRecipe(day.plan[meal]);
  if (rec && p.noDairy && rec.dairy) rec = null;   // 유제품 제외 설정이면 다시 고름
  if (!rec) {
    const bl = breakfastsFor(p);
    rec = meal === 'b' ? bl[[...iso].reduce((a, c) => a + c.charCodeAt(0), 0) % bl.length] : pickLunchbox(iso, meal, recentLunchboxIds(iso), budgetKcal, p);
    day.plan[meal] = rec.id; store.save();   // 한 번 정해진 계획은 고정 (내일 화면과 오늘 화면이 같도록)
  }
  return buildRecipe(rec, scaleFor(rec, budgetKcal));
}

/** 예전 기록(미량영양소 없이 저장된 항목)을 현재 DB/레시피 값으로 보정 */
function backfillMicros() {
  let changed = 0;
  for (const d of Object.values(store.state.days)) {
    for (const m of MEALS) {
      const log = d.meals?.[m]; if (!log || !log.items) continue;
      if (log.source === 'plan' && log.recipeId && log.items[0] && log.items[0].ca == null) {
        const r = findRecipe(log.recipeId);
        if (r) { const rec = buildRecipe(r, log.scale || 1); Object.assign(log.items[0], rec.total, { name: rec.title, grams: rec.parts.reduce((a, p) => a + p.grams, 0) }); changed++; }
      }
      for (const it of log.items) {
        if (it.ca != null) continue;
        if (it.rid) { const rr = RETORT.find((x) => x.id === it.rid); if (rr) { Object.assign(it, retortItem(rr), { rid: it.rid, portion: it.portion, unit: 'g' }); changed++; } continue; }
        if (!foodsReady()) continue;
        let n = null;
        if (it.est && it.match !== undefined) {           // 진선미 메뉴: 이름으로 재매칭
          const mm = matchMenuItem(it.name);
          if (mm.match) { const k = (it.grams || mm.grams) / mm.grams; n = {}; for (const key of MICROS) n[key] = mm[key] == null ? null : mm[key] * k; }
        } else if (it.src === 'db' || it.row) {          // 외식/검색 항목: 같은 이름의 DB 행
          const rows = searchFoods(String(it.name).replace(/\s*\(.*\)$/, ''), 20);
          const row = rows.find((r) => (r[F.name] + (r[F.brand] ? ` (${r[F.brand]})` : '')) === it.name) || rows[0];
          if (row) { n = nutrientsFor(row, it.grams); delete it.row; }
        }
        if (n) { for (const key of MICROS) if (n[key] != null) it[key] = Math.round(n[key] * 100) / 100; if (it.ca == null) it.ca = 0; changed++; }
      }
    }
  }
  if (changed) store.save();
  return changed;
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
    <div class="muted">${c.w ? `최근 체중 ${c.w.kg}kg (${fmtDate(c.w.date)})` : '체중을 입력하면 목표가 계산됩니다'} · 목표 ${c.tg.kcal}kcal${c.tg.floored ? ` <span class="chip warn">하한 ${c.tg.floorKcal} 적용</span>` : c.tg.mode === 'manual' ? ' <span class="chip">직접 지정</span>' : ''} · 단백질 ${c.tg.prot}g</div>
    <div style="margin-top:8px" class="kv"><span>칼로리 ${c.total.kcal} / ${c.tg.kcal}</span><span class="${over ? 'chip bad' : 'chip'}">${over ? '초과 ' + (c.total.kcal - c.tg.kcal) : '남음 ' + (c.tg.kcal - c.total.kcal)}</span></div>
    <div class="bar ${over ? 'over' : ''}"><i style="width:${Math.min(100, pct(c.total.kcal, c.tg.kcal))}%"></i></div>
    <div style="margin-top:6px" class="kv"><span>단백질 ${r1(c.total.prot)} / ${c.tg.prot}g</span><span class="chip">${pct(c.total.prot, c.tg.prot)}%</span></div>
    <div class="bar prot"><i style="width:${Math.min(100, pct(c.total.prot, c.tg.prot))}%"></i></div>
    <div class="muted small" style="margin-top:6px">탄 ${r1(c.total.carb)}g · 지 ${r1(c.total.fat)}g · 섬유 ${r1(c.total.fiber)}g · 나트륨 ${Math.round(c.total.sodium)}mg</div>
  </div>`;
  for (const m of MEALS) h += mealCard(iso, m, c);
  const sup = supplementFor(c.p);
  if (sup.id !== 'none') h += `<div class="card ${c.day.supp ? 'logged' : ''}"><label class="check" style="padding:0"><input type="checkbox" data-action="supp" ${c.day.supp ? 'checked' : ''}><span><b>영양제</b> ${esc(sup.name)} 1정<span class="muted small" style="display:block">비타민D ${sup.vd}μg · A ${sup.va}μg · C ${sup.vc}mg · B1 ${sup.b1}mg · B2 ${sup.b2}mg · 니아신 ${sup.nia}mg${sup.fe ? ' · 철 ' + sup.fe + 'mg' : ''} — 체크하면 오늘 영양 합계에 포함</span></span></label></div>`;
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
  const combo = retortCombo(b, iso + m, c.p);
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
      <ul class="list">${retortsFor(c.p).map((r) => { const it = retortItem(r); const n = d.items.filter((x) => x.rid === r.id).length; return `<li><span class="name">${esc(it.name)}<span class="sub">${it.kcal} kcal · 단백질 ${r1(it.prot)}g</span></span><span class="stepper"><button data-action="retort-dec" data-rid="${r.id}">−</button><span>${n}</span><button data-action="retort-inc" data-rid="${r.id}">+</button></span></li>`; }).join('')}</ul>
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
      <div class="small muted" style="margin-top:8px">레토르트 대안: ${retortCombo(b, iso + m, c.p).map((i) => esc(i.name)).join(' + ')}</div></div>`;
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
  {
    const latest = store.latestWeight(store.today());
    const a7 = weightAvg(store.state.weights, store.today(), 7);
    const a7prev = weightAvg(store.state.weights, addDays(store.today(), -7), 7);
    const tr = weightTrend(store.state.weights, store.today(), 14);
    const rec = recommended(store.state.profile);
    let paceMsg = '';
    if (tr) {
      const lose = -tr.perWeek;
      if (lose >= rec.paceDanger) paceMsg = `<div class="banner lunchbox small">최근 2주 감량 속도 주 ${lose.toFixed(2)} kg. 주 1.5 kg 이상이 이어지면 담석 위험이 커집니다. 목표 칼로리를 200~300 올리거나 속도를 낮추세요.</div>`;
      else if (lose > rec.paceMax) paceMsg = `<div class="banner partial small">최근 2주 주 ${lose.toFixed(2)} kg. 안전 범위(주 1.0 kg) 위쪽입니다. 끼니를 거르지 말고 단백질을 채우세요.</div>`;
      else if (lose >= rec.paceMin) paceMsg = `<div class="banner ok small">최근 2주 주 ${lose.toFixed(2)} kg 감량. 안전하고 충분한 속도입니다 (목표 주 ${tg.pace} kg).</div>`;
      else if (lose >= 0) paceMsg = `<div class="banner partial small">최근 2주 주 ${lose.toFixed(2)} kg. 목표(주 ${tg.pace} kg)보다 느립니다. 4주 이상 이어지면 설정에서 속도를 한 단계 올리거나 산책을 늘리세요.</div>`;
      else paceMsg = `<div class="banner partial small">최근 2주 체중이 주 ${(-lose).toFixed(2)} kg 늘었습니다. 기록 누락이나 외식이 잦지 않았는지 확인해 보세요.</div>`;
    } else paceMsg = `<div class="muted small">감량 속도는 서로 다른 날짜의 체중이 3개 이상(5일 이상 간격) 모이면 계산됩니다.</div>`;
    h += `<div class="card"><h2>체중</h2>
      <div class="kv"><span>최근 체중</span><b>${latest ? latest.kg + ' kg (' + fmtDate(latest.date) + ')' : '기록 없음'}</b>
      <span>7일 평균</span><b>${a7 ? a7.avg + ' kg (' + a7.n + '회)' : '-'}${a7 && a7prev ? ` <span class="chip ${a7.avg <= a7prev.avg ? 'ok' : 'warn'}">지난주 대비 ${(a7.avg - a7prev.avg > 0 ? '+' : '') + (a7.avg - a7prev.avg).toFixed(2)}</span>` : ''}</b>
      <span>2주 추세</span><b>${tr ? (tr.perWeek > 0 ? '+' : '') + tr.perWeek + ' kg/주' : '-'}</b></div>${paceMsg}</div>`;
  }
  // ---- 기간 선택 차트 (체중·칼로리·단백질) ----
  const RANGES = [[7, '7일'], [14, '14일'], [30, '1달'], [365, '1년'], [0, '전체']];
  const firstRecord = () => { const ks = [...Object.keys(store.state.weights), ...Object.keys(store.state.days).filter((k) => MEALS.some((m) => store.state.days[k].meals?.[m]?.source))].sort(); return ks[0] || store.today(); };
  const rangeDays = (d) => d || Math.max(14, Math.round((new Date(store.today() + 'T12:00:00') - new Date(firstRecord() + 'T12:00:00')) / 86400000) + 1);
  const rangeSeg = (chart) => `<div class="row between" style="margin-top:8px"><span class="muted small">기간</span><span class="seg sm">${RANGES.map(([d, l]) => `<button class="${(ui.range[chart] ?? 14) === d ? 'on' : ''}" data-action="range" data-chart="${chart}" data-days="${d}">${l}</button>`).join('')}</span></div>`;
  const totalsOf = (iso) => { const d = store.state.days[iso]; if (!d || !MEALS.some((m) => d.meals?.[m]?.source)) return null; return dayTotal(d, store.state.profile); };
  const bucketOf = (n) => (n <= 31 ? 1 : n <= 400 ? 7 : 30);
  const fmtTick = (iso, b) => (b >= 30 ? iso.slice(2, 7).replace('-', '/') : iso.slice(5).replace('-', '/'));

  // 체중: 점+선, 이동평균선
  {
    const nDays = rangeDays(ui.range.w ?? 30);
    const dayList = lastNDays(nDays);
    const pts = dayList.map((iso, i) => ({ i, iso, kg: store.state.weights[iso] })).filter((p) => p.kg != null);
    const W = 600, H = 180, padL = 44, padR = 16, padT = 16, padB = 26;
    let body = '', chip = '';
    if (!pts.length) body = `<div class="muted small" style="margin:8px 0">이 기간에 체중 기록이 없습니다. 오늘 탭에서 체중을 입력하면 점이 찍힙니다.</div>`;
    else {
      const lo = Math.min(...pts.map((p) => p.kg)), hi = Math.max(...pts.map((p) => p.kg));
      const min = Math.floor((lo - 0.5) * 2) / 2, max = Math.ceil((hi + 0.5) * 2) / 2;
      const x = (i) => padL + (i / Math.max(1, nDays - 1)) * (W - padL - padR), y = (kg) => H - padB - ((kg - min) / (max - min)) * (H - padB - padT);
      const path = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
      const maWin = nDays <= 31 ? 7 : nDays <= 400 ? 28 : 90;
      const maPath = pts.map((p, k) => { const a = weightAvg(store.state.weights, p.iso, maWin); return `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(a.avg).toFixed(1)}`; }).join(' ');
      const showDots = pts.length <= 60;
      const first = pts[0], last = pts[pts.length - 1];
      const every = Math.max(1, Math.ceil(nDays / 6));
      const grid = [min, (min + max) / 2, max];
      chip = pts.length >= 2 ? `<span class="chip ${last.kg <= first.kg ? 'ok' : 'warn'}">${(last.kg - first.kg > 0 ? '+' : '') + (last.kg - first.kg).toFixed(1)} kg</span>` : '';
      body = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="체중 추이">
        ${grid.map((g) => `<line x1="${padL}" x2="${W - padR}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" stroke="var(--line)"/><text x="${padL - 6}" y="${(y(g) + 4).toFixed(1)}" font-size="10" fill="var(--muted)" text-anchor="end">${g}</text>`).join('')}
        <path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" opacity="0.5"/>
        <path d="${maPath}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/>
        ${showDots ? pts.map((p) => `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="4" fill="var(--brand)" stroke="var(--card)" stroke-width="2"><title>${p.iso} ${p.kg}kg</title></circle>`).join('') : ''}
        <text x="${x(last.i).toFixed(1)}" y="${(y(last.kg) - 9).toFixed(1)}" font-size="11" fill="var(--ink)" text-anchor="${last.i > nDays * 0.85 ? 'end' : 'middle'}" font-weight="600">${last.kg} kg</text>
        ${dayList.map((iso, i) => (i % every === (nDays - 1) % every) ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="10" fill="var(--muted)" text-anchor="middle">${fmtTick(iso, nDays > 400 ? 30 : 1)}</text>` : '').join('')}
        </svg><div class="legend"><span><i style="background:var(--brand);opacity:.5"></i>일일 체중</span><span><i style="background:var(--ink);height:2px;vertical-align:2px"></i>${maWin}일 이동평균</span></div>`;
    }
    h += `<div class="card"><div class="row between"><h2 class="tight">체중 추이</h2>${chip}</div>${body}${rangeSeg('w')}</div>`;
  }

  // 칼로리·단백질: 막대 + 이동평균선 (기간에 따라 일/주/월 단위로 묶음)
  const barChart = (chart, title, key, target, color, unitLabel) => {
    const nDays = rangeDays(ui.range[chart] ?? 14);
    const dayList = lastNDays(nDays);
    const daily = dayList.map((iso) => { const t = totalsOf(iso); return { iso, v: t ? t[key] : null }; });
    const b = bucketOf(nDays);
    const buckets = [];
    for (let e = daily.length; e > 0; e -= b) { const sl = daily.slice(Math.max(0, e - b), e); const vs = sl.map((z) => z.v).filter((v) => v != null); buckets.unshift({ iso: sl[0].iso, end: sl[sl.length - 1].iso, v: vs.length ? vs.reduce((a, c) => a + c, 0) / vs.length : null, n: vs.length }); }
    const win = b === 1 ? 7 : b === 7 ? 4 : 3;
    const ma = buckets.map((_, i) => { const w = buckets.slice(Math.max(0, i - win + 1), i + 1).filter((z) => z.v != null); return w.length ? w.reduce((a, z) => a + z.v, 0) / w.length : null; });
    const n = buckets.length;
    const W = 600, H = 190, padL = 36, padR = 16, padT = 18, padB = 26;
    const vals = buckets.map((z) => z.v ?? 0);
    const maxV = Math.max(target * 1.2, ...vals, ...ma.filter((v) => v != null)) || 1;
    const y = (v) => H - padB - (v / maxV) * (H - padB - padT);
    const slot = (W - padL - padR) / n, bw = Math.max(2, Math.min(30, slot * 0.62));
    const x = (i) => padL + slot * i + (slot - bw) / 2;
    let d = '', pen = false;
    ma.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? ' L' : ' M') + `${(x(i) + bw / 2).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    const lastMa = ma[n - 1];
    const every = Math.max(1, Math.ceil(n / 7));
    const barLabel = b === 1 ? '일일' : b === 7 ? '주 평균' : '월 평균';
    const maLabel = b === 1 ? '7일 이동평균' : b === 7 ? '4주 이동평균' : '3개월 이동평균';
    const hasAny = buckets.some((z) => z.v != null);
    return `<div class="card"><h2>${title} <span class="muted small">${unitLabel}</span></h2>
      ${hasAny ? `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
        <line x1="${padL}" x2="${W - padR}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="${W - padR}" y="${(y(target) - 4).toFixed(1)}" font-size="11" fill="var(--muted)" text-anchor="end">목표 ${target}</text>
        ${buckets.map((z, i) => z.v != null ? `<rect x="${x(i).toFixed(1)}" y="${y(z.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, H - padB - y(z.v)).toFixed(1)}" rx="${Math.min(3, bw / 2)}" fill="${key === 'kcal' && z.v > target * 1.05 ? 'var(--bad)' : color}" opacity="0.85"><title>${z.iso}${b > 1 ? '~' + z.end : ''}: ${Math.round(z.v)}${b > 1 ? ' (' + z.n + '일 평균)' : ''}</title></rect>` : '').join('')}
        <path d="${d.trim()}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
        ${lastMa != null ? `<text x="${(x(n - 1) + bw / 2).toFixed(1)}" y="${(y(lastMa) - 6).toFixed(1)}" font-size="11" fill="var(--ink)" text-anchor="${n > 3 ? 'end' : 'middle'}" font-weight="600">${Math.round(lastMa)}</text>` : ''}
        ${buckets.map((z, i) => (i % every === (n - 1) % every) ? `<text x="${(x(i) + bw / 2).toFixed(1)}" y="${H - 8}" font-size="10" fill="var(--muted)" text-anchor="middle">${fmtTick(z.iso, b)}</text>` : '').join('')}
        <line x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}" stroke="var(--line)"/></svg>
      <div class="legend"><span><i style="background:${color}"></i>${barLabel}</span><span><i style="background:var(--ink);height:2px;vertical-align:2px"></i>${maLabel}</span><span><i style="border-top:2px dashed var(--muted);height:0;vertical-align:2px"></i>목표</span></div>` : `<div class="muted small" style="margin:8px 0">이 기간에 식사 기록이 없습니다.</div>`}
      ${rangeSeg(chart)}</div>`;
  };
  h += barChart('k', '칼로리', 'kcal', tg.kcal, 'var(--brand)', `7일 평균 ${avg('kcal')} / 목표 ${tg.kcal} kcal`);
  h += barChart('p', '단백질', 'prot', tg.prot, 'var(--accent)', `7일 평균 ${avg('prot')} / 목표 ${tg.prot} g`);
  // 산책 & 준수
  const walkCount = rows.reduce((a, r) => a + (r.walks.l ? 1 : 0) + (r.walks.d ? 1 : 0), 0);
  h += `<div class="card"><div class="row between"><h2 class="tight">식후 산책 7일</h2><span class="chip ${walkCount >= 10 ? 'ok' : walkCount >= 6 ? 'warn' : ''}">${walkCount} / 14</span></div>
    <div class="dots" style="margin-top:8px">${rows.map((r) => `<span class="dot ${r.walks.l && r.walks.d ? 'on' : (r.walks.l || r.walks.d) ? 'half' : ''}" title="${r.iso}">${fmtDate(r.iso).slice(-2, -1)}</span>`).join('')}</div>
    <div class="muted small" style="margin-top:6px">점심·저녁 각 15분. 초록=둘 다, 연두=하나만.</div></div>`;
  // 영양 표: 오늘 | 7일 평균 | 목표 (+ 미량영양소 펼치기)
  const todayT = ctx(store.today()).total;
  const fmtV = (v, k) => (v == null ? '-' : (k === 'kcal' || NUTR_UNIT[k] === 'mg' || k === 'va' ? Math.round(v) : Math.round(v * 10) / 10));
  const cell = (v, k) => { if (v == null || !tg[k]) return `<td>${fmtV(v, k)}</td>`; const r = v / tg[k]; const cls = UPPER_LIMIT.has(k) ? (r > 1 ? 'bad' : 'ok') : (r >= 0.9 ? 'ok' : r >= 0.6 ? 'warn' : 'bad'); return `<td><span class="chip ${cls}">${fmtV(v, k)}</span></td>`; };
  const rowHtml = (k) => `<tr><th>${NUTR_LABEL[k]}<span class="muted small" style="font-weight:400"> ${NUTR_UNIT[k]}</span></th>${cell(todayT[k], k)}${cell(logged.length ? avg(k) : null, k)}<td class="muted">${tg[k] ?? '-'}${UPPER_LIMIT.has(k) ? ' 이하' : ''}</td></tr>`;
  h += `<div class="card"><h2>영양 섭취 <span class="muted small">(7일 평균은 기록 있는 ${logged.length}일 기준)</span></h2><div class="muted small" style="margin-bottom:6px">목표는 설정(성별·나이·키·활동량·감량 속도)과 최근 체중으로 계산됩니다${tg.floored ? ` · 현재 하한 ${tg.floorKcal} kcal 적용` : ''}${tg.mode === 'manual' ? ' · 목표 칼로리 직접 지정 중' : ''}. 초록 90% 이상 · 주황 60~90% · 빨강 60% 미만(상한형은 초과 시 빨강)</div>
    <div style="overflow-x:auto"><table class="menu-table"><thead><tr><th></th><th>오늘</th><th>7일 평균</th><th>목표</th></tr></thead><tbody>
    ${NUTRS.map(rowHtml).join('')}</tbody></table></div>
    <details style="margin-top:8px"><summary>미량영양소·비타민 펼치기 (중요도 순)</summary><div style="overflow-x:auto"><table class="menu-table"><thead><tr><th></th><th>오늘</th><th>7일 평균</th><th>목표</th></tr></thead><tbody>${MICROS.map(rowHtml).join('')}</tbody></table></div>
    <div class="muted small" style="margin-top:6px">목표: 한국인 영양섭취기준(2020) 성인 권장·충분섭취량. 콜레스테롤·포화지방은 권고 상한. 진선미 메뉴·외식은 식약처 DB에 미량영양소 값이 있는 항목만 합산되므로 실제보다 낮게 나올 수 있습니다. ${supplementFor(store.state.profile).id !== 'none' ? '영양제 체크 시 라벨값이 더해집니다(엽산·B12·아연 등 표에 없는 성분은 영양제로 충족).' : ''}</div></details></div>`;
  // 히스토리
  const all = Object.keys(store.state.days).filter((k) => MEALS.some((m) => store.state.days[k].meals?.[m]?.source)).sort().reverse().slice(0, 60);
  h += `<div class="card"><h2>지난 기록</h2>${all.length ? `<ul class="list hist">${all.map((iso) => { const dd = store.state.days[iso]; const t = dayTotal(dd, store.state.profile); return `<li data-action="goto" data-date="${iso}" style="cursor:pointer"><span class="name"><span class="d">${fmtDate(iso)}</span> ${store.state.weights[iso] ? '· ' + store.state.weights[iso] + 'kg' : ''}<span class="sub">${MEALS.filter((m) => dd.meals[m]?.source).map((m) => MEAL_NAME[m] + ':' + srcLabel(dd.meals[m].source)).join(' ')} ${dd.walks.l || dd.walks.d ? '· 산책 ' + ((dd.walks.l ? 1 : 0) + (dd.walks.d ? 1 : 0)) : ''}</span></span><span class="chip">${t.kcal} kcal · ${Math.round(t.prot)}g</span></li>`; }).join('')}</ul>` : '<div class="muted">아직 기록이 없습니다</div>'}</div>`;
  h += `<div class="card"><h2>백업</h2><div class="btns"><button class="btn" data-action="export">JSON 내보내기</button><button class="btn" data-action="import">JSON 가져오기</button></div><div class="muted small" style="margin-top:6px">기록은 이 기기(브라우저)에만 저장됩니다. 가끔 내보내기로 백업해 두세요.</div></div>`;
  return h;
}

/* ===== 설정 ===== */
function viewSettings() {
  const p = store.state.profile;
  const w = store.latestWeight();
  const tg = targets(p, w ? w.kg : null);
  const rec = recommended(p);
  const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
  return `<h1>설정</h1>
  <div class="card"><h2>프로필</h2>
    <div class="grid2">
      <label class="f">이름<input type="text" id="p-name" value="${esc(p.name)}"></label>
      <label class="f">성별<select id="p-sex">${opt('M', p.sex, '남')}${opt('F', p.sex, '여')}</select></label>
      <label class="f">나이<input type="number" id="p-age" value="${p.age}"></label>
      <label class="f">키 (cm)<input type="number" id="p-height" value="${p.heightCm}"></label>
      <label class="f">활동량<select id="p-activity">${opt(1.2, p.activity, '거의 안 움직임 1.2')}${opt(1.375, p.activity, '가벼운 활동 1.375')}${opt(1.55, p.activity, '보통 1.55')}${opt(1.725, p.activity, '활발 1.725')}</select></label>
      <label class="f">목표 감량 속도<select id="p-pace">${[0.4, 0.5, 0.6, 0.75, 0.9, 1.0].map((v) => opt(v, p.pace, `주 ${v} kg (월 약 ${Math.round(v * 4.3 * 10) / 10} kg)`)).join('')}</select></label>
      <label class="f">단백질 g/kg (비우면 권장값 ${rec.proteinPerKg})<input type="number" step="0.1" id="p-ppk" value="${p.proteinPerKg ?? ''}" placeholder="자동 ${rec.proteinPerKg}"></label>
      <label class="f">목표 칼로리 직접 지정 (비우면 자동)<input type="number" step="10" id="p-goal" value="${p.goalKcal ?? ''}" placeholder="자동"></label>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" id="p-nodairy" ${p.noDairy ? 'checked' : ''}><span>유제품(그릭요거트·우유 등) 추천에서 제외</span></label>
      <label class="f" style="grid-column:1/-1">영양제 (오늘 탭에서 체크하면 영양 합계에 포함)<select id="p-supp">${opt('auto', p.supplement || 'auto', '자동 (남: One Daily Iron Free / 여: Women\'s One Daily)')}${opt('mf-men', p.supplement, SUPPLEMENTS['mf-men'].name)}${opt('mf-women', p.supplement, SUPPLEMENTS['mf-women'].name)}${opt('none', p.supplement, '없음')}</select></label>
    </div>
    <div class="banner ${tg.belowFloor ? 'lunchbox' : tg.floored ? 'partial' : 'ok'} small">
      <b>계산 결과</b> ${w ? `(체중 ${w.kg}kg 기준)` : '(체중 미입력: 70kg 가정)'}<br>
      기초대사 ${tg.bmr} · 유지 ${tg.tdee} kcal → <b>목표 ${tg.kcal} kcal/일</b> (적자 ${tg.deficit}) · 예상 감량 주 ${tg.expectedPace} kg<br>
      단백질 ${tg.prot} g (${tg.ppk} g/kg) · 지방 ${tg.fat} g 이하 · 식이섬유 25 g<br>
      ${tg.floored ? `⚠ 원하는 속도로는 하한(${tg.floorKcal} kcal) 아래로 내려가서 하한을 적용했습니다. 감량 속도는 활동량(산책)으로 보태세요.` : ''}
      ${tg.belowFloor ? `⚠ 직접 지정한 목표가 권장 하한(${tg.floorKcal} kcal)보다 낮습니다. 의료진과 상의한 값이 아니라면 올리세요.` : ''}
    </div>
    <details><summary>${p.sex === 'F' ? '여성' : '남성'} ${p.age}세 · 마운자로 병용 시 권장 원칙</summary><ul class="steps small">${rec.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><div class="muted small">일반적인 임상 권고를 요약한 것이며 개인 처방을 대체하지 않습니다.</div></details>
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
  if (t.dataset.action === 'supp') { const d = store.day(ui.date); d.supp = t.checked; store.save(); render(); }
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
    case 'range': ui.range[el.dataset.chart] = +el.dataset.days; try { localStorage.setItem('ds.range', JSON.stringify(ui.range)); } catch {} render(); break;
    case 'goto': ui.date = el.dataset.date; ui.tab = 'today'; ui.panel = null; render(); break;
    case 'export': exportJSON(); break;
    case 'import': importJSON(); break;
    case 'save-profile': saveProfile(); break;
    case 'reload-app': navigator.serviceWorker?.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))).then(() => caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))).then(() => location.reload(true)); break;
  }
});

function rotatePlan(iso, m) {
  const day = store.day(iso);
  const c = ctx(iso);
  const list = m === 'b' ? breakfastsFor(c.p) : lunchboxesFor(c.p);
  const cur = plannedRecipe(iso, m, c.budgets[m].kcal).id;
  const i = list.findIndex((r) => r.id === cur);
  day.plan[m] = list[(i + 1) % list.length].id;
  store.save();
}

function saveProfile() {
  const p = store.state.profile;
  p.name = $('#p-name').value.trim(); p.sex = $('#p-sex').value; p.age = +$('#p-age').value || p.age; p.heightCm = +$('#p-height').value || p.heightCm;
  p.activity = +$('#p-activity').value; p.pace = +$('#p-pace').value || 0.6; p.noDairy = $('#p-nodairy').checked; p.supplement = $('#p-supp').value;
  const ppk = parseFloat($('#p-ppk').value); p.proteinPerKg = ppk > 0 ? ppk : null;
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
