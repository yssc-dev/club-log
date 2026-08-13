import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider, useTheme } from '../../../hooks/useTheme';
import TennisDashboard from '../TennisDashboard';
import { buildDoublesStandings, buildPairChemistry } from '../../../utils/tennis/tennisAnalytics';

vi.mock('../../../services/tennisSync', () => ({
  default: { getPlayerGames: () => Promise.resolve([]), getRoster: () => Promise.resolve([]) },
}));
Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

function Harness() { const { C } = useTheme(); return createElement(TennisDashboard, { C }); }

// 투몽 복식 3판 픽스처 (케미 minGames=3 충족)
const FIXTURE_ROWS = [
  { date:'2026-08-01', game_id:'g1', match_id:'m1', player:'박성언', partner:'김원희', side:'A', format:'복식', league:'투몽', result:'승', is_guest:false },
  { date:'2026-08-01', game_id:'g1', match_id:'m1', player:'김원희', partner:'박성언', side:'A', format:'복식', league:'투몽', result:'승', is_guest:false },
  { date:'2026-08-02', game_id:'g2', match_id:'m2', player:'박성언', partner:'김원희', side:'A', format:'복식', league:'투몽', result:'승', is_guest:false },
  { date:'2026-08-02', game_id:'g2', match_id:'m2', player:'김원희', partner:'박성언', side:'A', format:'복식', league:'투몽', result:'승', is_guest:false },
  { date:'2026-08-03', game_id:'g3', match_id:'m3', player:'박성언', partner:'김원희', side:'A', format:'복식', league:'투몽', result:'패', is_guest:false },
  { date:'2026-08-03', game_id:'g3', match_id:'m3', player:'김원희', partner:'박성언', side:'A', format:'복식', league:'투몽', result:'패', is_guest:false },
];
const FIXTURE_ROSTER = [{ name:'박성언' }, { name:'김원희' }];

describe('TennisDashboard 스모크', () => {
  it('빈 데이터에서 크래시 없이 렌더, 섹션 타이틀 존재', () => {
    const html = renderToStaticMarkup(createElement(ThemeProvider, null, createElement(Harness)));
    expect(html).toContain('복식 순위 TOP 5');
    expect(html).toContain('단식 순위 TOP 5');
    expect(html).toContain('페어 케미 TOP 5');
    expect(html).toContain('요약');
    expect(html).toContain('하이라이트');
  });

  // useEffect는 renderToStaticMarkup(SSR)에서 실행되지 않으므로 TennisDashboard 직접 마운트로
  // 실데이터 경로를 커버할 수 없다. 대신 계산기(순수함수)+렌더 조합으로 검증:
  // map/players.join/fmt 등 실데이터 경로에서 null-deref 없이 렌더되는지 확인.
  it('실데이터 픽스처 — 계산기+렌더 조합에서 선수명 표시·null-deref 없음', () => {
    const doubles = buildDoublesStandings({ rows: FIXTURE_ROWS, roster: FIXTURE_ROSTER }).slice(0, 5);
    const chem = buildPairChemistry({ rows: FIXTURE_ROWS }).slice(0, 5);

    // 복식 순위 행 렌더 (MiniRankTable 내 map 경로 검증)
    function DoublesRows({ rows: tableRows }) {
      return createElement('table', null,
        createElement('tbody', null,
          tableRows.map((r, i) =>
            createElement('tr', { key: i },
              createElement('td', null, r.name),
              createElement('td', null, `${r.wins}-${r.losses}`),
              createElement('td', null, r.rate > 0 ? `${Math.round(r.rate * 100)}%` : '-'),
            )
          )
        )
      );
    }
    // 페어 케미 렌더 (players.join null-deref 경로 검증)
    function ChemRows({ rows: chemRows }) {
      return createElement('ul', null,
        chemRows.map((p, i) =>
          createElement('li', { key: i }, p.players.join(' · '))
        )
      );
    }

    const html1 = renderToStaticMarkup(createElement(DoublesRows, { rows: doubles }));
    const html2 = renderToStaticMarkup(createElement(ChemRows, { rows: chem }));

    expect(html1).toContain('박성언');
    expect(html1).toContain('김원희');
    expect(html2).toContain('박성언');
    expect(html2).toContain('김원희');
  });
});
