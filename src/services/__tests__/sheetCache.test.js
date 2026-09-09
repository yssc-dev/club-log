import { describe, it, expect, vi, beforeEach } from 'vitest';

// firebase/database 를 인메모리 저장소로 대체한다.
// vi.mock 팩토리는 파일 상단으로 호이스팅되므로, 팩토리가 참조하는 가변 상태는
// vi.hoisted() 로 선언해야 한다(그냥 top-level let 은 "Cannot access before
// initialization" 으로 거부된다).
const h = vi.hoisted(() => ({
  store: new Map(),
  getCalls: 0,
  failNextGet: false,
  failNextSet: false,
  fetchCounts: {
    roster: 0, playerGames: 0, legacy: 0,
    matchLog: 0, eventLog: 0, playerGameLog: 0, pointLog: 0, playerLog: 0,
    latestDeltas: 0, cumulativeBonus: 0,
  },
  rosterEmptyNext: false, // _safeRead 가 조회 실패를 [] 로 삼킨 상황 재현용
  cumulativeBonusEmptyNext: false, // getCumulativeBonus 의 !enabled()/조회 실패 모양 재현용
  auth: { team: '몽피스', mode: '테니스' },
  settings: {},
}));

vi.mock('../../config/firebase', () => ({ firebaseDb: {} }));
vi.mock('firebase/database', () => ({
  ref: (_db, path) => ({ path }),
  get: async (r) => {
    h.getCalls++;
    if (h.failNextGet) { h.failNextGet = false; throw new Error('RTDB down'); }
    if (h.store.has(r.path)) return { val: () => h.store.get(r.path) };
    // 하위경로 조회: 실제 RTDB 처럼 `<노드경로>/<필드>` 를 부모 노드에서 꺼낸다.
    // status() 가 `${path}/version`, `${path}/count` 를 얕게 읽는 것을 흉내낸다.
    const i = r.path.lastIndexOf('/');
    if (i > 0) {
      const parent = h.store.get(r.path.slice(0, i));
      if (parent && typeof parent === 'object') {
        const field = r.path.slice(i + 1);
        return { val: () => (field in parent ? parent[field] : null) };
      }
    }
    return { val: () => null };
  },
  set: async (r, value) => {
    if (h.failNextSet) { h.failNextSet = false; throw new Error('write denied'); }
    // serverTimestamp 센티널을 실제 시각으로 치환(RTDB 서버 동작 흉내)
    const v = { ...value };
    if (v.version && v.version.__sv) v.version = Date.now();
    h.store.set(r.path, v);
  },
  remove: async (r) => { h.store.delete(r.path); },
  serverTimestamp: () => ({ __sv: true }),
}));

vi.mock('../authUtil', () => ({
  default: { getStored: () => h.auth },
}));
vi.mock('../../config/settings', () => ({
  getEffectiveSettings: () => h.settings,
}));

const ROSTER = [{ name: '박성언', nickname: '', grade: '금배', status: '활동', seasonStartRank: 1 }];
const GAMES = [{ team: '몽피스', sport: '테니스', date: '2026-09-01', player: '박성언' }];
vi.mock('../tennisSync', () => ({
  default: {
    getRoster: () => {
      h.fetchCounts.roster++;
      if (h.rosterEmptyNext) { h.rosterEmptyNext = false; return Promise.resolve([]); }
      return Promise.resolve(ROSTER);
    },
    getPlayerGames: () => { h.fetchCounts.playerGames++; return Promise.resolve(GAMES); },
    getLegacyRecords: () => { h.fetchCounts.legacy++; return Promise.resolve([]); },
  },
}));

vi.mock('../appSync', () => ({
  default: {
    getMatchLog: () => { h.fetchCounts.matchLog++; return Promise.resolve({ rows: [{ team: '마스터FC', date: '2026-09-01', match_id: 'R1_C0' }] }); },
    getEventLog: () => { h.fetchCounts.eventLog++; return Promise.resolve({ rows: [{ team: '마스터FC', event_type: 'goal', player: '박성언' }] }); },
    getPlayerGameLog: () => { h.fetchCounts.playerGameLog++; return Promise.resolve({ rows: [{ team: '마스터FC', player: '박성언', games: 3 }] }); },
    getPointLog: () => { h.fetchCounts.pointLog++; return Promise.resolve([{ date: '2026-09-01', scorer: '박성언', assist: '김원희' }]); },
    getPlayerLog: () => { h.fetchCounts.playerLog++; return Promise.resolve([{ date: '2026-09-01', name: '박성언', goals: 2 }]); },
    getLatestDeltas: () => { h.fetchCounts.latestDeltas++; return Promise.resolve({ 박성언: { goals: 1, assists: 0 } }); },
    getCumulativeBonus: () => {
      h.fetchCounts.cumulativeBonus++;
      if (h.cumulativeBonusEmptyNext) { h.cumulativeBonusEmptyNext = false; return Promise.resolve({ crova: {}, goguma: {} }); }
      return Promise.resolve({ crova: { 박성언: 2 }, goguma: {} });
    },
  },
}));

import SheetCache, { L2_TTL_MS } from '../sheetCache';

describe('L2 TTL', () => {
  it('12시간 백스톱', () => {
    expect(L2_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });
});

beforeEach(() => {
  h.store.clear();
  h.getCalls = 0;
  h.failNextGet = false;
  h.failNextSet = false;
  h.fetchCounts = {
    roster: 0, playerGames: 0, legacy: 0,
    matchLog: 0, eventLog: 0, playerGameLog: 0, pointLog: 0, playerLog: 0,
    latestDeltas: 0, cumulativeBonus: 0,
  };
  h.rosterEmptyNext = false;
  h.cumulativeBonusEmptyNext = false;
  h.auth = { team: '몽피스', mode: '테니스' };
  h.settings = {};
  SheetCache._resetForTest();
});

describe('get — 3층 캐시', () => {
  it('첫 호출은 L3 에서 읽고 L2 에 저장한다', async () => {
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(h.fetchCounts.roster).toBe(1);
    expect(h.store.get('cache/몽피스/테니스/roster/all')).toMatchObject({
      headers: ['name', 'nickname', 'grade', 'status', 'seasonStartRank'],
      count: 1,
    });
  });

  it('두 번째 호출은 L1 히트 — 네트워크를 치지 않는다', async () => {
    await SheetCache.get('roster');
    const before = h.getCalls;
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(h.fetchCounts.roster).toBe(1);
    expect(h.getCalls).toBe(before);
  });

  it('L1 이 비어도 L2 가 있으면 L3 를 치지 않는다', async () => {
    await SheetCache.get('roster');
    SheetCache._resetForTest();          // L1 만 비움(store 는 유지)
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(h.fetchCounts.roster).toBe(1);  // L3 재호출 없음
  });

  // TennisDashboard 가 Promise.all 로 동시에 쏘는 상황.
  it('동시 호출을 하나로 합친다(in-flight 중복 제거)', async () => {
    const [a, b, c] = await Promise.all([
      SheetCache.get('playerGames'),
      SheetCache.get('playerGames'),
      SheetCache.get('playerGames'),
    ]);
    expect(a).toEqual(GAMES);
    expect(b).toEqual(GAMES);
    expect(c).toEqual(GAMES);
    expect(h.fetchCounts.playerGames).toBe(1);
    expect(h.getCalls).toBe(1);
  });

  it('빈 결과는 L2 에 쓰지 않는다', async () => {
    const rows = await SheetCache.get('legacy');
    expect(rows).toEqual([]);
    expect(h.store.has('cache/몽피스/테니스/legacy/all')).toBe(false);
  });

  // refresh 와 대칭인 가드. L3가 []를 주면(콜드스타트 실패가 _safeRead 에 의해
  // 삼켜진 상황) L1에 5분간 고착시키지 않아야 다음 탭 전환에서 재시도할 수 있다.
  it('L3가 빈 결과를 주면 L1에 고착되지 않고 다음 get() 이 다시 L3를 시도한다', async () => {
    const first = await SheetCache.get('legacy');
    expect(first).toEqual([]);
    expect(h.fetchCounts.legacy).toBe(1);

    const second = await SheetCache.get('legacy');
    expect(second).toEqual([]);
    // L1 히트였다면 fetchCounts 가 늘지 않았을 것 — 늘었다는 것은 L3를 다시 쳤다는 뜻.
    expect(h.fetchCounts.legacy).toBe(2);
  });

  it('L2 읽기가 실패하면 조용히 L3 로 폴백한다', async () => {
    h.failNextGet = true;
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(h.fetchCounts.roster).toBe(1);
  });

  it('L2 쓰기가 실패해도 데이터는 반환한다', async () => {
    h.failNextSet = true;
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
  });

  it('스키마가 바뀐 노드는 미스 → L3 재조회', async () => {
    h.store.set('cache/몽피스/테니스/roster/all', {
      version: Date.now(), headers: ['name'], rows: [['옛사람']], count: 1,
    });
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(h.fetchCounts.roster).toBe(1);
  });

  it('모르는 데이터셋은 빈 배열', async () => {
    expect(await SheetCache.get('없는것')).toEqual([]);
  });
});

describe('refresh', () => {
  it('L1 을 비우고 L3 에서 다시 읽어 L2 를 교체한다', async () => {
    await SheetCache.get('playerGames');
    expect(h.fetchCounts.playerGames).toBe(1);
    const r = await SheetCache.refresh('playerGames');
    expect(r.ok).toBe(true);
    expect(h.fetchCounts.playerGames).toBe(2);
    expect(h.store.get('cache/몽피스/테니스/playerGames/all').count).toBe(1);
  });

  it('재적재가 실패하면 노드를 삭제해 강등한다', async () => {
    await SheetCache.get('playerGames');
    expect(h.store.has('cache/몽피스/테니스/playerGames/all')).toBe(true);
    h.failNextSet = true;
    const r = await SheetCache.refresh('playerGames');
    expect(r).toEqual({ ok: false, rows: [] });
    expect(h.store.has('cache/몽피스/테니스/playerGames/all')).toBe(false);
  });

  // _safeRead 는 Apps Script/네트워크 조회 실패를 조용히 [] 로 삼킨다. refresh 의
  // 호출부(마감·회원 upsert)는 전부 쓰기 직후 무효화이므로, 이 시점의 []는
  // "진짜 0행"일 수 없다 — get()의 보수적 보존(§6.1)과 다르게, refresh 는 이걸
  // 실패로 보고 강등해야 한다(스펙 §5). 예전엔 여기서 L2를 "보존"하는 것을
  // 정답으로 삼았는데, 그게 바로 낡은 캐시를 최대 12시간 방치하는 사고였다.
  it('재적재가 빈 결과([])를 받으면 L2의 기존 캐시를 강등(삭제)하고 L1도 오염시키지 않는다', async () => {
    await SheetCache.get('roster');
    expect(h.fetchCounts.roster).toBe(1);
    expect(h.store.has('cache/몽피스/테니스/roster/all')).toBe(true);

    h.rosterEmptyNext = true; // 다음 fetch 는 [] (조회 실패가 삼켜진 상황)
    const r = await SheetCache.refresh('roster');
    expect(r).toEqual({ ok: false, rows: [] });
    expect(h.fetchCounts.roster).toBe(2);

    // L2 는 낡은 채로 남지 않는다 — 강등(삭제)된다.
    expect(h.store.has('cache/몽피스/테니스/roster/all')).toBe(false);

    // L1도 빈 값으로 오염되지 않는다. 다음 get() 은 L2 미스이므로 L3(fetch)를
    // 다시 시도한다 — 이번엔 mock 이 정상 데이터로 복귀해 있으므로 로스터가 돌아온다.
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(h.fetchCounts.roster).toBe(3);
  });
});

describe('datasetsOf / status', () => {
  it('테니스 데이터셋 3종', () => {
    expect(SheetCache.datasetsOf('테니스')).toEqual(['roster', 'playerGames', 'legacy']);
  });
  it('모르는 종목은 빈 배열', () => {
    expect(SheetCache.datasetsOf('야구')).toEqual([]);
  });
  it('status 는 캐시 없는 데이터셋을 null 로 보고한다', async () => {
    const s = await SheetCache.status();
    expect(s).toEqual([
      { dataset: 'roster', version: null, count: null },
      { dataset: 'playerGames', version: null, count: null },
      { dataset: 'legacy', version: null, count: null },
    ]);
  });
  it('status 는 저장된 노드의 version/count 를 보고한다', async () => {
    await SheetCache.get('playerGames');
    const s = await SheetCache.status();
    const pg = s.find(x => x.dataset === 'playerGames');
    expect(pg.count).toBe(1);
    expect(typeof pg.version).toBe('number');
  });
});

describe('어댑터 등록 커버리지', () => {
  // 새 데이터셋을 추가하면서 columns 나 fetch 를 빠뜨리는 것을 막는다.
  it('모든 데이터셋이 columns 배열과 fetch 함수를 갖는다', async () => {
    for (const dataset of SheetCache.datasetsOf('테니스')) {
      const rows = await SheetCache.get(dataset);
      expect(Array.isArray(rows)).toBe(true);
    }
    // 저장된 노드의 headers 가 비어 있지 않은지 확인(columns 누락 방어)
    const node = h.store.get('cache/몽피스/테니스/playerGames/all');
    expect(node.headers.length).toBeGreaterThan(0);
    expect(node.headers).toContain('player');
  });

  // 위 테스트는 Array.isArray(rows) 만 본다 — 어댑터에 columns 가 없으면
  // encodeRows(undefined, rows) 가 TypeError 를 던지고, 그게 get()/refresh() 의
  // L2 저장 try/catch 에 삼켜져 그 데이터셋만 조용히 영구 L3 직행이 된다(비용
  // 회귀가 나도 테스트가 안 잡는다). 축구·풋살 어댑터 등록(5단계)에서 정확히
  // 이 실수를 하기 쉬우므로, 레지스트리를 직접 순회해 형태를 단언한다.
  // raw 모드(latestDeltas/cumulativeBonus)는 columns 가 없는 게 정상이므로 모드별로
  // 다르게 단언한다.
  it('모든 종목의 모든 어댑터가 mode 에 맞는 필드를 갖는다', () => {
    const all = SheetCache._adaptersForTest();
    for (const [sport, datasets] of Object.entries(all)) {
      for (const [name, a] of Object.entries(datasets)) {
        const where = `${sport}.${name}`;
        expect(typeof a.fetch, where).toBe('function');
        const mode = a.mode || 'rows';
        expect(['rows', 'raw'], where).toContain(mode);
        if (mode === 'rows') {
          expect(Array.isArray(a.columns), where).toBe(true);
          expect(a.columns.length, where).toBeGreaterThan(0);
        } else {
          expect(a.columns, where).toBeUndefined();
        }
        if (a.sheetOf !== undefined) expect(typeof a.sheetOf, where).toBe('function');
        // isEmpty 는 선택 필드지만, 있으면 함수여야 한다(shouldStoreValue 의 얕은 판정을
        // 대신해 "조회 실패"와 "결과 0건"을 구분하는 용도).
        if (a.isEmpty !== undefined) expect(typeof a.isEmpty, where).toBe('function');
      }
    }
  });

  // AppSync.getCumulativeBonus 는 !enabled() 와 조회 실패 둘 다 { crova:{}, goguma:{} }
  // 를 반환해(appSync.js) top-level 키 존재만 보는 기본 판정으로는 실패를 구분하지 못한다.
  // 다음 사람이 이 가드를 지우지 못하게 명시적으로 단언한다.
  it('cumulativeBonus 어댑터는 isEmpty 를 갖는다(조회 실패를 "0건"과 구분)', () => {
    const all = SheetCache._adaptersForTest();
    expect(typeof all['풋살'].cumulativeBonus.isEmpty).toBe('function');
    expect(typeof all['축구'].cumulativeBonus.isEmpty).toBe('function');
  });
});

describe('풋살·축구 어댑터', () => {
  beforeEach(() => {
    h.auth = { team: '마스터FC', mode: '풋살' };
    h.settings = { pointLogSheet: '마스터FC 포인트 로그', playerLogSheet: '마스터FC 선수별집계기록 로그' };
  });

  it('풋살·축구 데이터셋 7종', () => {
    const expected = ['matchLog', 'eventLog', 'playerGameLog', 'pointLog', 'playerLog', 'latestDeltas', 'cumulativeBonus'];
    expect(SheetCache.datasetsOf('풋살')).toEqual(expected);
    expect(SheetCache.datasetsOf('축구')).toEqual(expected);
  });

  it('로그 3종은 {rows} 래퍼를 벗겨 배열로 캐시한다', async () => {
    const rows = await SheetCache.get('eventLog');
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0].player).toBe('박성언');
    const node = h.store.get('cache/마스터FC/풋살/eventLog/all');
    expect(node.count).toBe(1);
    expect(node.headers).toContain('event_type');
  });

  it('맵 2종은 raw 모드로 그대로 보관된다', async () => {
    const v = await SheetCache.get('latestDeltas');
    expect(v).toEqual({ 박성언: { goals: 1, assists: 0 } });
    const node = h.store.get('cache/마스터FC/풋살/latestDeltas/all');
    expect(node.data).toEqual({ 박성언: { goals: 1, assists: 0 } });
    expect(node.headers).toBeUndefined();
  });

  it('raw 노드도 L2 히트로 재사용된다(L3 재호출 없음)', async () => {
    await SheetCache.get('cumulativeBonus');
    expect(h.fetchCounts.cumulativeBonus).toBe(1);
    SheetCache._resetForTest();
    const v = await SheetCache.get('cumulativeBonus');
    expect(v).toEqual({ crova: { 박성언: 2 }, goguma: {} });
    expect(h.fetchCounts.cumulativeBonus).toBe(1);
  });

  it('시트명 의존 데이터셋은 노드에 sheetName 을 남긴다', async () => {
    await SheetCache.get('pointLog');
    expect(h.store.get('cache/마스터FC/풋살/pointLog/all').sheetName).toBe('마스터FC 포인트 로그');
  });

  it('설정에서 시트명을 바꾸면 캐시가 미스가 되어 다시 읽는다', async () => {
    await SheetCache.get('pointLog');
    expect(h.fetchCounts.pointLog).toBe(1);
    SheetCache._resetForTest();
    h.settings = { ...h.settings, pointLogSheet: '새 포인트 로그' };
    await SheetCache.get('pointLog');
    expect(h.fetchCounts.pointLog).toBe(2);
  });

  it('축구는 같은 데이터셋을 다른 노드에 캐시한다', async () => {
    await SheetCache.get('matchLog');
    h.auth = { team: '하버FC', mode: '축구' };
    await SheetCache.get('matchLog');
    expect(h.store.has('cache/마스터FC/풋살/matchLog/all')).toBe(true);
    expect(h.store.has('cache/하버FC/축구/matchLog/all')).toBe(true);
  });

  // 겸직팀(한 팀에 풋살·축구 entry 가 둘 다 있는 경우) 대응. AuthUtil.mode 는
  // 팀 선택 시 entries[0].mode 로 한 번만 저장되고 TeamDashboard 의 종목 탭
  // 클릭(activeSport)으로는 갱신되지 않는다 — sport 오버라이드가 없으면 축구 탭을
  // 보고 있어도 풋살 캐시를 읽는 사고가 난다(화면 라벨과 데이터가 갈린다).
  it('sport 오버라이드를 주면 AuthUtil.mode(풋살) 대신 그 종목 노드를 읽고 쓴다', async () => {
    const rows = await SheetCache.get('matchLog', { sport: '축구' });
    expect(Array.isArray(rows)).toBe(true);
    expect(h.store.has('cache/마스터FC/축구/matchLog/all')).toBe(true);
    expect(h.store.has('cache/마스터FC/풋살/matchLog/all')).toBe(false);
  });

  it('오버라이드 없이 부르면 AuthUtil.mode(풋살) 노드를 그대로 쓴다', async () => {
    const rows = await SheetCache.get('matchLog');
    expect(Array.isArray(rows)).toBe(true);
    expect(h.store.has('cache/마스터FC/풋살/matchLog/all')).toBe(true);
    expect(h.store.has('cache/마스터FC/축구/matchLog/all')).toBe(false);
  });

  // refresh/refreshAll/status 도 같은 오버라이드를 받는다 — SettingsScreen 이
  // datasetsOf(teamMode) 로 목록을 만들고 refreshAll()/status() 로 갱신·조회하는데,
  // 오버라이드가 없으면 목록(teamMode 기준)과 실제 갱신·조회 대상(AuthUtil.mode 기준)이
  // 겸직팀에서 갈릴 수 있다 — get() 과 같은 계열의 버그.
  it('refresh 도 sport 오버라이드를 받아 그 종목 노드를 재적재한다', async () => {
    await SheetCache.get('matchLog', { sport: '축구' });
    expect(h.fetchCounts.matchLog).toBe(1);
    const r = await SheetCache.refresh('matchLog', { sport: '축구' });
    expect(r.ok).toBe(true);
    expect(h.fetchCounts.matchLog).toBe(2);
    expect(h.store.has('cache/마스터FC/축구/matchLog/all')).toBe(true);
    expect(h.store.has('cache/마스터FC/풋살/matchLog/all')).toBe(false);
  });

  it('refreshAll 도 sport 오버라이드를 받아 그 종목의 모든 데이터셋을 재적재한다', async () => {
    const out = await SheetCache.refreshAll({ sport: '축구' });
    const datasets = out.map(x => x.dataset);
    expect(datasets).toEqual(SheetCache.datasetsOf('축구'));
    expect(h.store.has('cache/마스터FC/축구/matchLog/all')).toBe(true);
    expect(h.store.has('cache/마스터FC/풋살/matchLog/all')).toBe(false);
  });

  it('status 도 sport 오버라이드를 받아 그 종목 노드의 상태를 본다', async () => {
    await SheetCache.get('matchLog', { sport: '축구' });
    const s = await SheetCache.status({ sport: '축구' });
    const ml = s.find(x => x.dataset === 'matchLog');
    expect(ml.count).toBe(1);

    // 오버라이드 없이 부르면(AuthUtil.mode=풋살) 풋살 노드를 본다 — 축구 노드만
    // 있는 상태라 matchLog 는 비어있어야 한다.
    const s2 = await SheetCache.status();
    const ml2 = s2.find(x => x.dataset === 'matchLog');
    expect(ml2.version).toBeNull();
  });

  // R5: AppSync.getCumulativeBonus 는 !enabled() 와 조회 실패 둘 다
  // { crova:{}, goguma:{} } 를 반환한다 — top-level 키 존재만 보면 "비어있지 않다"고
  // 오판해 실패 응답이 L2_TTL_MS(12시간) 동안 고착된다. isEmpty 가 내부까지 들여다봐서
  // 이 경우엔 L2 노드를 만들지 않아야 한다.
  it('getCumulativeBonus 가 실패 응답({crova:{},goguma:{}})을 주면 L2 노드를 만들지 않는다', async () => {
    h.cumulativeBonusEmptyNext = true;
    const v = await SheetCache.get('cumulativeBonus');
    expect(v).toEqual({ crova: {}, goguma: {} });
    expect(h.store.has('cache/마스터FC/풋살/cumulativeBonus/all')).toBe(false);
  });
});
