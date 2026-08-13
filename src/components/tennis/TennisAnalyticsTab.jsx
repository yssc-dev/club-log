// 분석 탭 본문. 시트 2종(로그_테니스선수경기 + 테니스_레거시전적)을 읽어 클라이언트에서 계산한다.
// 경기 중 화면과 무관 — 당일/누적 경계(스펙 §2)를 지킨다.
import { useEffect, useMemo, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildSinglesStandings, buildPlayerSummary } from '../../utils/tennis/tennisStandings';
import {
  buildDoublesStandings, buildPairChemistry, buildPartnerBreakdown, buildHeadToHead,
  buildMonthlyForm, buildTbRanking, buildBagelRanking, buildAceDfRanking, buildYearlyRecords,
} from '../../utils/tennis/tennisAnalytics';
import { analyticsSectionKeys } from '../../utils/tennis/analyticsSections';
import { availableYears, availableMonths, isRowYear, filterRowsByPeriod, buildLegacyStandings } from '../../utils/tennis/tennisDateFilter';
import { makeStyles } from '../../styles/theme';
import { useTheme } from '../../hooks/useTheme';
import { useSortableRows, SortHeader } from './Sortable';

const pct = (r) => r > 0 ? `${Math.round(r * 100)}%` : '-';

// ─── 요약 카드 (개인 뷰) ────────────────────────────────
function StatCell({ label, value, C }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.gray }}>{label}</div>
      <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: C.white }}>{value}</div>
    </div>
  );
}

function SummaryCard({ summary, player, ds, C }) {
  return (
    <>
      <div style={ds.sectionTitle}>{player} 요약</div>
      <div style={ds.card}>
        <div style={{ display: 'flex', marginBottom: 12 }}>
          <StatCell C={C} label="단식" value={`${summary.singles.wins}-${summary.singles.losses}`} />
          <StatCell C={C} label="복식" value={`${summary.doubles.wins}-${summary.doubles.losses}`} />
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

// ─── 복식 순위표 ────────────────────────────────────────
function DoublesStandingsSection({ standings, ds }) {
  const cols = useMemo(() => ({
    name:   { accessor: s => s.name, type: 'text' },
    grade:  { accessor: s => s.grade || '', type: 'text' },
    record: { accessor: s => s.wins, type: 'num' },
    rate:   { accessor: s => s.rate, type: 'num' },
  }), []);
  const { sorted, sort, onSort } = useSortableRows(standings, cols);
  if (!standings.length) return null;
  return (
    <>
      <div style={ds.sectionTitle}>복식 순위 (투몽)</div>
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
            {sorted.map((s, i) => (
              <tr key={s.name}>
                <td style={{ ...ds.td(), textAlign: 'left' }}>{i + 1}</td>
                <td style={{ ...ds.td(true), textAlign: 'left' }}>{s.name}</td>
                <td style={{ ...ds.td(), fontSize: 10 }}>{s.grade}</td>
                <td style={ds.td()}>{s.wins}-{s.losses}</td>
                <td style={ds.td()}>{pct(s.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── 단식 순위표 (포인트 컬럼은 단식 뷰 전용) ──────────
function SinglesStandingsSection({ standings, ds }) {
  const cols = useMemo(() => ({
    name:       { accessor: s => s.name, type: 'text' },
    leagueTier: { accessor: s => s.leagueTier || '', type: 'text' },
    grade:      { accessor: s => s.grade || '', type: 'text' },
    record:     { accessor: s => s.wins, type: 'num' },
    rate:       { accessor: s => s.rate, type: 'num' },
    points:     { accessor: s => s.points, type: 'num' },
  }), []);
  const { sorted, sort, onSort } = useSortableRows(standings, cols);
  if (!standings.length) return null;
  return (
    <>
      <div style={ds.sectionTitle}>길로틴리그 (단식 승률)</div>
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
            {sorted.map((s, i) => (
              <tr key={s.name}>
                <td style={{ ...ds.td(), textAlign: 'left' }}>{i + 1}</td>
                <td style={{ ...ds.td(true), textAlign: 'left' }}>{s.name}</td>
                <td style={{ ...ds.td(), fontSize: 10 }}>{s.leagueTier === '흑기사' ? 'BK' : 'BR'}</td>
                <td style={{ ...ds.td(), fontSize: 10 }}>{s.grade}</td>
                <td style={ds.td()}>{s.wins}-{s.losses}</td>
                <td style={ds.td()}>{pct(s.rate)}</td>
                <td style={ds.td()}>{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── 연도별 전적 (legacyRows 비면 숨김) ─────────────────
function YearlyRecordsSection({ entries, ds }) {
  if (!entries.length) return null;
  return (
    <>
      <div style={ds.sectionTitle}>연도별 전적</div>
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

  const brkCols = useMemo(() => ({
    partner: { accessor: b => b.partner, type: 'text' },
    record:  { accessor: b => b.wins, type: 'num' },
    rate:    { accessor: b => b.rate, type: 'num' },
  }), []);
  const { sorted: sortedBrk, sort: sortBrk, onSort: onSortBrk } = useSortableRows(breakdown, brkCols);

  return (
    <>
      {showChemistry && (
        <>
          <div style={ds.sectionTitle}>페어 케미 (3경기↑)</div>
          {chemistry.length === 0 ? (
            <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
          ) : (
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
          )}
        </>
      )}
      {showBreakdown && player && breakdown.length > 0 && (
        <>
          <div style={ds.sectionTitle}>{player} 파트너별</div>
          <div style={ds.card}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <SortHeader label="파트너" sortKey="partner" sort={sortBrk} onSort={onSortBrk} align="left" ds={ds} />
                  <SortHeader label="전적" sortKey="record" sort={sortBrk} onSort={onSortBrk} ds={ds} />
                  <SortHeader label="승률" sortKey="rate" sort={sortBrk} onSort={onSortBrk} ds={ds} />
                </tr>
              </thead>
              <tbody>
                {sortedBrk.map((b) => (
                  <tr key={b.partner}>
                    <td style={{ ...ds.td(), textAlign: 'left' }}>
                      {b.partner}{b.isGuestPartner ? ' *' : ''}
                    </td>
                    <td style={ds.td()}>{b.wins}-{b.losses}</td>
                    <td style={ds.td()}>{pct(b.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ─── 상대 전적 ──────────────────────────────────────────
function HeadToHeadSection({ h2h, player, ds, C }) {
  const cols = useMemo(() => ({
    opponent: { accessor: e => e.opponent, type: 'text' },
    record:   { accessor: e => e.wins, type: 'num' },
    rate:     { accessor: e => e.rate, type: 'num' },
  }), []);
  const { sorted, sort, onSort } = useSortableRows(h2h, cols);
  return (
    <>
      <div style={ds.sectionTitle}>{player || '—'} 상대 전적</div>
      {h2h.length === 0 ? (
        <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
      ) : (
        <div style={ds.card}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <SortHeader label="상대" sortKey="opponent" sort={sort} onSort={onSort} align="left" ds={ds} />
                <SortHeader label="전적" sortKey="record" sort={sort} onSort={onSort} ds={ds} />
                <SortHeader label="승률" sortKey="rate" sort={sort} onSort={onSort} ds={ds} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.opponent}>
                  <td style={{ ...ds.td(), textAlign: 'left' }}>{e.opponent}</td>
                  <td style={ds.td()}>{e.wins}-{e.losses}</td>
                  <td style={ds.td()}>{pct(e.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

  return (
    <>
      <div style={ds.sectionTitle}>타이브레이크</div>
      <div style={ds.card}>
        {tb.length === 0 ? (
          <div style={{ color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
        ) : (
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
        )}
      </div>
      <div style={ds.sectionTitle}>베이글</div>
      <div style={ds.card}>
        {bagel.length === 0 ? (
          <div style={{ color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
        ) : (
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
        )}
      </div>
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
      <div style={ds.card}>
        <div style={{ fontSize: 10, color: C.gray, marginBottom: 8 }}>2026.8~ 앱 기록 기준</div>
        {acedf.length === 0 ? (
          <div style={{ color: C.gray, fontSize: 12, textAlign: 'center', padding: 8 }}>기록 없음</div>
        ) : (
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
        )}
      </div>
    </>
  );
}

// ─── 레거시 연도 순위 (집계 데이터) ─────────────────────
export function LegacyStandingsSection({ standings, year, format, ds, C }) {
  return (
    <>
      <div style={ds.sectionTitle}>{year} {format} 순위 (집계)</div>
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
                  <td style={ds.td()}>{pct(s.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  const [format, setFormat] = useState('복식');           // 복식 기본 (스펙 §5)
  const [player, setPlayer] = useState('');

  useEffect(() => {
    TennisSync.getPlayerGames().then(setRows);
    TennisSync.getLegacyRecords().then(setLegacyRows);
    TennisSync.getRoster().then(setRoster);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const rosterNames = useMemo(() => (roster || []).map(m => m.name).filter(Boolean), [roster]);

  // ── 날짜 필터 state / 파생 (계산기 useMemo들 위에 무조건 호출) ──────────
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const years = useMemo(() => availableYears({ rows, legacyRows }), [rows, legacyRows]);
  const now = new Date();
  const curYear = String(now.getFullYear());
  const effYear = year || (years.includes(curYear) ? curYear : (years[0] || curYear));
  const mode = isRowYear({ rows, year: effYear })
    ? 'row'
    : (years.includes(effYear) ? 'legacy' : 'row');  // 알려진 레거시 연도만 'legacy'
  const monthOpts = useMemo(() => availableMonths({ rows, year: effYear }), [rows, effYear]);
  const fRows = useMemo(() => filterRowsByPeriod(rows, { year: effYear, month }), [rows, effYear, month]);
  const legacyStandings = useMemo(() => buildLegacyStandings({ legacyRows, year: effYear, format }), [legacyRows, effYear, format]);

  const doublesStandings = useMemo(
    () => buildDoublesStandings({ rows: fRows, roster }), [fRows, roster]);

  const singlesStandings = useMemo(
    () => buildSinglesStandings({ rows: fRows, roster, asOfDate: today }), [fRows, roster, today]);

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

  const summary = useMemo(
    () => player ? buildPlayerSummary({ rows: fRows, player }) : null,
    [fRows, player]);

  const sectionKeys = useMemo(
    () => analyticsSectionKeys({ player, format, hasLegacy: yearlyRecords.length > 0, mode, hasMonth: !!month }),
    [player, format, yearlyRecords, mode, month]);

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

  return (
    <div style={ds.section}>
      {/* 포맷 토글 + 연/월 필터 + 선수 선택 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['복식', '단식'].map(f => (
          <button key={f} onClick={() => setFormat(f)} style={ds.chip(format === f)}>{f}</button>
        ))}
        <select value={effYear} onChange={e => { setYear(e.target.value); setMonth(''); }} style={{ ...selectStyle }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {mode === 'row' && (
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...selectStyle }}>
            <option value="">전체월</option>
            {monthOpts.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
          </select>
        )}
        {mode === 'row' && (
          <select
            value={player}
            onChange={e => setPlayer(e.target.value)}
            style={{ marginLeft: 'auto', ...selectStyle }}
          >
            <option value="">전체 랭킹</option>
            {rosterNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      {mode === 'legacy' && (
        <div style={{ ...ds.card, fontSize: 12, color: C.gray, marginBottom: 10 }}>
          {effYear}년은 집계 전적만 있습니다. 상세 지표(케미·타이브레이크·월별 등)는 2026년부터 제공됩니다.
        </div>
      )}

      {sectionKeys.map((key) => {
        switch (key) {
          case 'doublesStandings': return <DoublesStandingsSection key={key} standings={doublesStandings} ds={ds} />;
          case 'singlesStandings': return <SinglesStandingsSection key={key} standings={singlesStandings} ds={ds} />;
          case 'chemistry':        return <ChemistrySection key={key} chemistry={chemistry} showBreakdown={false} ds={ds} C={C} />;
          case 'summary':          return summary ? <SummaryCard key={key} summary={summary} player={player} ds={ds} C={C} /> : null;
          case 'partner':          return <ChemistrySection key={key} chemistry={[]} breakdown={partnerBreakdown} player={player} showChemistry={false} ds={ds} C={C} />;
          case 'h2h':              return <HeadToHeadSection key={key} h2h={h2h} player={player} ds={ds} C={C} />;
          case 'monthly':          return <MonthlyFormSection key={key} monthly={monthly} player={player} format={format} ds={ds} C={C} />;
          case 'yearly':           return <YearlyRecordsSection key={key} entries={yearlyRecords} ds={ds} />;
          case 'legacyStandings':  return <LegacyStandingsSection key={key} standings={legacyStandings} year={effYear} format={format} ds={ds} C={C} />;
          case 'tb':               return <TbBagelSection key={key} tb={tbRanking} bagel={bagelRanking} ds={ds} C={C} />;
          case 'acedf':            return <AceDfSection key={key} acedf={aceDfRanking} ds={ds} C={C} />;
          default:                 return null;
        }
      })}
    </div>
  );
}
