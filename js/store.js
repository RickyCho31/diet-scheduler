// 로컬 저장소 (localStorage). 기록은 절대 삭제하지 않고 날짜별로 누적.
const KEY = 'diet-scheduler.v1';

export const MEALS = ['b', 'l', 's', 'd'];
export const MEAL_NAME = { b: '아침', l: '점심', s: '간식', d: '저녁' };

const DEFAULT_PROFILE = {
  name: '', sex: 'M', age: 40, heightCm: 175, activity: 1.375,
  goalKcal: null,          // null이면 TDEE - deficit
  deficit: 500,
  proteinPerKg: 1.4,
  split: { b: 0.22, l: 0.34, s: 0.10, d: 0.34 },
  shake: { scoopG: 30, kcalPerScoop: 120, protPerScoop: 24, maxScoops: 2 },
  nuts: { kcalPer10g: 60, protPer10g: 2 },
  onMounjaro: true,
};

function today() { return localDate(new Date()); }
export function localDate(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
}

function blankDay() {
  return { meals: { b: null, l: null, s: null, d: null }, walks: { l: false, d: false }, prepared: { l: false, d: false, b: false }, plan: {}, note: '' };
}

export const store = {
  state: null,
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.state = raw ? JSON.parse(raw) : null;
    } catch { this.state = null; }
    if (!this.state) this.state = { version: 1, profile: { ...DEFAULT_PROFILE }, weights: {}, days: {}, createdAt: new Date().toISOString() };
    this.state.profile = { ...DEFAULT_PROFILE, ...this.state.profile, split: { ...DEFAULT_PROFILE.split, ...(this.state.profile.split || {}) }, shake: { ...DEFAULT_PROFILE.shake, ...(this.state.profile.shake || {}) }, nuts: { ...DEFAULT_PROFILE.nuts, ...(this.state.profile.nuts || {}) } };
    return this.state;
  },
  save() {
    this.state.updatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(this.state));
  },
  day(iso = today()) {
    if (!this.state.days[iso]) this.state.days[iso] = blankDay();
    const d = this.state.days[iso];
    if (!d.prepared) d.prepared = { l: false, d: false, b: false };
    if (!d.plan) d.plan = {};
    return d;
  },
  hasDay(iso) { return !!this.state.days[iso]; },
  setWeight(iso, kg) { if (kg > 20 && kg < 300) { this.state.weights[iso] = Math.round(kg * 10) / 10; this.save(); } },
  latestWeight(beforeOrOn = today()) {
    const keys = Object.keys(this.state.weights).filter((k) => k <= beforeOrOn).sort();
    return keys.length ? { date: keys[keys.length - 1], kg: this.state.weights[keys[keys.length - 1]] } : null;
  },
  exportJSON() { return JSON.stringify(this.state, null, 1); },
  importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || !obj.days || !obj.profile) throw new Error('형식이 맞지 않습니다');
    // 병합: 기존 기록은 유지, 가져온 날짜가 있으면 덮어씀
    this.state.profile = { ...this.state.profile, ...obj.profile };
    Object.assign(this.state.weights, obj.weights || {});
    Object.assign(this.state.days, obj.days || {});
    this.save();
  },
  today,
};
