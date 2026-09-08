// 구글시트 읽기 캐시 — L1 메모리 → L2 RTDB → L3 Apps Script/시트.
//
// 목적: 앱 진입·탭 전환마다 시트를 전량 재조회하던 것을 없앤다.
// 핵심 판단: "바뀌었는지"를 Apps Script 에 물으면 확인 자체가 콜드스타트 왕복
// (2~10초)이다. 그래서 버전 마커를 RTDB 에 두고 평상시 Apps Script 를 치지 않는다.
//
// 불변식: 캐시의 어떤 실패도 화면을 죽이지 않는다. 모든 실패 경로는 L3 직행
// (= 캐시 도입 전과 동일한 동작)으로 폴백한다.
//
// 설계: docs/superpowers/specs/2026-09-08-sheet-cache-design.md

import { ref, get, set, remove, serverTimestamp } from 'firebase/database';
import { firebaseDb } from '../config/firebase';
import AuthUtil from './authUtil';
import TennisSync from './tennisSync';
import { cachePath } from './rtdbPath';
import { encodeRows, readCacheNode, shouldStore } from './sheetCacheCore';
import {
  TENNIS_ROSTER_CACHE_COLUMNS,
  TENNIS_PLAYER_GAME_COLUMNS,
  TENNIS_LEGACY_COLUMNS,
} from '../utils/tennis/tennisSchema';

// 롤백 스위치 — true 면 모든 호출이 L3 직행. 캐시 도입 전과 동일한 동작이 된다.
export const DISABLED = false;

const L1_TTL_MS = 5 * 60 * 1000;          // appSync 대회 캐시와 같은 관례.
                                          // 무제한이면 오래 열어둔 탭이 갱신을 영영 못 본다.
export const L2_TTL_MS = 30 * 60 * 1000;  // 쓰기 경로 무효화가 붙기 전(2단계)이라 짧게 둔다.

// 종목 → 데이터셋 → { columns, fetch }.
// 축구·풋살 확장은 여기에 항목을 추가하는 것으로 끝난다.
const ADAPTERS = {
  '테니스': {
    roster:      { columns: TENNIS_ROSTER_CACHE_COLUMNS, fetch: () => TennisSync.getRoster() },
    playerGames: { columns: TENNIS_PLAYER_GAME_COLUMNS,  fetch: () => TennisSync.getPlayerGames() },
    legacy:      { columns: TENNIS_LEGACY_COLUMNS,       fetch: () => TennisSync.getLegacyRecords() },
  },
};

const _l1 = new Map();       // path → { rows, ts }
const _inflight = new Map(); // path → Promise

function _ctx() {
  const a = AuthUtil.getStored();
  return { team: a?.team || '', sport: a?.mode || '' };
}

function _adapter(sport, dataset) {
  return ADAPTERS[sport]?.[dataset] || null;
}

// L3 조회 후 L2 저장. store 실패를 호출부가 구분할 수 있도록 throw 한다.
async function _fetchAndStore(adapter, path) {
  const rows = (await adapter.fetch()) || [];
  if (shouldStore(rows)) {
    await set(ref(firebaseDb, path), {
      ...encodeRows(adapter.columns, rows),
      version: serverTimestamp(),
    });
  }
  return rows;
}

const SheetCache = {
  datasetsOf(sport) {
    return Object.keys(ADAPTERS[sport] || {});
  },

  async get(dataset) {
    const { team, sport } = _ctx();
    const adapter = _adapter(sport, dataset);
    if (!adapter) return [];
    if (DISABLED) return (await adapter.fetch()) || [];

    const path = cachePath(team, sport, dataset);

    const hit = _l1.get(path);
    if (hit && Date.now() - hit.ts < L1_TTL_MS) return hit.rows;

    // 같은 노드를 동시에 요청하면(대시보드의 Promise.all) 하나로 합친다.
    const pending = _inflight.get(path);
    if (pending) return pending;

    const p = (async () => {
      let rows;
      try {
        const snap = await get(ref(firebaseDb, path));
        const res = readCacheNode(snap.val(), adapter.columns, L2_TTL_MS, Date.now());
        if (res.ok) {
          rows = res.rows;
        } else {
          rows = (await adapter.fetch()) || [];
          if (shouldStore(rows)) {
            try {
              await set(ref(firebaseDb, path), {
                ...encodeRows(adapter.columns, rows),
                version: serverTimestamp(),
              });
            } catch (e) { console.warn(`[sheetCache] ${dataset} L2 저장 실패:`, e.message); }
          }
        }
      } catch (e) {
        console.warn(`[sheetCache] ${dataset} L2 읽기 실패, 시트 폴백:`, e.message);
        rows = (await adapter.fetch()) || [];
      }
      _l1.set(path, { rows, ts: Date.now() });
      return rows;
    })();

    _inflight.set(path, p);
    try { return await p; } finally { _inflight.delete(path); }
  },

  // 쓰기 직후 재적재. 그냥 지우면 다음에 들어온 사람이 콜드스타트를 뒤집어쓴다.
  // 재적재가 실패하면 노드를 삭제해 다음 읽기가 시트로 폴백하게 강등한다 —
  // 낡은 캐시를 남기지 않는다.
  async refresh(dataset) {
    const { team, sport } = _ctx();
    const adapter = _adapter(sport, dataset);
    if (!adapter) return [];
    const path = cachePath(team, sport, dataset);
    _l1.delete(path);
    try {
      const rows = await _fetchAndStore(adapter, path);
      _l1.set(path, { rows, ts: Date.now() });
      return rows;
    } catch (e) {
      console.warn(`[sheetCache] ${dataset} 재적재 실패, 캐시 강등:`, e.message);
      try {
        await remove(ref(firebaseDb, path));
      } catch {
        // 삭제까지 실패하면 version 을 0 으로 덮어 즉시 만료시킨다(2단 방어).
        try { await set(ref(firebaseDb, `${path}/version`), 0); } catch { /* best-effort */ }
      }
      return [];
    }
  },

  async refreshAll() {
    const { sport } = _ctx();
    const out = [];
    for (const dataset of this.datasetsOf(sport)) {
      const rows = await this.refresh(dataset);
      out.push({ dataset, ok: true, count: rows.length });
    }
    return out;
  },

  // 설정 화면용. version/count 만 보고하고 rows 는 호출부에 노출하지 않는다.
  // 주의: `${path}/version` 처럼 하위 경로를 따로 get() 하지 않는다 — 실제 RTDB
  // 클라이언트는 그런 하위 경로 조회를 지원하지만, 이 노드는 어차피 작아서
  // 얻는 이득이 없고, 노드 전체를 한 번 읽는 편이 테스트 더블(경로 문자열 완전
  // 일치로만 값을 찾는 인메모리 스토어)과도 자연스럽게 맞는다.
  async status() {
    const { team, sport } = _ctx();
    const out = [];
    for (const dataset of this.datasetsOf(sport)) {
      const path = cachePath(team, sport, dataset);
      try {
        const snap = await get(ref(firebaseDb, path));
        const node = snap.val();
        out.push({
          dataset,
          version: typeof node?.version === 'number' ? node.version : null,
          count: typeof node?.count === 'number' ? node.count : null,
        });
      } catch {
        out.push({ dataset, version: null, count: null });
      }
    }
    return out;
  },

  // 테스트 전용 — L1/in-flight 만 비운다.
  _resetForTest() {
    _l1.clear();
    _inflight.clear();
  },
};

export default SheetCache;
