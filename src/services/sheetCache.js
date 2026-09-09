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
import AppSync from './appSync';
import { getEffectiveSettings } from '../config/settings';
import { cachePath } from './rtdbPath';
import { encodeRows, encodeRaw, readCacheNode, shouldStoreValue } from './sheetCacheCore';
import {
  TENNIS_ROSTER_CACHE_COLUMNS,
  TENNIS_PLAYER_GAME_COLUMNS,
  TENNIS_LEGACY_COLUMNS,
} from '../utils/tennis/tennisSchema';
import { RAW_MATCH_COLUMNS } from '../utils/matchRowBuilder';
import { RAW_EVENT_COLUMNS, RAW_PLAYER_GAME_COLUMNS } from '../utils/rawLogBuilders';
import { POINT_LOG_CACHE_COLUMNS, PLAYER_LOG_CACHE_COLUMNS } from '../utils/soccerCacheColumns';

// 롤백 스위치 — true 면 모든 호출이 L3 직행. 캐시 도입 전과 동일한 동작이 된다.
export const DISABLED = false;

const L1_TTL_MS = 5 * 60 * 1000;          // appSync 대회 캐시와 같은 관례.
                                          // 무제한이면 오래 열어둔 탭이 갱신을 영영 못 본다.
// 모든 쓰기 경로(마감·회원 upsert·자동 업로드 봇)가 재적재하므로 순수 백스톱이다.
export const L2_TTL_MS = 12 * 60 * 60 * 1000;

// 풋살·축구는 같은 Apps Script 함수를 쓰지만 sport 인자와 시트명이 다르다.
// {rows} 래퍼는 여기서 벗겨 배열만 캐시한다 — 호출부도 배열을 직접 받는다.
//
// sharedSheet: 서버가 sport 로 필터하지 않고 팀 단위로만 읽는 데이터셋 표시.
// pointLogSheet/playerLogSheet 는 settings.js 의 SHARED_KEYS 라 풋살·축구가 같은
// 시트를 본다(_getPointLog/_getPlayerLog/_getPrevRankings/_getCumulativeBonus 에
// sport 필터가 없다). 종목별 노드로 쪼개면 같은 내용이 두 노드로 갈려 마감 재적재가
// 한쪽만 갱신하고 반대편은 refreshAll 로도 영영 안 낡음이 풀리지 않는다 — 경로
// 생성에서 종목 세그먼트를 '공용' 으로 고정해 한 노드를 공유한다(_pathFor).
function soccerLikeAdapters(sport) {
  const adapters = {
    matchLog:      { columns: RAW_MATCH_COLUMNS,       fetch: () => AppSync.getMatchLog({ sport }).then(r => r?.rows || []) },
    eventLog:      { columns: RAW_EVENT_COLUMNS,       fetch: () => AppSync.getEventLog({ sport }).then(r => r?.rows || []) },
    playerGameLog: { columns: RAW_PLAYER_GAME_COLUMNS, fetch: () => AppSync.getPlayerGameLog({ sport }).then(r => r?.rows || []) },
    pointLog:  { columns: POINT_LOG_CACHE_COLUMNS,  sharedSheet: true, sheetOf: s => s.pointLogSheet,  fetch: s => AppSync.getPointLog(s.pointLogSheet) },
    playerLog: { columns: PLAYER_LOG_CACHE_COLUMNS, sharedSheet: true, sheetOf: s => s.playerLogSheet, fetch: s => AppSync.getPlayerLog(s.playerLogSheet) },
    latestDeltas:    { mode: 'raw', sharedSheet: true, sheetOf: s => s.playerLogSheet, fetch: s => AppSync.getLatestDeltas(s.playerLogSheet) },
  };
  // cumulativeBonus 는 풋살 전용이다 — 축구에 등록하면 안 된다.
  // 축구팀 선수집계 시트(예: 하버FC 선수기록보관소)에는 크로바·고구마 열이 아예 없어
  // _getCumulativeBonus 가 항상 { crova:{}, goguma:{} } 를 반환한다. 아래 isEmpty 가
  // 그걸 "조회 실패"로 판정하므로 refresh 가 영구히 { ok:false } 가 되고, SettingsScreen 의
  // "구글시트에서 다시 불러오기"가 매번 "누적보너스 갱신 실패"를 띄운다(다시 눌러도 동일).
  // refreshAll/status/마감 재적재는 전부 datasetsOf(sport) 를 순회하므로 "등록해도
  // 호출되지 않을 뿐" 이 아니다 — 종목별로 목록 자체를 다르게 둔다.
  if (sport === '풋살') {
    // AppSync.getCumulativeBonus 는 !enabled() 와 조회 실패 둘 다 { crova:{}, goguma:{} } 를
    // 반환한다(appSync.js) — top-level 키 존재만 보는 기본 판정(shouldStoreValue)으로는
    // "조회 실패"와 "보너스 0건"을 구분할 수 없다. isEmpty 로 내부까지 비었는지 본다.
    adapters.cumulativeBonus = {
      mode: 'raw', sharedSheet: true, sheetOf: s => s.playerLogSheet,
      isEmpty: v => !v || (Object.keys(v.crova || {}).length === 0 && Object.keys(v.goguma || {}).length === 0),
      fetch: s => AppSync.getCumulativeBonus(s.playerLogSheet),
    };
  }
  return adapters;
}

// 종목 → 데이터셋 → { mode?, columns?, sheetOf?, fetch }.
// 축구·풋살 확장은 여기에 항목을 추가하는 것으로 끝난다.
const ADAPTERS = {
  '테니스': {
    roster:      { columns: TENNIS_ROSTER_CACHE_COLUMNS, fetch: () => TennisSync.getRoster() },
    playerGames: { columns: TENNIS_PLAYER_GAME_COLUMNS,  fetch: () => TennisSync.getPlayerGames() },
    legacy:      { columns: TENNIS_LEGACY_COLUMNS,       fetch: () => TennisSync.getLegacyRecords() },
  },
  '풋살': soccerLikeAdapters('풋살'),
  '축구': soccerLikeAdapters('축구'),
};

const _l1 = new Map();       // path → { value, ts }
const _inflight = new Map(); // path → Promise
// path → 세대 번호. refresh() 가 fetch 전에 올리고, get() 은 자기 L3 fetch 전후를
// 비교해 "그 사이에 더 신선한 refresh 가 지나갔는지" 를 본다. get 의 L2 쓰기는
// 버전 비교 없이 serverTimestamp() 로 덮으므로, 이 가드가 없으면 오래 걸린 get
// (L3 콜드스타트 2~10초)의 마감 전 응답이 그 사이 도착한 마감 후 refresh 를
// 덮어쓰고 version 까지 더 최신으로 찍는다 — 모두에게 12시간 동안 오늘 경기가
// 빠진 데이터가 "최신" 으로 보인다.
//
// 한계: 모듈 로컬 Map 이므로 같은 탭(같은 JS 컨텍스트) 안의 경합만 막는다.
// 서로 다른 브라우저·사용자 사이의 같은 경합은 RTDB 트랜잭션(또는 version 비교
// 조건부 쓰기)이 필요하며 이 수정의 범위가 아니다.
const _gen = new Map();      // path → number

// 종목은 기본적으로 AuthUtil 의 mode 를 쓰지만, 화면이 자체 종목 토글을 가진 경우
// (TeamDashboard 의 activeSport — 겸직팀은 한 팀에 풋살·축구 탭이 함께 뜬다)
// 그 값을 명시적으로 넘겨야 한다. AuthUtil.mode 는 팀 선택 시 entries[0].mode 로
// 한 번 저장될 뿐 종목 탭 클릭으로 갱신되지 않는다(Root.jsx가 유일한 저장 호출부) —
// 오버라이드 없이 AuthUtil.mode 에만 의존하면 겸직팀에서 탭과 캐시 종목이 갈린다.
function _ctx(sportOverride) {
  const a = AuthUtil.getStored();
  const team = a?.team || '';
  const sport = sportOverride || a?.mode || '';
  return { team, sport, settings: getEffectiveSettings(team, sport) || {} };
}

function _adapter(sport, dataset) {
  return ADAPTERS[sport]?.[dataset] || null;
}

// 캐시 노드 경로의 단일 소스 — get/refresh/status 가 전부 이걸 써야 한다.
// sharedSheet 어댑터는 종목과 무관한 시트를 읽으므로 종목 세그먼트를 '공용' 으로
// 고정한다. 테니스 어댑터는 sharedSheet 를 선언하지 않으므로 기존 경로 그대로다.
function _pathFor(adapter, team, sport, dataset) {
  return cachePath(team, adapter.sharedSheet ? '공용' : sport, dataset);
}

// 어댑터 fetch 의 빈 결과 정규화. rows 모드는 [], raw 모드는 null 로 떨어뜨린다
// (raw 에서 [] 를 주면 readCacheNode 의 mode 판정과 어긋난다).
async function _fetchValue(adapter, settings) {
  return (await adapter.fetch(settings)) || (adapter.mode === 'raw' ? null : []);
}

// 어댑터가 isEmpty 를 선언하면 그걸로 "저장할 가치가 있는 결과인가"를 판정한다.
// 기본 판정(shouldStoreValue)은 top-level 키 존재만 보는 얕은 검사라, 실패 시에도
// 비어있지 않은 모양({crova:{}, goguma:{}} 등)을 돌려주는 어댑터(cumulativeBonus)는
// "조회 실패"와 "결과 0건"을 구분하지 못한다.
function _isEmptyValue(adapter, value) {
  if (adapter.isEmpty) return adapter.isEmpty(value);
  return !shouldStoreValue(value, adapter.mode || 'rows');
}

// 어댑터가 선언한 모드로 저장 노드를 만든다. sheetOf 가 있으면 sheetName 도 남긴다.
function _encodeNode(adapter, value, settings) {
  const mode = adapter.mode || 'rows';
  const body = mode === 'raw' ? encodeRaw(value) : encodeRows(adapter.columns, value);
  const sheetName = adapter.sheetOf ? adapter.sheetOf(settings) : undefined;
  return sheetName === undefined ? body : { ...body, sheetName };
}

function _readOpts(adapter, settings) {
  const opts = { mode: adapter.mode || 'rows', columns: adapter.columns };
  if (adapter.sheetOf) opts.sheetName = adapter.sheetOf(settings);
  return opts;
}

// L3 조회 후 L2 저장. 빈 결과나 저장 실패를 호출부(refresh)가 강등할 수 있도록
// 둘 다 throw 한다. refresh 의 호출부는 전부 쓰기 직후 무효화이므로, 이 시점의
// []는 "진짜 0행"일 수 없다 — get()의 보수적 보존(§6.1, shouldStoreValue)과 달리
// 여기서는 빈 결과도 실패로 본다(스펙 §5: 재적재 실패 시 낡은 캐시를 남기지 않는다).
async function _fetchAndStore(adapter, path, settings) {
  // 변수명은 value — raw 모드(latestDeltas/cumulativeBonus)에서는 배열이 아니라 맵이 담긴다.
  const value = await _fetchValue(adapter, settings);
  if (_isEmptyValue(adapter, value)) {
    throw new Error('재적재가 빈 결과를 받음 — 강등 대상');
  }
  await set(ref(firebaseDb, path), {
    ..._encodeNode(adapter, value, settings),
    version: serverTimestamp(),
  });
  return value;
}

const SheetCache = {
  datasetsOf(sport) {
    return Object.keys(ADAPTERS[sport] || {});
  },

  // get/refresh 가 sport 오버라이드 없이 쓰는 기본 종목. datasetsOf 로 목록을
  // 만드는 호출부(refreshAfterFinalize)가 같은 출처를 보게 노출한다 — 목록과
  // 실제 재적재 대상이 갈리지 않게 하는 게 목적이다.
  currentSport() {
    return _ctx().sport;
  },

  async get(dataset, { sport } = {}) {
    const { team, sport: sp, settings } = _ctx(sport);
    const adapter = _adapter(sp, dataset);
    if (!adapter) return [];
    if (DISABLED) return _fetchValue(adapter, settings);

    const path = _pathFor(adapter, team, sp, dataset);

    const hit = _l1.get(path);
    if (hit && Date.now() - hit.ts < L1_TTL_MS) return hit.value;

    // 같은 노드를 동시에 요청하면(대시보드의 Promise.all) 하나로 합친다.
    const pending = _inflight.get(path);
    if (pending) return pending;

    const p = (async () => {
      // raw 모드(latestDeltas/cumulativeBonus)에서는 배열이 아니라 맵이 담긴다.
      let value;
      // 세대 가드: L3 로 내려가기 전의 세대를 기억해 두고, L2/L1 에 쓰기 직전에
      // 다시 본다. 그 사이 refresh() 가 지나갔다면(= 더 신선한 데이터가 이미 노드에
      // 있다) 우리 응답은 낡았으므로 쓰지 않는다. 반환은 그대로 한다 — 호출 화면에
      // 빈 값을 내려보내는 것보다 약간 낡은 값을 주는 게 낫고, 다음 get() 은 더
      // 신선한 L2 를 히트한다.
      let genAtFetch = null;
      const staleNow = () => genAtFetch !== null && (_gen.get(path) || 0) !== genAtFetch;
      const fetchL3 = async () => {
        genAtFetch = _gen.get(path) || 0;
        return _fetchValue(adapter, settings);
      };
      try {
        const snap = await get(ref(firebaseDb, path));
        const res = readCacheNode(snap.val(), _readOpts(adapter, settings), L2_TTL_MS, Date.now());
        if (res.ok) {
          value = res.rows;
        } else {
          value = await fetchL3();
          if (!_isEmptyValue(adapter, value) && !staleNow()) {
            try {
              await set(ref(firebaseDb, path), {
                ..._encodeNode(adapter, value, settings),
                version: serverTimestamp(),
              });
            } catch (e) { console.warn(`[sheetCache] ${dataset} L2 저장 실패:`, e.message); }
          }
        }
      } catch (e) {
        console.warn(`[sheetCache] ${dataset} L2 읽기 실패, 시트 폴백:`, e.message);
        value = await fetchL3();
      }
      // 빈 결과는 L1에도 넣지 않는다(refresh 와 대칭, _isEmptyValue 로 판정).
      // Apps Script 콜드스타트 실패가 _safeRead 에 의해 []로 삼켜진 경우, 이걸
      // L1에 5분 박으면 이후 모든 탭 전환이 같은 빈 화면을 반복해서 보여준다 —
      // 캐시 도입 전엔 탭을 바꿀 때마다 시트를 다시 쳐서 두 번째 시도에 복구됐다.
      // L1을 비워두면 다음 get() 이 L2(유효할 수 있음) → L3 순으로 다시 시도한다.
      // staleNow() 면 L1 도 채우지 않는다 — refresh 가 이미 넣은 신선한 L1 을
      // 낡은 값으로 되돌리면 안 된다.
      if (!_isEmptyValue(adapter, value) && !staleNow()) _l1.set(path, { value, ts: Date.now() });
      return value;
    })();

    _inflight.set(path, p);
    try { return await p; } finally { _inflight.delete(path); }
  },

  // 쓰기 직후 재적재. 그냥 지우면 다음에 들어온 사람이 콜드스타트를 뒤집어쓴다.
  // 재적재가 실패하면(예외든, _fetchAndStore 가 빈 결과를 강등 대상으로 던진 것이든)
  // 노드를 삭제해 다음 읽기가 시트로 강등한다 — 낡은 캐시를 남기지 않는다(스펙 §5).
  // 절대 throw 하지 않는다 — 호출부가 try/catch 없이도 안전해야 한다.
  // 반환값 { ok, rows } 로 호출부(refreshAll)가 성공 여부를 구분할 수 있게 한다.
  async refresh(dataset, { sport } = {}) {
    const { team, sport: sp, settings } = _ctx(sport);
    const adapter = _adapter(sp, dataset);
    if (!adapter) return { ok: true, rows: [] };
    // 롤백 스위치(§14): true 면 캐시(L2/L1) 자체를 건드리지 않는다 — get() 이
    // 이미 매번 L3 직행이라 여기서 재적재할 대상이 없다.
    if (DISABLED) return { ok: true, rows: [] };
    const path = _pathFor(adapter, team, sp, dataset);
    _l1.delete(path);
    // 세대를 올려 이미 L3 에 내려가 있는 get() 들이 자기 응답을 낡은 것으로 판정하게 한다.
    _gen.set(path, (_gen.get(path) || 0) + 1);
    try {
      const rows = await _fetchAndStore(adapter, path, settings);
      _l1.set(path, { value: rows, ts: Date.now() });
      return { ok: true, rows };
    } catch (e) {
      console.warn(`[sheetCache] ${dataset} 재적재 실패, 캐시 강등:`, e.message);
      try {
        await remove(ref(firebaseDb, path));
      } catch {
        // 삭제까지 실패하면 version 을 0 으로 덮어 즉시 만료시킨다(2단 방어).
        try { await set(ref(firebaseDb, `${path}/version`), 0); } catch { /* best-effort */ }
      }
      return { ok: false, rows: [] };
    }
  },

  async refreshAll({ sport } = {}) {
    const { sport: sp } = _ctx(sport);
    const out = [];
    for (const dataset of this.datasetsOf(sp)) {
      const { ok, rows } = await this.refresh(dataset, { sport: sp });
      out.push({ dataset, ok, count: Array.isArray(rows) ? rows.length : Object.keys(rows || {}).length });
    }
    return out;
  },

  // 설정 화면용. rows 를 내려받지 않도록 version/count 만 얕게 읽는다.
  // playerGames 노드는 635KB(2,330행, 2026-09 실측)까지 자라 있다 — "마지막 동기화"
  // 한 줄 띄우자고 노드 전체를 받으면 캐시로 아낀 트래픽을 그 자리에서 도로 쓴다.
  async status({ sport } = {}) {
    // 롤백 스위치(§14): true 면 캐시가 없으므로 조회할 것도 없다.
    if (DISABLED) return [];
    const { team, sport: sp } = _ctx(sport);
    const out = [];
    for (const dataset of this.datasetsOf(sp)) {
      const path = _pathFor(_adapter(sp, dataset), team, sp, dataset);
      try {
        const [v, c] = await Promise.all([
          get(ref(firebaseDb, `${path}/version`)),
          get(ref(firebaseDb, `${path}/count`)),
        ]);
        out.push({ dataset, version: v.val() ?? null, count: c.val() ?? null });
      } catch {
        out.push({ dataset, version: null, count: null });
      }
    }
    return out;
  },

  // 테스트 전용 — L1/in-flight/세대만 비운다(L2 = RTDB 노드는 유지).
  _resetForTest() {
    _l1.clear();
    _inflight.clear();
    _gen.clear();
  },

  // 테스트 전용 — 어댑터 레지스트리 원본을 노출한다. 새 데이터셋(축구·풋살 확장)을
  // 추가하면서 columns/fetch 를 빠뜨리는 실수를 커버리지 테스트가 직접 순회해 잡을
  // 수 있게 한다. 프로덕션 코드에서는 쓰지 않는다.
  _adaptersForTest() {
    return ADAPTERS;
  },
};

export default SheetCache;
