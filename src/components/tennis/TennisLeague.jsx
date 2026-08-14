// 리그 탭 — 투몽리그(복식)·길로틴리그(단식 포인트), 연도 단위. 정적·비인터랙티브.
import { useEffect, useMemo, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildDoublesStandings, buildLeagueCounts } from '../../utils/tennis/tennisAnalytics';
import { buildSinglesStandings } from '../../utils/tennis/tennisStandings';
import { availableYears, isRowYear, filterRowsByPeriod, buildLegacyStandings, legacySinglesForYear } from '../../utils/tennis/tennisDateFilter';
import { DoublesStandingsSection, SinglesStandingsSection, LegacyStandingsSection } from './tennisStandingsSections';
import { makeStyles } from '../../styles/theme';
import { useTheme } from '../../hooks/useTheme';

export default function TennisLeague({ C: propC }) {
  const { C: themeC } = useTheme();
  const C = propC ?? themeC;
  const ds = makeStyles(C);
  const [rows, setRows] = useState([]);
  const [legacyRows, setLegacyRows] = useState([]);
  const [roster, setRoster] = useState([]);

  useEffect(() => {
    TennisSync.getPlayerGames().then(setRows);
    TennisSync.getLegacyRecords().then(setLegacyRows);
    TennisSync.getRoster().then(setRoster);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const years = useMemo(() => availableYears({ rows, legacyRows }), [rows, legacyRows]);
  const curYear = String(new Date().getFullYear());
  const [year, setYear] = useState('');
  const effYear = year || (years.includes(curYear) ? curYear : (years[0] || curYear));
  const isRow = isRowYear({ rows, year: effYear });

  const yearRows = useMemo(() => filterRowsByPeriod(rows, { year: effYear, month: '' }), [rows, effYear]);
  const singlesAgg = useMemo(() => legacySinglesForYear(legacyRows, effYear), [legacyRows, effYear]);
  const counts = useMemo(() => buildLeagueCounts({ rows: yearRows }), [yearRows]);
  const doubles = useMemo(() => buildDoublesStandings({ rows: yearRows, roster }), [yearRows, roster]);
  const singles = useMemo(() => buildSinglesStandings({ rows: yearRows, roster, asOfDate: today, sortBy: 'points', legacySingles: singlesAgg }), [yearRows, roster, today, singlesAgg]);
  const legacyDoubles = useMemo(() => buildLegacyStandings({ legacyRows, year: effYear, format: '복식' }), [legacyRows, effYear]);
  const legacySingles = useMemo(() => buildLegacyStandings({ legacyRows, year: effYear, format: '단식' }), [legacyRows, effYear]);

  const periodLabel = `${effYear}년`;
  const selectStyle = {
    background: C.cardLight, color: C.white, border: `1px solid ${C.borderColor}`,
    borderRadius: 8, padding: '5px 10px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
  };

  // 데이터가 하나도 없으면 옵션 없는 select·중복 안내를 피해 단일 안내만 (훅 이후 early return).
  if (years.length === 0) {
    return (
      <div style={ds.section}>
        <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
      </div>
    );
  }

  return (
    <div style={ds.section}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <select value={effYear} onChange={e => setYear(e.target.value)} style={selectStyle}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {isRow ? (
        <>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 10 }}>
            경기 기록 · {periodLabel} — 투몽 {counts.tumong} · 길로틴 {counts.guillotine} · 번외 {counts.exhibition} · 전체 {counts.total}
          </div>
          <SinglesStandingsSection standings={singles} periodLabel={periodLabel} ds={ds} />
          {singlesAgg.length > 0 && (
            <div style={{ fontSize: 11, color: C.gray, margin: '-4px 0 14px', paddingLeft: 2 }}>
              ※ {effYear}년 1~7월 집계 포함 · 포인트는 8월~ 경기만 반영
            </div>
          )}
          <DoublesStandingsSection standings={doubles} periodLabel={periodLabel} ds={ds} />
        </>
      ) : (
        <>
          <LegacyStandingsSection standings={legacySingles} year={effYear} format="단식" ds={ds} C={C} />
          <LegacyStandingsSection standings={legacyDoubles} year={effYear} format="복식" ds={ds} C={C} />
        </>
      )}
    </div>
  );
}
