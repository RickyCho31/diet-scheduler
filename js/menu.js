// 진선미관 주간 식단 로딩/조회
import { matchMenuItem } from './foods.js';

let MENU = null;

export async function loadMenu() {
  try {
    const r = await fetch('data/menu/latest.json', { cache: 'no-cache' });
    MENU = await r.json();
  } catch (e) {
    MENU = { weeks: [], error: String(e) };
  }
  return MENU;
}

export function menuData() { return MENU; }

export function menuFor(iso) {
  if (!MENU) return null;
  for (const w of MENU.weeks) for (const d of w.days) if (d.date === iso) return d;
  return null;
}

/** 특정 날짜/끼니의 메뉴 항목을 영양 추정치와 함께 */
export function cafeteriaItems(iso, meal) {
  const day = menuFor(iso);
  if (!day) return null;
  const key = meal === 'l' ? 'lunch' : meal === 'd' ? 'dinner' : 'breakfast';
  const list = day[key] || [];
  if (!list.length) return [];
  return list.map((raw) => matchMenuItem(raw));
}

export function weekStarting(iso) {
  if (!MENU) return null;
  return MENU.weeks.find((w) => w.week_start <= iso && iso <= w.week_end) || null;
}
