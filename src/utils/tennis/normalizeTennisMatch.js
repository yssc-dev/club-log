// Firebase RTDB는 빈 배열/빈 객체를 저장하지 않고, 배열을 {0:..,1:..} 객체로 돌려주기도 한다.
// 동기화 직후 rounds/courts/sets/sideA 등이 undefined가 되는 문제를 여기 한 지점에서만 복원한다.
// ★ 호출부에서 `(x || [])` 로 땜질하지 말 것 — 방어가 흩어지면 다음 필드에서 또 터진다.

import { emptySet } from './tennisScoring';

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

function normalizeSet(s) {
  const base = emptySet();
  if (!s || typeof s !== 'object') return base;
  return {
    a: s.a || 0,
    b: s.b || 0,
    tbA: s.tbA || 0,
    tbB: s.tbB || 0,
    done: s.done === true,
  };
}

export function normalizeTennisCourt(court) {
  if (!court || typeof court !== 'object') return court;
  return {
    ...court,
    format: court.format || '단식',
    bestOf: court.bestOf || 1,
    status: court.status || 'ready',
    currentSet: court.currentSet || 0,
    sideA: asArray(court.sideA),
    sideB: asArray(court.sideB),
    sets: asArray(court.sets).map(normalizeSet),
    stats: (court.stats && typeof court.stats === 'object') ? court.stats : {},
    undoStack: asArray(court.undoStack),
  };
}

// confirmedRounds는 숫자 키 객체 — RTDB가 [null,true,…] 배열로 되돌릴 수 있다.
function normalizeConfirmedRounds(v) {
  if (!v || typeof v !== 'object') return {};
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (val === true) out[k] = true;
  }
  return out;
}

export function normalizeTennisMatch(state) {
  if (!state) return null;
  const rounds = asArray(state.rounds)
    .map(r => ({
      ...r,
      roundIdx: r?.roundIdx || 0,
      courts: asArray(r?.courts).map(normalizeTennisCourt),
    }))
    .sort((x, y) => x.roundIdx - y.roundIdx);

  return {
    ...state,
    attendees: asArray(state.attendees),
    guests: asArray(state.guests),
    rounds,
    confirmedRounds: normalizeConfirmedRounds(state.confirmedRounds),
  };
}
