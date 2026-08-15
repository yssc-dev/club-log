// 분석 탭 본문. 시트 2종(로그_테니스선수경기 + 테니스_레거시전적)을 읽어 클라이언트에서 계산한다.
// 경기 중 화면과 무관 — 당일/누적 경계(스펙 §2)를 지킨다.
import { useEffect, useMemo, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildSinglesStandings, buildPlayerSummary } from '../../utils/tennis/tennisStandings';
import { priorYearSinglesOrder } from '../../utils/tennis/leagueDerivation';
import {
  buildPairChemistry, buildPartnerBreakdown, buildHeadToHead,
  buildMonthlyForm, buildTbRanking, buildBagelRanking, buildAceDfRanking, buildYearlyRecords,
  playerDropdownNames,
} from '../../utils/tennis/tennisAnalytics';
import { analyticsSectionKeys } from '../../utils/tennis/analyticsSections';
import { availableYears, availableMonths, filterRowsByPeriod, legacySinglesForYear } from '../../utils/tennis/tennisDateFilter';
import { buildPlayerRadar } from '../../utils/tennis/tennisRadar';
import { HBarChart, PlayerRadarChart, YearlyBarChart, AceDfScatter } from './tennisCharts';
import { makeStyles } from '../../styles/theme';
import { useTheme } from '../../hooks/useTheme';
import { useSortableRows, SortHeader } from './Sortable';
import { pct } from '../../utils/tennis/tennisFormat';

// ─── 전체지표 공용 헬퍼 ─────────────────────────────────
// 랭킹바 정렬 토글 (다승/승률·준/먹음 등). options: [[value, label], ...]
function SortToggle({ value, onChange, options, ds }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} style={ds.chip(value === v)}>{l}</button>
      ))}
    </div>
  );
}

// 전체 표 접기: 기본 접힘, "▸ 전체 N 보기"로 펼침. 바가 요약이라 표는 온디맨드.
function CollapsibleTable({ label, children, C }) {
  const [open, setOpen] = useState(false);
  const btn = {
    background: 'none', border: 'none', color: C.accent, cursor: 'pointer',
    fontSize: 11, fontFamily: 'inherit', padding: '2px 2px', margin: '2px 0 8px',
  };
  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={btn}>{open ? '▾ 접기' : `▸ ${label}`}</button>
      {open && children}
    </>
  );
}

// ─── 요약 카드 (개인 뷰) ────────────────────────────────
function StatCell({ label, value, C }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.gray }}>{label}</div>
      <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: C.white }}>{value}</div>
    </div>
  );
}

function SummaryCard({ summary, player, points = 0, ds, C }) {
  return (
    <>
      <div style={ds.sectionTitle}>{player} 요약</div>
      <div style={ds.card}>
        <div style={{ display: 'flex', marginBottom: 12 }}>
          <StatCell C={C} label="단식" value={`${summary.singles.wins}-${summary.singles.losses}`} />
          <StatCell C={C} label="복식" value={`${summary.doubles.wins}-${summary.doubles.losses}`} />
          <StatCell C={C} label="포인트" value={points} />
          <StatCell C={C} label="출석" value={`${summary.attendanceDates}일`} />
        </div>
        <div style={{ display: 'flex' }}>
          <StatCell C={C} label="에이스" value={summary.aces} />
          <StatCell C={C} label="더블폴트" value={summary.doubleFaults} />
          <StatCell C={C} label="타이브레이크" value={`${summary.tbWon}/${summary.tbPlayed}`} />
          <StatCell C={C} label="베이글" value={`${summary.bagelsGiven}/${summary.bagelsTaken}`} />
        </div>
      </div>
    </>
  );
}

// ─── 연도별 전적 (legacyRows 비면 숨김) ─────────────────
function YearlyRecordsSection({ entries, ds, C }) {
  if (!entries.length) return null;
  return (
    <>
      <div style={ds.sectionTitle}>연도별 전적</div>
      <YearlyBarChart entries={entries} ds={ds} C={C} />
      <div style={ds.card}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...ds.th, textAlign: 'left' }}>시즌</th>
              <th style={ds.th}>전적</th>
              <th style={ds.th}>승률</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const bold = e.season === '통산';
              return (
                <tr key={e.season}>
                  <td style={{ ...ds.td(bold), textAlign: 'left' }}>{e.season}</td>
                  <td style={ds.td(bold)}>{e.wins}-{e.losses}</td>
                  <td style={ds.td(bold)}>{pct(e.rate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── 페어 케미 + 파트너 분석 ─────────────────────────────
// showChemistry: 전체 케미 표 표시 여부 (기본 true, 전체 뷰에서만 사용)
// showBreakdown: 파트너별 분석 표시 여부 (기본 true, 개인 뷰에서만 사용)
function ChemistrySection({ chemistry, breakdown = [], player, ds, C, showChemistry = true, showBreakdown = true }) {
  const chemCols = useMemo(() => ({
    pair:   { accessor: p => p.players.join('·'), type: 'text' },
    record: { accessor: p => p.wins, type: 'num' },
    rate:   { accessor: p => p.rate, type: 'num' },
  }), []);
  const { sorted: sortedChem, sort: sortChem, onSort: onSortChem } = useSortableRows(chemistry, chemCols);

  // 파트너별은 HBarChart로 대체 — useSortableRows 불필요

  // 랭킹바 정렬: 다승(기본) / 승률. 바 길이도 정렬 기준을 따른다.
  const [chemSort, setChemSort] = useState('wins');
  const chemBarRows = useMemo(() => {
    if (!chemistry.length) return [];
    const maxWins = Math.max(1, ...chemistry.map(p => p.wins));
    const sorter = chemSort === 'wins'
      ? (a, b) => b.wins - a.wins || b.rate - a.rate
      : (a, b) => b.rate - a.rate || b.wins - a.wins;
    return [...chemistry].sort(sorter).slice(0, 8).map(p => ({
      label: p.players.join('·') + (p.hasGuest ? ' *' : ''),
      value: chemSort === 'wins' ? p.wins / maxWins : p.rate,
      note: `${p.wins}-${p.losses} (${Math.round(p.rate * 100)}%)`,
    }));
  }, [chemistry, chemSort]);

  return (
    <>
      {showChemistry && (
        <>
          <div style={ds.sectionTitle}>페어 케미 (3경기↑)</div>
          {chemistry.length === 0 ? (
            <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
          ) : (
            <>
              <SortToggle value={chemSort} onChange={setChemSort} options={[['wins', '다승'], ['rate', '승률']]} ds={ds} />
              <HBarChart rows={chemBarRows} ds={ds} C={C} />
              <CollapsibleTable label={`전체 ${chemistry.length}쌍 보기`} C={C}>
                <div style={ds.card}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <SortHeader label="페어" sortKey="pair" sort={sortChem} onSort={onSortChem} align="left" ds={ds} />
                        <SortHeader label="전적" sortKey="record" sort={sortChem} onSort={onSortChem} ds={ds} />
                        <SortHeader label="승률" sortKey="rate" sort={sortChem} onSort={onSortChem} ds={ds} />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedChem.map((p) => (
                        <tr key={p.players.join('|')}>
                          <td style={{ ...ds.td(), textAlign: 'left', fontSize: 11 }}>
                            {p.players.join(' · ')}{p.hasGuest ? ' *' : ''}
                          </td>
                          <td style={ds.td()}>{p.wins}-{p.losses}</td>
                          <td style={ds.td()}>{pct(p.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleTable>
            </>
          )}
        </>
      )}
      {showBreakdown && player && (
        <>
          <div style={ds.sectionTitle}>{player} 파트너별</div>
          <HBarChart
            rows={(breakdown || []).map(b => ({
              label: b.partner + (b.isGuestPartner ? ' *' : ''),
              value: b.rate,
              note: `${b.wins}-${b.losses} (${Math.round(b.rate * 100)}%)`,
            }))}
            ds={ds}
            C={C}
            colorFor={(row) => row.value >= 0.5 ? C.accent : C.grayDarker}
          />
        </>
      )}
    </>
  );
}

// ─── 상대 전적 (HBarChart) ──────────────────────────────────
function HeadToHeadSection({ h2h, player, ds, C }) {
  const h2hRows = (h2h || [])
    .slice()
    .sort((a, b) => b.rate - a.rate || b.games - a.games)
    .map(e => ({
      label: e.opponent,
      value: e.rate,
      note: `${e.wins}-${e.losses} (${Math.round(e.rate * 100)}%)`,
    }));
  const colorFor = (row) => row.value >= 0.5 ? C.accent : C.grayDarker;
  return (
    <>
      <div style={ds.sectionTitle}>{player || '—'} 상대 전적</div>
      <HBarChart rows={h2hRows} ds={ds} C={C} colorFor={colorFor} />
    </>
  );
}

// ─── 월별 흐름 SVG 라인차트 ─────────────────────────────
// 단일 계열(승률) → 범례 없음, 타이틀이 대신 식별. dataviz 스킬 지침 적용.
// 색상: C.accent(앱 블루, 테마 반응형). 마크: 2px 선·4px 점(8px 히트타깃).
// 호버 크로스헤어 + 툴팁 밴드. Y축 0/50/100% 그리드라인.
function MonthlyFormSection({ monthly, player, format, ds, C }) {
  const [hovered, setHovered] = useState(null);
  const vW = 300; const vH = 140;
  const mL = 32; const mR = 8; const mT = 14; const mB = 28;
  const pW = vW - mL - mR;
  const pH = vH - mT - mB;
  const n = monthly.length;
  const xOf = (i) => mL + (n <= 1 ? pW / 2 : (i / (n - 1)) * pW);
  const yOf = (rate) => mT + pH * (1 - rate);
  const hp = hovered !== null ? monthly[hovered] : null;

  return (
    <>
      <div style={ds.sectionTitle}>{player || '—'} 월별 흐름 ({format})</div>
      <div style={ds.card}>
        {monthly.length === 0 ? (
          <div style={{ color: C.gray, fontSize: 12, textAlign: 'center', padding: 10 }}>데이터 없음</div>
        ) : (
          <>
            <div style={{ minHeight: 18, textAlign: 'center', fontSize: 11, color: C.white, marginBottom: 2 }}>
              {hp ? `${hp.month} · ${hp.wins}승 ${hp.games - hp.wins}패 · ${pct(hp.rate)}` : ' '}
            </div>
            <svg
              viewBox={`0 0 ${vW} ${vH}`}
              style={{ width: '100%', display: 'block', overflow: 'visible' }}
              aria-label={`${player || '선수'} ${format} 월별 승률 차트`}
            >
              {[0, 0.5, 1].map((t) => (
                <g key={t}>
                  <line x1={mL} y1={yOf(t)} x2={mL + pW} y2={yOf(t)}
                    stroke={C.grayDarker} strokeWidth={0.5} />
                  <text x={mL - 3} y={yOf(t) + 3.5} textAnchor="end" fontSize={7.5} fill={C.gray}>
                    {Math.round(t * 100)}%
                  </text>
                </g>
              ))}
              {n > 1 && (
                <path
                  d={`M ${monthly.map((d, i) => `${xOf(i)},${yOf(d.rate)}`).join(' L ')}`}
                  fill="none" stroke={C.accent} strokeWidth={2}
                  strokeLinejoin="round" strokeLinecap="round"
                />
              )}
              {monthly.map((d, i) => (
                <g key={d.month}>
                  <circle cx={xOf(i)} cy={yOf(d.rate)} r={4}
                    fill={C.accent} stroke={C.card} strokeWidth={2} />
                  <text x={xOf(i)} y={vH - 3} textAnchor="middle" fontSize={7.5} fill={C.gray}>
                    {d.month.slice(5)}
                  </text>
                  <rect x={xOf(i) - 14} y={mT - 2} width={28} height={pH + 10}
                    fill="transparent"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: 'default' }} />
                </g>
              ))}
              {hovered !== null && (
                <line x1={xOf(hovered)} y1={mT} x2={xOf(hovered)} y2={mT + pH}
                  stroke={C.accent} strokeWidth={1} strokeDasharray="3 2" opacity={0.5} />
              )}
            </svg>
          </>
        )}
      </div>
    </>
  );
}

// ─── 타이브레이크 · 베이글 ──────────────────────────────
function TbBagelSection({ tb, bagel, ds, C }) {
  const tbCols = useMemo(() => ({
    name: { accessor: e => e.name, type: 'text' },
    won:  { accessor: e => e.tbWon, type: 'num' },
    rate: { accessor: e => e.rate, type: 'num' },
  }), []);
  const { sorted: sortedTb, sort: sortTb, onSort: onSortTb } = useSortableRows(tb, tbCols);

  const bagelCols = useMemo(() => ({
    name:  { accessor: e => e.name, type: 'text' },
    given: { accessor: e => e.given, type: 'num' },
    taken: { accessor: e => e.taken, type: 'num' },
  }), []);
  const { sorted: sortedBagel, sort: sortBagel, onSort: onSortBagel } = useSortableRows(bagel, bagelCols);

  // 랭킹 바 정렬 토글 — TB: 승률(기본)/다승, 베이글: 준(기본)/먹음. 바 길이도 정렬기준 반영.
  const [tbSort, setTbSort] = useState('rate');
  const [bagelSort, setBagelSort] = useState('given');

  const tbBarRows = useMemo(() => {
    const maxWon = Math.max(1, ...tb.map(e => e.tbWon || 0));
    const sorter = tbSort === 'won'
      ? (a, b) => b.tbWon - a.tbWon || b.rate - a.rate
      : (a, b) => b.rate - a.rate || b.tbWon - a.tbWon;
    return [...tb].sort(sorter).slice(0, 8)
      .map(e => ({ label: e.name, value: tbSort === 'won' ? e.tbWon / maxWon : e.rate, note: `${e.tbWon}/${e.tbPlayed} (${Math.round(e.rate * 100)}%)` }));
  }, [tb, tbSort]);

  const bagelBarRows = useMemo(() => {
    const k = bagelSort; // 'given' | 'taken'
    const maxV = Math.max(1, ...bagel.map(b => b[k] || 0));
    return [...bagel]
      .filter(b => (b[k] || 0) > 0)
      .sort((a, b) => b[k] - a[k] || String(a.name).localeCompare(String(b.name), 'ko')).slice(0, 8)
      .map(e => ({ label: e.name, value: e[k] / maxV, note: `준 ${e.given} · 먹음 ${e.taken}` }));
  }, [bagel, bagelSort]);

  return (
    <>
      <div style={ds.sectionTitle}>타이브레이크</div>
      {tb.length === 0 ? (
        <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
      ) : (
        <>
          <SortToggle value={tbSort} onChange={setTbSort} options={[['rate', '승률'], ['won', '다승']]} ds={ds} />
          <HBarChart rows={tbBarRows} ds={ds} C={C} />
          <CollapsibleTable label={`전체 ${tb.length}명 보기`} C={C}>
            <div style={ds.card}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <SortHeader label="이름" sortKey="name" sort={sortTb} onSort={onSortTb} align="left" ds={ds} />
                    <SortHeader label="승/판" sortKey="won" sort={sortTb} onSort={onSortTb} ds={ds} />
                    <SortHeader label="승률" sortKey="rate" sort={sortTb} onSort={onSortTb} ds={ds} />
                  </tr>
                </thead>
                <tbody>
                  {sortedTb.map((e) => (
                    <tr key={e.name}>
                      <td style={{ ...ds.td(), textAlign: 'left' }}>{e.name}</td>
                      <td style={ds.td()}>{e.tbWon}/{e.tbPlayed}</td>
                      <td style={ds.td()}>{pct(e.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleTable>
        </>
      )}
      <div style={ds.sectionTitle}>베이글</div>
      {bagel.length === 0 ? (
        <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
      ) : (
        <>
          <SortToggle value={bagelSort} onChange={setBagelSort} options={[['given', '준'], ['taken', '먹음']]} ds={ds} />
          {bagelBarRows.length > 0
            ? <HBarChart rows={bagelBarRows} ds={ds} C={C} />
            : <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>해당 기록 없음</div>}
          <CollapsibleTable label={`전체 ${bagel.length}명 보기`} C={C}>
            <div style={ds.card}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <SortHeader label="이름" sortKey="name" sort={sortBagel} onSort={onSortBagel} align="left" ds={ds} />
                    <SortHeader label="준" sortKey="given" sort={sortBagel} onSort={onSortBagel} ds={ds} />
                    <SortHeader label="먹음" sortKey="taken" sort={sortBagel} onSort={onSortBagel} ds={ds} />
                  </tr>
                </thead>
                <tbody>
                  {sortedBagel.map((e) => (
                    <tr key={e.name}>
                      <td style={{ ...ds.td(), textAlign: 'left' }}>{e.name}</td>
                      <td style={ds.td()}>{e.given}</td>
                      <td style={ds.td()}>{e.taken}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleTable>
        </>
      )}
    </>
  );
}

// ─── 에이스 · 더블폴트 ──────────────────────────────────
function AceDfSection({ acedf, ds, C }) {
  const cols = useMemo(() => ({
    name:          { accessor: e => e.name, type: 'text' },
    aces:          { accessor: e => e.aces, type: 'num' },
    doubleFaults:  { accessor: e => e.doubleFaults, type: 'num' },
    recordedGames: { accessor: e => e.recordedGames, type: 'num' },
  }), []);
  const { sorted, sort, onSort } = useSortableRows(acedf, cols);
  return (
    <>
      <div style={ds.sectionTitle}>에이스 · 더블폴트</div>
      {acedf.length === 0 ? (
        <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>기록 없음</div>
      ) : (
        <>
          <AceDfScatter rows={acedf} ds={ds} C={C} />
          <div style={{ fontSize: 10, color: C.gray, margin: '2px 2px 2px' }}>2026.8~ 앱 기록 기준</div>
          <CollapsibleTable label={`전체 ${acedf.length}명 보기`} C={C}>
            <div style={ds.card}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <SortHeader label="이름" sortKey="name" sort={sort} onSort={onSort} align="left" ds={ds} />
                    <SortHeader label="에이스" sortKey="aces" sort={sort} onSort={onSort} ds={ds} />
                    <SortHeader label="DF" sortKey="doubleFaults" sort={sort} onSort={onSort} ds={ds} />
                    <SortHeader label="경기수" sortKey="recordedGames" sort={sort} onSort={onSort} ds={ds} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => (
                    <tr key={e.name}>
                      <td style={{ ...ds.td(), textAlign: 'left' }}>{e.name}</td>
                      <td style={ds.td()}>{e.aces}</td>
                      <td style={ds.td()}>{e.doubleFaults}</td>
                      <td style={{ ...ds.td(), fontSize: 10, color: C.gray }}>{e.recordedGames}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleTable>
        </>
      )}
    </>
  );
}

// ─── 개인 프로필 레이더 섹션 ────────────────────────────
function RadarSection({ radar, ds, C }) {
  return (
    <>
      <div style={ds.sectionTitle}>개인 프로필</div>
      <PlayerRadarChart radar={radar} ds={ds} C={C} />
      <div style={{ fontSize: 10, color: C.gray, textAlign: 'center', margin: '-6px 0 4px' }}>
        모양 = 회원 대비 순위(백분위) · 라벨 = 실제값 · 승률축은 3경기↑ 회원 기준
      </div>
    </>
  );
}

// ─── 메인 컴포넌트 ──────────────────────────────────────
export default function TennisAnalyticsTab({ C: propC }) {
  const { C: themeC } = useTheme();
  const C = propC ?? themeC;
  const ds = makeStyles(C);
  const [rows, setRows] = useState([]);
  const [legacyRows, setLegacyRows] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('individual');         // 서브탭: 개인지표(기본) / 전체지표
  const [format, setFormat] = useState('복식');           // 복식 기본 (스펙 §5)
  const [player, setPlayer] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      TennisSync.getPlayerGames().then(setRows),
      TennisSync.getLegacyRecords().then(setLegacyRows),
      TennisSync.getRoster().then(setRoster),
    ]).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  // 선수 드롭다운 = 정회원 로스터 ∪ 기록 보유자(playerDropdownNames). 게스트 재분류 회귀 방지.
  const rosterNames = useMemo(() => playerDropdownNames(roster, rows), [roster, rows]);

  // ── 날짜 필터 state / 파생 (계산기 useMemo들 위에 무조건 호출) ──────────
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const years = useMemo(() => availableYears({ rows, legacyRows: [] }), [rows]);
  const now = new Date();
  const curYear = String(now.getFullYear());
  const effYear = year || (years.includes(curYear) ? curYear : (years[0] || curYear));
  const monthOpts = useMemo(() => availableMonths({ rows, year: effYear }), [rows, effYear]);
  const fRows = useMemo(() => filterRowsByPeriod(rows, { year: effYear, month }), [rows, effYear, month]);

  const seedOrder = useMemo(() => priorYearSinglesOrder({ rows, legacyRows, roster, year: effYear }), [rows, legacyRows, roster, effYear]);
  const singlesStandings = useMemo(
    () => buildSinglesStandings({ rows: fRows, roster, asOfDate: today, sortBy: 'points', seedOrder }), [fRows, roster, today, seedOrder]);

  const chemistry = useMemo(() => buildPairChemistry({ rows: fRows }), [fRows]);

  const partnerBreakdown = useMemo(
    () => player ? buildPartnerBreakdown({ rows: fRows, player }) : [], [fRows, player]);

  const h2h = useMemo(
    () => player ? buildHeadToHead({ rows: fRows, player, format }) : [], [fRows, player, format]);

  const monthly = useMemo(
    () => player ? buildMonthlyForm({ rows: fRows, player, format }) : [], [fRows, player, format]);

  const tbRanking = useMemo(() => buildTbRanking({ rows: fRows, roster, format }), [fRows, roster, format]);
  const bagelRanking = useMemo(() => buildBagelRanking({ rows: fRows, roster, format }), [fRows, roster, format]);
  const aceDfRanking = useMemo(() => buildAceDfRanking({ rows: fRows, roster, format }), [fRows, roster, format]);

  // 연도별(기간별) 전적 카드는 필터와 무관하게 전체 커리어(전연도 2024~+통산) 비교를 보여준다 — 필터는 나머지 섹션만 스코핑.
  const yearlyRecords = useMemo(
    () => player ? buildYearlyRecords({ legacyRows, rows, player, format }) : [],
    [legacyRows, rows, player, format]);

  // 상세 로우 없는 단식 집계(예: 2026 1~7월)를 전적에 가산 — 특정 월 선택 시엔 월 귀속 불가라 제외.
  const singlesAgg = useMemo(
    () => (!month ? legacySinglesForYear(legacyRows, effYear) : []),
    [legacyRows, effYear, month]);

  const summary = useMemo(
    () => player ? buildPlayerSummary({ rows: fRows, player, legacySingles: singlesAgg }) : null,
    [fRows, player, singlesAgg]);

  // 레이더: 선수 선택 시에만 계산 — 로스터 전체 요약을 순회하므로 useMemo 격리
  const radar = useMemo(
    () => player ? buildPlayerRadar({ rows: fRows, roster, player, asOfDate: today, seedOrder }) : null,
    [fRows, roster, player, today, seedOrder]);

  const sectionKeys = useMemo(
    () => analyticsSectionKeys({ view, player, format, hasLegacy: yearlyRecords.length > 0, hasMonth: !!month }),
    [view, player, format, yearlyRecords, month]);

  const selectStyle = {
    background: C.cardLight,
    color: C.white,
    border: `1px solid ${C.borderColor}`,
    borderRadius: 8,
    padding: '5px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
  };

  if (loading) return (
    <div style={ds.section}>
      <div style={{ ...ds.card, color: C.gray, fontSize: 13, textAlign: 'center', padding: 24 }}>데이터 로딩중…</div>
    </div>
  );

  return (
    <div style={ds.section}>
      {/* 서브탭: 개인지표 / 전체지표 (성격이 다른 지표를 분리) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[['individual', '개인지표'], ['overall', '전체지표']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={ds.chip(view === v)}>{label}</button>
        ))}
      </div>

      {/* 포맷 토글 + 연/월 필터 + (개인지표) 선수 선택 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['복식', '단식'].map(f => (
          <button key={f} onClick={() => setFormat(f)} style={ds.chip(format === f)}>{f}</button>
        ))}
        <select value={effYear} onChange={e => { setYear(e.target.value); setMonth(''); }} style={{ ...selectStyle }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...selectStyle }}>
          <option value="">전체월</option>
          {monthOpts.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
        </select>
        {view === 'individual' && (
          <select
            value={player}
            onChange={e => setPlayer(e.target.value)}
            style={{ marginLeft: 'auto', ...selectStyle }}
          >
            <option value="">선수 선택</option>
            {rosterNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      {view === 'individual' && !player && (
        <div style={{ ...ds.card, color: C.gray, fontSize: 13, textAlign: 'center', padding: 20 }}>
          선수를 선택하면 개인 지표(레이더·전적·상대·파트너·월별)가 표시됩니다.
        </div>
      )}

      {sectionKeys.map((key) => {
        switch (key) {
          case 'radar':            return radar ? <RadarSection key={key} radar={radar} ds={ds} C={C} /> : null;
          case 'chemistry':        return <ChemistrySection key={key} chemistry={chemistry} showBreakdown={false} ds={ds} C={C} />;
          case 'summary':          return summary ? <SummaryCard key={key} summary={summary} player={player} points={singlesStandings.find(s => s.name === player)?.points ?? 0} ds={ds} C={C} /> : null;
          case 'partner':          return <ChemistrySection key={key} chemistry={[]} breakdown={partnerBreakdown} player={player} showChemistry={false} ds={ds} C={C} />;
          case 'h2h':              return <HeadToHeadSection key={key} h2h={h2h} player={player} ds={ds} C={C} />;
          case 'monthly':          return <MonthlyFormSection key={key} monthly={monthly} player={player} format={format} ds={ds} C={C} />;
          case 'yearly':           return <YearlyRecordsSection key={key} entries={yearlyRecords} ds={ds} C={C} />;
          case 'tb':               return <TbBagelSection key={key} tb={tbRanking} bagel={bagelRanking} ds={ds} C={C} />;
          case 'acedf':            return <AceDfSection key={key} acedf={aceDfRanking} ds={ds} C={C} />;
          default:                 return null;
        }
      })}
    </div>
  );
}
