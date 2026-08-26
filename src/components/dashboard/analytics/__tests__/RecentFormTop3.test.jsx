// RecentFormTop3 렌더 스모크 + 표기 규약. View는 순수 컴포넌트라 fetch 없이 그린다.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RecentFormTop3View } from '../RecentFormTop3';

const C = {
  card: '#111', cardLight: '#222', borderColor: '#333',
  white: '#fff', gray: '#888', accent: '#07f', green: '#0c0', orange: '#f90',
};
const ds = { section: {}, sectionTitle: {}, card: {} };

const pg = (date, player, o = {}) => ({
  date, player, goals: 0, assists: 0, cleansheets: 0, crova: 0, goguma: 0, owngoals: 0, games: 0, ...o,
});

const WINDOW_DATES = ['2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20'];
const futsalLogs = [
  ...WINDOW_DATES.map(d => pg(d, '급상승', { goals: 4, assists: 1 })),
  ...['2026-05-07', '2026-05-14', '2026-05-21'].map(d => pg(d, '급상승', { goals: 0 })),
  ...WINDOW_DATES.map(d => pg(d, '평범', { goals: 2 })),
  ...['2026-05-07', '2026-05-14', '2026-05-21'].map(d => pg(d, '평범', { goals: 2 })),
  ...WINDOW_DATES.map(d => pg(d, '신입', { goals: 3 })),
];

const render = (props) =>
  renderToStaticMarkup(createElement(RecentFormTop3View, { activeSport: '풋살', C, ds, ...props }));

describe('RecentFormTop3View', () => {
  it('기록이 없으면 아무것도 그리지 않는다', () => {
    expect(render({ playerGameLogs: [] })).toBe('');
  });

  it('TOP3를 경기당 포인트 순으로 세운다', () => {
    const html = render({ playerGameLogs: futsalLogs, members: [] });
    expect(html).toContain('최근 한 달 기세 TOP3');
    expect(html).toContain('5.00'); // 급상승 = (4+1)*4 / 4경기
    expect(html).toContain('pt/경기');
    expect(html).toContain('2026-08-20'); // 오늘이 아니라 최근 경기일 기준
    expect(html.indexOf('급상승')).toBeLessThan(html.indexOf('평범'));
  });

  it('평소 대비 상승/보합/표본없음을 구분해 적는다', () => {
    const html = render({ playerGameLogs: futsalLogs, members: [] });
    expect(html).toContain('▲ 평소 0.00');          // 급상승
    expect(html).toContain('─ 평소와 비슷');          // 평범 (Δ 0)
    expect(html).toContain('평소 표본이 없어 최근 기록만'); // 신입
  });

  it('명부가 있으면 랭킹 순위를 적고, 변동량 배지는 달지 않는다', () => {
    const members = [
      { name: '평범', point: 100 }, { name: 'X', point: 90 }, { name: 'Y', point: 80 },
      { name: 'Z', point: 70 }, { name: '급상승', point: 60 },
    ];
    const html = render({ playerGameLogs: futsalLogs, members });
    expect(html).toContain('랭킹 5위'); // 급상승
    expect(html).toContain('랭킹 1위'); // 평범
    expect(html).not.toContain('누적');
    expect(html).not.toContain('↑');
  });

  it('폼 판정은 절대 pt가 아니라 평소 대비 비율 (종목별 척도 차이 흡수)', () => {
    // 축구 척도: Δ가 0.31pt뿐이어도 평소(0.47) 대비 66%면 상승이다.
    const g = (date, player, goals) => ({ ...pg(date, player, { goals }), games: 3 });
    const logs = [
      ...WINDOW_DATES.map(d => g(d, '축구상승', 2)),        // 8점 / 12경기 = 0.67
      ...['2026-05-07', '2026-05-14', '2026-05-21'].map(d => g(d, '축구상승', 1)), // 3점 / 9경기 = 0.33
      ...WINDOW_DATES.map(d => g(d, '축구보합', 3)),        // 12점 / 12경기 = 1.00
      ...['2026-05-07', '2026-05-14', '2026-05-21'].map(d => g(d, '축구보합', 3)), // 9점 / 9경기 = 1.00
    ];
    const html = render({ playerGameLogs: logs, activeSport: '축구', members: [] });
    expect(html).toContain('▲ 평소 0.33');    // Δ +0.33 (절대값은 작지만 +100%)
    expect(html).toContain('─ 평소와 비슷');   // Δ 0
  });

  it('평소가 0점이던 선수는 0에서 벗어난 것만으로 방향을 준다', () => {
    const html = render({ playerGameLogs: futsalLogs, members: [] });
    expect(html).toContain('▲ 평소 0.00');
  });

  it('축구도 같은 경기 단위 표기 — 분모만 games 합', () => {
    const logs = [
      { ...pg('2026-08-20', 'A', { goals: 6 }), games: 3 },
      { ...pg('2026-08-13', 'A', { goals: 6 }), games: 3 },
      { ...pg('2026-08-20', 'B', { goals: 1 }), games: 3 },
      { ...pg('2026-08-13', 'B', { goals: 1 }), games: 3 },
    ];
    const html = render({ playerGameLogs: logs, activeSport: '축구', members: [] });
    expect(html).toContain('pt/경기');
    expect(html).toContain('2.00');   // 12점 / 6경기
    expect(html).toContain('6경기');   // 행 수 2가 아니라 games 합
    expect(html).not.toContain('세션');
  });
});
