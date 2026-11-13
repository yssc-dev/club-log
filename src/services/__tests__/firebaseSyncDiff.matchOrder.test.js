// 2026-11-13 마스터FC 11-12 밀어내기: RTDB는 completedMatches 를 matchId 키 객체로 저장하고
// 키를 사전순으로 돌려준다("P10_C0" < "P1_C0"). reconstructState 가 그 순서를 그대로 배열로 쓰면
// 10경기 이상인 날 경기 순서가 P10…P16, P1…P9 로 뒤틀린다 → 보관소 표시·로그_매치 match_idx 가
// 어긋나고, 인덱스로 GK 기록을 찾는 밀어내기(gksHistory[i])·마지막 경기 확정취소가 엉뚱한 경기를 집는다.
import { describe, it, expect } from 'vitest';
import { reconstructState, matchesToObj } from '../firebaseSyncDiff';
import { sortFutsalMatchesByPlayOrder } from '../../utils/futsalMatchOrder';

const m = (matchId) => ({ matchId, homeIdx: 0, awayIdx: 1 });
const ids = (arr) => arr.map(x => x.matchId);

// Firebase 가 돌려주는 모양: 키 사전순 객체
const asFirebase = (arr) => {
  const obj = matchesToObj(arr);
  return Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]]));
};

describe('sortFutsalMatchesByPlayOrder', () => {
  it('밀어내기 P1~P16 을 숫자 순으로', () => {
    const played = Array.from({ length: 16 }, (_, i) => m(`P${i + 1}_C0`));
    const shuffled = Object.values(asFirebase(played));
    expect(ids(shuffled).slice(0, 2)).toEqual(['P10_C0', 'P11_C0']); // 전제: 사전순이면 뒤틀린다
    expect(ids(sortFutsalMatchesByPlayOrder(shuffled))).toEqual(ids(played));
  });

  it('대진표 R{라운드}_C{코트} 는 라운드 → 코트 순', () => {
    const played = [];
    for (let r = 1; r <= 12; r++) for (let c = 0; c < 2; c++) played.push(m(`R${r}_C${c}`));
    expect(ids(sortFutsalMatchesByPlayOrder(Object.values(asFirebase(played))))).toEqual(ids(played));
  });

  it('자유대진+대진표 혼합: 자유(F)가 먼저, 그다음 대진표(R)', () => {
    const played = [m('F1_C0'), m('F1_C1'), m('F2_C0'), m('R1_C0'), m('R1_C1'), m('R10_C0')];
    expect(ids(sortFutsalMatchesByPlayOrder(Object.values(asFirebase(played))))).toEqual(ids(played));
  });

  it('형식을 모르는 matchId 는 뒤로, 서로의 순서는 유지', () => {
    const arr = [m('X'), m('P2_C0'), m('Y'), m('P1_C0')];
    expect(ids(sortFutsalMatchesByPlayOrder(arr))).toEqual(['P1_C0', 'P2_C0', 'X', 'Y']);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const arr = [m('P2_C0'), m('P1_C0')];
    sortFutsalMatchesByPlayOrder(arr);
    expect(ids(arr)).toEqual(['P2_C0', 'P1_C0']);
  });
});

describe('reconstructState — completedMatches 경기 순서 복원', () => {
  it('RTDB 사전순 키로 와도 P1…P16 순서로 되살린다', () => {
    const played = Array.from({ length: 16 }, (_, i) => m(`P${i + 1}_C0`));
    const state = reconstructState('g1', { meta: { matchMode: 'push' }, matches: asFirebase(played) });
    expect(ids(state.completedMatches)).toEqual(ids(played));
  });
});
