// 투몽/길로틴/레거시 순위표 — 리그 탭·(구)분석탭 공용. 정렬 시 #(등수) 유지.
import { useMemo } from 'react';
import { useSortableRows, SortHeader } from './Sortable';
import { pct } from '../../utils/tennis/tennisFormat';
import { LEAGUE_TOUR, LEAGUE_CHALLENGER } from '../../utils/tennis/tennisSchema';
import { RateBar } from './tennisCharts';

// ─── 복식 순위표 ────────────────────────────────────────
export function DoublesStandingsSection({ standings, periodLabel, ds, C }) {
  const cols = useMemo(() => ({
    name:   { accessor: s => s.name, type: 'text' },
    grade:  { accessor: s => s.grade || '', type: 'text' },
    record: { accessor: s => s.wins, type: 'num' },
    rate:   { accessor: s => s.rate, type: 'num' },
  }), []);
  // #는 입력 순서 등수(승수순) — 정렬로 행이 섞여도 각 선수의 등수는 유지된다.
  const ranked = useMemo(() => standings.map((s, i) => ({ ...s, _rank: i + 1 })), [standings]);
  const { sorted, sort, onSort } = useSortableRows(ranked, cols);
  if (!standings.length) return null;
  return (
    <>
      <div style={ds.sectionTitle}>복식 순위 (투몽){periodLabel ? ` · ${periodLabel}` : ''}</div>
      <div style={{ fontSize: 11, color: C.gray, margin: '-4px 0 8px' }}>순위 기준: 승수 ↓ → 승률 ↓ → 이름 · 회원 3명 이상 참여한 판만 집계</div>
      <div style={ds.card}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...ds.th, textAlign: 'left' }}>#</th>
              <SortHeader label="이름" sortKey="name" sort={sort} onSort={onSort} align="left" ds={ds} />
              <SortHeader label="등급" sortKey="grade" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="전적" sortKey="record" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="승률" sortKey="rate" sort={sort} onSort={onSort} ds={ds} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.name}>
                <td style={{ ...ds.td(), textAlign: 'left' }}>{s._rank}</td>
                <td style={{ ...ds.td(true), textAlign: 'left' }}>{s.name}</td>
                <td style={{ ...ds.td(), fontSize: 10 }}>{s.grade}</td>
                <td style={ds.td()}>{s.wins}-{s.losses}</td>
                <td style={ds.td()}><RateBar rate={s.rate} pctText={pct(s.rate)} C={C} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── 단식 순위표 (포인트 컬럼은 단식 뷰 전용) ──────────
export function SinglesStandingsSection({ standings, periodLabel, ds, C }) {
  const cols = useMemo(() => ({
    name:       { accessor: s => s.name, type: 'text' },
    leagueTier: { accessor: s => s.leagueTier || '', type: 'text' },
    grade:      { accessor: s => s.grade || '', type: 'text' },
    record:     { accessor: s => s.wins, type: 'num' },
    rate:       { accessor: s => s.rate, type: 'num' },
    points:     { accessor: s => s.points, type: 'num' },
  }), []);
  // #는 입력 순서 등수(리그 탭=승률순). 티어(투어/챌린저)는 '경기일 직전' 승률로 파생되므로 기간 전체 승률 등수와 미세하게 다를 수 있다.
  const ranked = useMemo(() => standings.map((s, i) => ({ ...s, _rank: i + 1 })), [standings]);
  const { sorted, sort, onSort } = useSortableRows(ranked, cols);
  if (!standings.length) return null;
  return (
    <>
      <div style={ds.sectionTitle}>길로틴리그 (단식){periodLabel ? ` · ${periodLabel}` : ''}</div>
      <div style={{ fontSize: 11, color: C.gray, margin: '-4px 0 8px' }}>순위 기준: 승률 ↓ → 승수 ↓ → 이름 · 회원끼리 붙은 판만 집계 · P = 포인트(순위와 별개 누적)</div>
      <div style={ds.card}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...ds.th, textAlign: 'left' }}>#</th>
              <SortHeader label="이름" sortKey="name" sort={sort} onSort={onSort} align="left" ds={ds} />
              <SortHeader label="리그" sortKey="leagueTier" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="등급" sortKey="grade" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="전적" sortKey="record" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="승률" sortKey="rate" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="P" sortKey="points" sort={sort} onSort={onSort} ds={ds} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.name}>
                <td style={{ ...ds.td(), textAlign: 'left' }}>{s._rank}</td>
                <td style={{ ...ds.td(true), textAlign: 'left' }}>{s.name}</td>
                <td style={{ ...ds.td(), fontSize: 10 }}>{s.leagueTier === LEAGUE_CHALLENGER ? '챌린저' : s.leagueTier === LEAGUE_TOUR ? '투어' : '-'}</td>
                <td style={{ ...ds.td(), fontSize: 10 }}>{s.grade}</td>
                <td style={ds.td()}>{s.wins}-{s.losses}</td>
                <td style={ds.td()}><RateBar rate={s.rate} pctText={pct(s.rate)} C={C} /></td>
                <td style={ds.td()}>{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: C.gray, marginTop: 6 }}>
          리그 = 각 경기일 직전 승률 기준 상위 8명 투어리그 · 나머지 챌린저리그(포인트 판정용).
        </div>
      </div>
    </>
  );
}

// ─── 레거시 연도 순위 (집계 데이터) ─────────────────────
export function LegacyStandingsSection({ standings, year, format, ds, C }) {
  return (
    <>
      <div style={ds.sectionTitle}>{year}년 {format} 순위 (집계)</div>
      <div style={{ fontSize: 11, color: C.gray, margin: '-4px 0 8px' }}>순위 기준: {format === '단식' ? '승률 ↓ → 승수 ↓ → 이름' : '승수 ↓ → 승률 ↓ → 이름'}</div>
      {standings.length === 0 ? (
        <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
      ) : (
        <div style={ds.card}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...ds.th, textAlign: 'left' }}>#</th>
              <th style={{ ...ds.th, textAlign: 'left' }}>이름</th>
              <th style={ds.th}>전적</th>
              <th style={ds.th}>승률</th>
            </tr></thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.name}>
                  <td style={{ ...ds.td(), textAlign: 'left' }}>{i + 1}</td>
                  <td style={{ ...ds.td(true), textAlign: 'left' }}>{s.name}</td>
                  <td style={ds.td()}>{s.wins}-{s.losses}</td>
                  <td style={ds.td()}><RateBar rate={s.rate} pctText={pct(s.rate)} C={C} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
