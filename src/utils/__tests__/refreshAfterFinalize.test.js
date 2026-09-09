import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  refreshed: [], sportsSeen: [], fail: new Set(),
  // SheetCache 의 어댑터 레지스트리 대역 — refreshAfterFinalize 가 목록을 손으로
  // 복제하지 않고 datasetsOf 에서 가져오는지 보기 위해 종목별로 다르게 둔다.
  datasets: {
    '풋살': ['matchLog', 'eventLog', 'playerGameLog', 'pointLog', 'playerLog', 'latestDeltas', 'cumulativeBonus'],
    '축구': ['matchLog', 'eventLog', 'playerGameLog', 'pointLog', 'playerLog', 'latestDeltas'],
  },
  storedSport: '풋살',
  // 병렬성 검증용 — dataset → { promise, resolve }
  deferred: null,
}));

vi.mock('../../services/sheetCache', () => ({
  default: {
    datasetsOf: (sport) => h.datasets[sport] || [],
    currentSport: () => h.storedSport,
    refresh: (d, opts) => {
      h.refreshed.push(d);
      h.sportsSeen.push(opts?.sport);
      if (h.fail.has(d)) return Promise.reject(new Error('boom'));
      if (h.deferred) {
        let resolve;
        const promise = new Promise(r => { resolve = r; });
        h.deferred.set(d, { promise, resolve });
        return promise.then(() => ({ ok: true, rows: [] }));
      }
      return Promise.resolve({ ok: true, rows: [] });
    },
  },
}));

import { refreshAfterFinalize, refreshDatasets, TOURNAMENT_DATASETS } from '../refreshAfterFinalize';

beforeEach(() => {
  h.refreshed.length = 0;
  h.sportsSeen.length = 0;
  h.fail.clear();
  h.storedSport = '풋살';
  h.deferred = null;
});

describe('refreshDatasets', () => {
  it('요청한 데이터셋을 모두 재적재한다', async () => {
    await refreshDatasets(['matchLog', 'eventLog']);
    expect(h.refreshed.sort()).toEqual(['eventLog', 'matchLog']);
  });

  // 이 테스트는 원래 '병렬로 실행한다(순차 아님)' 라는 이름이었는데, 목이 즉시
  // resolve 하므로 순차 구현(for-await)으로도 통과했다 — 거짓 이름이었다.
  // deferred 로 "마지막이 시작되기 전에 아무것도 끝나지 않는다"를 보게 고친다:
  // 순차 구현이면 첫 refresh 의 promise 가 resolve 되기 전에 두 번째가 시작되지 않는다.
  it('순차가 아니라 동시에 시작한다(앞선 것이 끝나기 전에 전부 호출된다)', async () => {
    h.deferred = new Map();
    const done = refreshDatasets(['a', 'b', 'c']);
    await Promise.resolve(); // 마이크로태스크 한 틱
    // 아직 아무것도 resolve 되지 않았는데 3개가 전부 호출됐다면 병렬이다.
    expect(h.refreshed).toEqual(['a', 'b', 'c']);
    expect(h.deferred.size).toBe(3);
    for (const { resolve } of h.deferred.values()) resolve();
    await expect(done).resolves.toBeUndefined();
  });

  // 캐시는 파생 데이터다. 재적재가 터져도 마감 성공을 되돌리면 안 된다.
  it('일부가 reject 해도 throw 하지 않는다', async () => {
    h.fail.add('eventLog');
    await expect(refreshDatasets(['matchLog', 'eventLog'])).resolves.toBeUndefined();
  });

  it('빈 목록이면 아무것도 하지 않는다', async () => {
    await refreshDatasets([]);
    expect(h.refreshed).toEqual([]);
  });

  // 겸직팀(한 팀에 풋살·축구 탭 공존)에서는 AuthUtil.mode 가 화면의 종목 토글과
  // 갱신 시점이 다를 수 있다 — 호출부가 넘긴 sport 가 그대로 SheetCache.refresh 에 전달돼야 한다.
  it('sport 오버라이드를 SheetCache.refresh 에 그대로 전달한다', async () => {
    await refreshDatasets(TOURNAMENT_DATASETS, { sport: '축구' });
    expect(h.refreshed).toEqual(['eventLog', 'playerGameLog']);
    expect(h.sportsSeen).toEqual(['축구', '축구']);
  });

  it('sport 를 생략하면 undefined 로 전달한다(SheetCache 기본값에 위임)', async () => {
    await refreshDatasets(['matchLog']);
    expect(h.sportsSeen).toEqual([undefined]);
  });
});

describe('refreshAfterFinalize — 목록을 어댑터 레지스트리에서 가져온다', () => {
  // 예전엔 FINALIZE_DATASETS 7개 문자열을 손으로 복제했다. 종목별 어댑터 차이
  // (cumulativeBonus 는 풋살만 — 축구 선수집계 시트에 크로바·고구마 열이 없다)가
  // 복제본에는 반영되지 않아, 축구 마감이 존재하지 않는 데이터셋을 재적재하려 들었다.
  it('풋살은 7종(cumulativeBonus 포함)을 재적재한다', async () => {
    await refreshAfterFinalize({ sport: '풋살' });
    expect(h.refreshed).toEqual(h.datasets['풋살']);
    expect(h.refreshed).toContain('cumulativeBonus');
    expect(new Set(h.sportsSeen)).toEqual(new Set(['풋살']));
  });

  it('축구는 cumulativeBonus 없이 6종을 재적재한다', async () => {
    await refreshAfterFinalize({ sport: '축구' });
    expect(h.refreshed).toEqual(h.datasets['축구']);
    expect(h.refreshed).not.toContain('cumulativeBonus');
    expect(new Set(h.sportsSeen)).toEqual(new Set(['축구']));
  });

  // 목록과 실제 재적재 대상이 갈리지 않아야 한다 — sport 를 생략하면 둘 다
  // SheetCache.currentSport() 로 해석된 같은 종목을 쓴다.
  it('sport 생략 시 SheetCache.currentSport() 로 목록과 대상을 함께 결정한다', async () => {
    h.storedSport = '축구';
    await refreshAfterFinalize();
    expect(h.refreshed).toEqual(h.datasets['축구']);
    expect(new Set(h.sportsSeen)).toEqual(new Set(['축구']));
  });

  it('어댑터가 없는 종목이면 아무것도 하지 않는다', async () => {
    await refreshAfterFinalize({ sport: '테니스' });
    expect(h.refreshed).toEqual([]);
  });
});
