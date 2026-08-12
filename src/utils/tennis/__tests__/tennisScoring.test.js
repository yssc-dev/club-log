import { describe, it, expect } from 'vitest';
import {
  emptySet, isTiebreakActive, incrementGame, incrementTiebreakPoint,
  setWinner, isSetComplete, setsNeeded, matchWinner, summarizeCourt,
} from '../tennisScoring';

const set = (a, b, tbA = 0, tbB = 0, done = false) => ({ a, b, tbA, tbB, done });

describe('게임 증분', () => {
  it('빈 세트에서 A가 한 게임 따면 1:0', () => {
    expect(incrementGame(emptySet(), 'A')).toEqual(set(1, 0));
  });

  it('6게임 선취로 세트 종료 — 6:4', () => {
    const s = incrementGame(set(5, 4), 'A');
    expect(s.a).toBe(6);
    expect(isSetComplete(s)).toBe(true);
    expect(setWinner(s)).toBe('A');
  });

  it('5:4에서 B가 따면 5:5 — 타이브레이크 진입', () => {
    const s = incrementGame(set(5, 4), 'B');
    expect(s).toMatchObject({ a: 5, b: 5 });
    expect(isTiebreakActive(s)).toBe(true);
    expect(isSetComplete(s)).toBe(false);
  });

  it('타이브레이크 중에는 게임 증분이 먹히지 않는다', () => {
    const tb = set(5, 5);
    expect(incrementGame(tb, 'A')).toEqual(tb);
  });
});

describe('타이브레이크', () => {
  it('타이브레이크가 아니면 포인트 증분이 먹히지 않는다', () => {
    const s = set(3, 2);
    expect(incrementTiebreakPoint(s, 'A')).toEqual(s);
  });

  it('7점 선취 시 승자 게임이 6으로 확정되고 세트가 6:5로 끝난다', () => {
    let s = set(5, 5);
    for (let i = 0; i < 7; i++) s = incrementTiebreakPoint(s, 'A');
    expect(s).toMatchObject({ a: 6, b: 5, tbA: 7, tbB: 0 });
    expect(isSetComplete(s)).toBe(true);
    expect(setWinner(s)).toBe('A');
  });

  it('7:4로 끝나는 실제 케이스', () => {
    let s = set(5, 5);
    for (let i = 0; i < 4; i++) { s = incrementTiebreakPoint(s, 'A'); s = incrementTiebreakPoint(s, 'B'); }
    expect(s).toMatchObject({ tbA: 4, tbB: 4 });
    for (let i = 0; i < 3; i++) s = incrementTiebreakPoint(s, 'A');
    expect(s).toMatchObject({ a: 6, b: 5, tbA: 7, tbB: 4 });
  });

  it('노애드 — 6:6에서 7점째를 딴 쪽이 즉시 이긴다 (2점차 불필요)', () => {
    let s = set(5, 5, 6, 6);
    s = incrementTiebreakPoint(s, 'B');
    expect(s).toMatchObject({ a: 5, b: 6, tbA: 6, tbB: 7 });
    expect(setWinner(s)).toBe('B');
  });

  it('끝난 세트에는 더 이상 포인트가 안 쌓인다', () => {
    const done = set(6, 5, 7, 4, true);
    expect(incrementTiebreakPoint(done, 'B')).toEqual(done);
  });
});

describe('판 승자', () => {
  it('1세트 경기는 한 세트로 끝난다', () => {
    expect(setsNeeded(1)).toBe(1);
    expect(matchWinner([set(6, 3, 0, 0, true)], 1)).toBe('A');
  });

  it('3세트 경기는 2세트를 먼저 따야 한다', () => {
    expect(setsNeeded(3)).toBe(2);
    expect(matchWinner([set(6, 3, 0, 0, true)], 3)).toBeNull();
    expect(matchWinner([set(6, 3, 0, 0, true), set(4, 6, 0, 0, true)], 3)).toBeNull();
    expect(matchWinner([
      set(6, 3, 0, 0, true), set(4, 6, 0, 0, true), set(6, 5, 7, 4, true),
    ], 3)).toBe('A');
  });
});

describe('summarizeCourt', () => {
  it('3세트 판을 집계한다 — 세트/게임/타이브레이크/베이글', () => {
    const court = {
      bestOf: 3,
      sets: [
        set(6, 0, 0, 0, true),   // A가 베이글 먹임
        set(4, 6, 0, 0, true),
        set(6, 5, 7, 4, true),   // 타이브레이크 A 승
      ],
    };
    expect(summarizeCourt(court)).toEqual({
      setsA: 2, setsB: 1,
      gamesA: 16, gamesB: 11,
      winner: 'A',
      tbPlayed: 1, tbWonA: 1, tbWonB: 0,
      bagelsGivenA: 1, bagelsGivenB: 0,
    });
  });

  it('타이브레이크 세트의 게임 수는 6/5로 센다', () => {
    const court = { bestOf: 1, sets: [set(6, 5, 7, 4, true)] };
    const s = summarizeCourt(court);
    expect(s.gamesA).toBe(6);
    expect(s.gamesB).toBe(5);
    expect(s.tbPlayed).toBe(1);
  });

  it('한 판에서 베이글 2개도 가능하다', () => {
    const court = {
      bestOf: 3,
      sets: [set(6, 0, 0, 0, true), set(3, 6, 0, 0, true), set(6, 0, 0, 0, true)],
    };
    const s = summarizeCourt(court);
    expect(s.bagelsGivenA).toBe(2);
    expect(s.winner).toBe('A');
  });

  it('미완료 판은 winner가 null', () => {
    const court = { bestOf: 3, sets: [set(6, 3, 0, 0, true), set(2, 1)] };
    expect(summarizeCourt(court).winner).toBeNull();
  });

  it('sets가 undefined여도 터지지 않는다', () => {
    expect(summarizeCourt({ bestOf: 1 })).toMatchObject({ setsA: 0, setsB: 0, winner: null });
  });
});

describe('incrementTiebreakPoint — 모드별', () => {
  const tbSet = { a: 5, b: 5, tbA: 0, tbB: 0, done: false }; // 5:5 TB 활성

  it("기본(7point): 6점까진 게임 안 오르고 7점에 6:5", () => {
    let s = tbSet;
    for (let i = 0; i < 6; i++) s = incrementTiebreakPoint(s, 'A', { tiebreakMode: '7point' });
    expect(s).toMatchObject({ tbA: 6, a: 5 }); // 아직 게임 안 오름
    s = incrementTiebreakPoint(s, 'A', { tiebreakMode: '7point' });
    expect(s).toMatchObject({ tbA: 7, a: 6, b: 5 }); // 7점 → 6게임
  });

  it("rules 없으면 7point 기본", () => {
    let s = tbSet;
    for (let i = 0; i < 7; i++) s = incrementTiebreakPoint(s, 'A');
    expect(s).toMatchObject({ tbA: 7, a: 6 });
  });

  it("5:5 아니면(TB 비활성) 변화 없음", () => {
    const notTb = { a: 4, b: 3, tbA: 0, tbB: 0, done: false };
    expect(incrementTiebreakPoint(notTb, 'A', { tiebreakMode: '1point' })).toBe(notTb);
  });
});

describe('incrementGame — rules', () => {
  const s = (a, b) => ({ a, b, tbA: 0, tbB: 0, done: false });
  it('7점 모드(기본): 6게임 후 상대 6:4까지 순서무관, 6:5 금지', () => {
    expect(incrementGame(s(6, 0), 'B')).toMatchObject({ a: 6, b: 1 });    // 6:0→6:1 허용
    expect(incrementGame(s(6, 4), 'B')).toMatchObject({ a: 6, b: 4 });    // 6:4→6:5 금지(변화없음)
    expect(incrementGame(s(6, 2), 'A')).toMatchObject({ a: 6, b: 2 });    // 7 금지
    expect(incrementGame(s(5, 0), 'A')).toMatchObject({ a: 6, b: 0 });    // 5:0→6:0 허용
  });
  it('7점 모드: 5:5는 게임+1 무시(TB로)', () => {
    const t = s(5, 5);
    expect(incrementGame(t, 'A')).toBe(t); // 변화 없음(참조 동일)
  });
  it('1점 모드: 5:5→6:5 세트승, 6:6 금지', () => {
    const r = { tiebreakMode: '1point' };
    expect(incrementGame(s(5, 5), 'A', r)).toMatchObject({ a: 6, b: 5 });
    expect(incrementGame(s(6, 0), 'B', r)).toMatchObject({ a: 6, b: 1 });
    expect(incrementGame(s(6, 5), 'B', r)).toMatchObject({ a: 6, b: 5 }); // 6:6 금지(변화없음)
    expect(incrementGame(s(6, 2), 'A', r)).toMatchObject({ a: 6, b: 2 }); // 7 금지
  });
});
