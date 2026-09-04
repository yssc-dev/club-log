import { describe, it, expect } from 'vitest';
import { buildPrevRankMap, dashboardRankComparator, latestPointDelta } from '../prevRanking';

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

  // 회귀: 대시보드 '포인트 TOP 5'가 members를 정렬 없이 slice(0,5)로 잘라
  // 시트 행 순서를 그대로 썼다. 시트 RANK 열은 "포인트 − 100×★"(100점 달성 시
  // 별 부여 + 100 차감) 기준이라, 누적 포인트가 더 높은 ★ 보유자가 순위표
  // 아래로 밀려 TOP 5에서 통째로 빠졌다(마스터FC 실측: 정보영 142pt가 시트 rank 18).
  it('시트 행 순서(★ 100점 차감 순위)가 아니라 누적 포인트로 정렬한다', () => {
    // 시트에 실려 오는 순서 그대로 — 신관수가 1행, ★ 보유자는 아래로 밀려 있다.
    const sheetOrder = [
      { name: '신관수', point: 96, ownGoals: 0, goguma: -5, goals: 29, assists: 49, cleanSheets: 13 },
      { name: '노필선', point: 91, ownGoals: -2, goguma: -3, goals: 42, assists: 32, cleanSheets: 10 },
      { name: '정보영', point: 142, ownGoals: -2, goguma: -3, goals: 67, assists: 44, cleanSheets: 26 }, // ★ 142-100=42
      { name: '조승훈', point: 120, ownGoals: 0, goguma: -2, goals: 49, assists: 40, cleanSheets: 19 }, // ★ 120-100=20
    ];
    const top = [...sheetOrder].sort(dashboardRankComparator).map(p => p.name);
    expect(top).toEqual(['정보영', '조승훈', '신관수', '노필선']);
  });

  // 회귀: 역주행/고구마는 시트에 '감점 포인트(음수)'로 저장되는데 오름차순으로
  // 비교해 자책이 많은 쪽이 동점 대결에서 이겼다(110 동점 박재운 자책2 > 조재상 자책1).
  it('포인트 동점에서 역주행 감점이 적은 쪽이 위로 온다', () => {
    const rows = [
      { name: '박재운', point: 110, ownGoals: -4, goguma: -4, goals: 56, assists: 32, cleanSheets: 24 },
      { name: '조재상', point: 110, ownGoals: -2, goguma: -7, goals: 44, assists: 52, cleanSheets: 15 },
    ];
    expect([...rows].sort(dashboardRankComparator)[0].name).toBe('조재상');
  });

  it('역주행이 같으면 고구마 감점이 적은 쪽이 위로 온다', () => {
    const rows = [
      { name: '많이먹음', point: 50, ownGoals: -2, goguma: -9, goals: 20, assists: 20, cleanSheets: 5 },
      { name: '적게먹음', point: 50, ownGoals: -2, goguma: -1, goals: 20, assists: 20, cleanSheets: 5 },
    ];
    expect([...rows].sort(dashboardRankComparator)[0].name).toBe('적게먹음');
  });
});

describe('latestPointDelta', () => {
  const d = { goals: 3, assists: 2, ownGoals: -2, cleanSheets: 1, crova: 4, goguma: -3 };

  it('풋살은 크로바/고구마까지 6항 전부 합산한다', () => {
    expect(latestPointDelta(d)).toBe(5); // 3+2-2+1+4-3
  });

  it('축구는 크로바/고구마를 버린다 — 실점이 고구마로 오독돼도 증분이 안 깎인다', () => {
    expect(latestPointDelta(d, { isSoccer: true })).toBe(4); // 3+2-2+1
  });

  it('증분이 없는 선수는 0 — 그 경기 무변동', () => {
    expect(latestPointDelta(undefined)).toBe(0);
    expect(latestPointDelta(null, { isSoccer: true })).toBe(0);
  });

  it('buildPrevRankMap의 이전 포인트 계산과 같은 식이다', () => {
    const members = [{ name: 'A', point: 20, goals: 5, assists: 5, ownGoals: 0, cleanSheets: 5, crova: 5, goguma: 0 }];
    const prev = buildPrevRankMap(members, { A: d }, { isSoccer: false });
    expect(prev['A']).toBe(1); // 단독이라 1위 — 식이 어긋나면 NaN 정렬로 깨진다
    expect(20 - latestPointDelta(d)).toBe(15);
  });
});
