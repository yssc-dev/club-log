import { describe, it, expect } from 'vitest';
import { buildPrevRankMap, dashboardRankComparator } from '../prevRanking';

// 8/18 실사고 재현 픽스처: 선효림은 포인트 변동이 없는데(골0 어시0 CS0),
// 서버 열매핑 폴백이 실점 7을 '고구마'로 오독해 증분에 실어 보냈다.
const members = [
  { name: '박동휘', point: 31, goals: 19, assists: 8, ownGoals: 0, cleanSheets: 4, crova: 0, goguma: 0 },
  { name: '선효림', point: 31, goals: 6, assists: 3, ownGoals: 0, cleanSheets: 22, crova: 0, goguma: 0 },
  { name: '김의선', point: 30, goals: 6, assists: 5, ownGoals: 0, cleanSheets: 19, crova: 0, goguma: 0 },
];

describe('buildPrevRankMap', () => {
  it('축구는 크로바/고구마 증분을 무시한다 — GK 실점이 고구마로 오독돼도 유령 배지가 없다', () => {
    const deltas = { 선효림: { goals: 0, assists: 0, ownGoals: 0, cleanSheets: 0, crova: 0, goguma: 7 } };
    const prev = buildPrevRankMap(members, deltas, { isSoccer: true });
    // 보정 없이는 이전PT 31-7=24 → 이전 순위 하락 → ▲ 유령. 무시하면 순위 그대로.
    expect(prev['선효림']).toBe(2);
  });

  it('풋살은 크로바/고구마 증분을 그대로 반영한다 — 기존 동작 유지', () => {
    const deltas = { 선효림: { goals: 0, assists: 0, ownGoals: 0, cleanSheets: 0, crova: 0, goguma: 7 } };
    const prev = buildPrevRankMap(members, deltas, { isSoccer: false });
    expect(prev['선효림']).toBe(3); // 이전PT 24 → 김의선(30) 아래
  });

  it('실제 증분은 종목 무관하게 반영된다', () => {
    const deltas = { 박동휘: { goals: 2, assists: 0, ownGoals: 0, cleanSheets: 0, crova: 0, goguma: 0 } };
    const prev = buildPrevRankMap(members, deltas, { isSoccer: true });
    // 박동휘 이전PT 29 → 선효림(31) 1위, 김의선(30) 2위, 박동휘 3위
    expect(prev['선효림']).toBe(1);
    expect(prev['박동휘']).toBe(3);
  });

  it('증분이 없으면 빈 맵 — 배지를 만들지 않는다', () => {
    expect(buildPrevRankMap(members, {}, { isSoccer: true })).toEqual({});
    expect(buildPrevRankMap(members, null, { isSoccer: true })).toEqual({});
  });

  it('입력 배열을 변형하지 않는다', () => {
    const input = [...members];
    buildPrevRankMap(input, { 선효림: { goals: 1 } }, { isSoccer: true });
    expect(input.map(m => m.name)).toEqual(['박동휘', '선효림', '김의선']);
  });
});

describe('dashboardRankComparator', () => {
  it('포인트 동률은 자책→고구마→골→어시→클린시트 순으로 푼다', () => {
    const rows = [
      { point: 31, ownGoals: 0, goguma: 0, goals: 6, assists: 3, cleanSheets: 22 },
      { point: 31, ownGoals: 0, goguma: 0, goals: 19, assists: 8, cleanSheets: 4 },
    ];
    expect([...rows].sort(dashboardRankComparator)[0].goals).toBe(19);
  });
});
