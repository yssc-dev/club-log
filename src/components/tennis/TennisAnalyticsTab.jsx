// 분석 탭 본문. 시트 2종(로그_테니스선수경기 + 테니스_레거시전적)을 읽어 클라이언트에서 계산한다.
// 경기 중 화면과 무관 — 당일/누적 경계(스펙 §2)를 지킨다.
import { useEffect, useMemo, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildSinglesStandings } from '../../utils/tennis/tennisStandings';
import {
  buildDoublesStandings, buildPairChemistry, buildPartnerBreakdown, buildHeadToHead,
  buildMonthlyForm, buildTbRanking, buildBagelRanking, buildAceDfRanking, buildYearlyRecords,
} from '../../utils/tennis/tennisAnalytics';
import { makeStyles } from '../../styles/theme';

const pct = (r) => r > 0 ? `${Math.round(r * 100)}%` : '-';

// ─── 복식 순위표 ────────────────────────────────────────
function DoublesStandingsSection({ standings, ds }) {
  if (!standings.length) return null;
  return (
    <>
      <div style={ds.sectionTitle}>복식 순위 (투몽)</div>
      <div style={ds.card}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...ds.th, textAlign: 'left' }}>#</th>
              <th style={{ ...ds.th, textAlign: 'left' }}>이름</th>
              <th style={ds.th}>등급</th>
              <th style={ds.th}>전적</th>
              <th style={ds.th}>승률</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
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
  if (!standings.length) return null;
  return (
    <>
      <div style={ds.sectionTitle}>길로틴리그 (단식 승률)</div>
      <div style={ds.card}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...ds.th, textAlign: 'left' }}>#</th>
              <th style={{ ...ds.th, textAlign: 'left' }}>이름</th>
              <th style={ds.th}>리그</th>
              <th style={ds.th}>등급</th>
              <th style={ds.th}>전적</th>
              <th style={ds.th}>승률</th>
              <th style={ds.th}>P</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
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
function ChemistrySection({ chemistry, breakdown, player, ds, C }) {
  return (
    <>
      <div style={ds.sectionTitle}>페어 케미 (3경기↑)</div>
      {chemistry.length === 0 ? (
        <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
      ) : (
        <div style={ds.card}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...ds.th, textAlign: 'left' }}>페어</th>
                <th style={ds.th}>전적</th>
                <th style={ds.th}>승률</th>
              </tr>
            </thead>
            <tbody>
              {chemistry.map((p) => (
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
      {player && breakdown.length > 0 && (
        <>
          <div style={ds.sectionTitle}>{player} 파트너별</div>
          <div style={ds.card}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...ds.th, textAlign: 'left' }}>파트너</th>
                  <th style={ds.th}>전적</th>
                  <th style={ds.th}>승률</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
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
                <th style={{ ...ds.th, textAlign: 'left' }}>상대</th>
                <th style={ds.th}>전적</th>
                <th style={ds.th}>승률</th>
              </tr>
            </thead>
            <tbody>
              {h2h.map((e) => (
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
                <th style={{ ...ds.th, textAlign: 'left' }}>이름</th>
                <th style={ds.th}>승/판</th>
                <th style={ds.th}>승률</th>
              </tr>
            </thead>
            <tbody>
              {tb.map((e) => (
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
                <th style={{ ...ds.th, textAlign: 'left' }}>이름</th>
                <th style={ds.th}>준</th>
                <th style={ds.th}>먹음</th>
              </tr>
            </thead>
            <tbody>
              {bagel.map((e) => (
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
                <th style={{ ...ds.th, textAlign: 'left' }}>이름</th>
                <th style={ds.th}>에이스</th>
                <th style={ds.th}>DF</th>
                <th style={ds.th}>경기수</th>
              </tr>
            </thead>
            <tbody>
              {acedf.map((e) => (
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

// ─── 메인 컴포넌트 ──────────────────────────────────────
export default function TennisAnalyticsTab({ C, authUserName }) {
  const ds = makeStyles(C);
  const [rows, setRows] = useState([]);
  const [legacyRows, setLegacyRows] = useState([]);
  const [roster, setRoster] = useState([]);
  const [format, setFormat] = useState('복식');           // 복식 기본 (스펙 §5)
  const [player, setPlayer] = useState(authUserName || '');

  useEffect(() => {
    TennisSync.getPlayerGames().then(setRows);
    TennisSync.getLegacyRecords().then(setLegacyRows);
    TennisSync.getRoster().then(setRoster);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const rosterNames = useMemo(() => (roster || []).map(m => m.name).filter(Boolean), [roster]);

  const doublesStandings = useMemo(
    () => buildDoublesStandings({ rows, roster }), [rows, roster]);

  const singlesStandings = useMemo(
    () => buildSinglesStandings({ rows, roster, asOfDate: today }), [rows, roster, today]);

  const chemistry = useMemo(() => buildPairChemistry({ rows }), [rows]);

  const partnerBreakdown = useMemo(
    () => player ? buildPartnerBreakdown({ rows, player }) : [], [rows, player]);

  const h2h = useMemo(
    () => player ? buildHeadToHead({ rows, player, format }) : [], [rows, player, format]);

  const monthly = useMemo(
    () => player ? buildMonthlyForm({ rows, player, format }) : [], [rows, player, format]);

  const tbRanking = useMemo(() => buildTbRanking({ rows, roster, format }), [rows, roster, format]);
  const bagelRanking = useMemo(() => buildBagelRanking({ rows, roster, format }), [rows, roster, format]);
  const aceDfRanking = useMemo(() => buildAceDfRanking({ rows, roster, format }), [rows, roster, format]);

  const yearlyRecords = useMemo(
    () => player ? buildYearlyRecords({ legacyRows, rows, player, format }) : [],
    [legacyRows, rows, player, format]);

  return (
    <div style={ds.section}>
      {/* 포맷 토글 + 선수 선택 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['복식', '단식'].map(f => (
          <button key={f} onClick={() => setFormat(f)} style={ds.chip(format === f)}>{f}</button>
        ))}
        <select
          value={player}
          onChange={e => setPlayer(e.target.value)}
          style={{
            marginLeft: 'auto',
            background: C.cardLight,
            color: C.white,
            border: `1px solid ${C.borderColor}`,
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 13,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <option value="">선수 선택</option>
          {rosterNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {format === '복식' ? (
        <>
          <DoublesStandingsSection standings={doublesStandings} ds={ds} />
          {legacyRows.length > 0 && <YearlyRecordsSection entries={yearlyRecords} ds={ds} />}
          <ChemistrySection chemistry={chemistry} breakdown={partnerBreakdown} player={player} ds={ds} C={C} />
          <HeadToHeadSection h2h={h2h} player={player} ds={ds} C={C} />
          <MonthlyFormSection monthly={monthly} player={player} format={format} ds={ds} C={C} />
          <TbBagelSection tb={tbRanking} bagel={bagelRanking} ds={ds} C={C} />
          <AceDfSection acedf={aceDfRanking} ds={ds} C={C} />
        </>
      ) : (
        <>
          <SinglesStandingsSection standings={singlesStandings} ds={ds} />
          {legacyRows.length > 0 && <YearlyRecordsSection entries={yearlyRecords} ds={ds} />}
          <HeadToHeadSection h2h={h2h} player={player} ds={ds} C={C} />
          <MonthlyFormSection monthly={monthly} player={player} format={format} ds={ds} C={C} />
          <TbBagelSection tb={tbRanking} bagel={bagelRanking} ds={ds} C={C} />
          <AceDfSection acedf={aceDfRanking} ds={ds} C={C} />
        </>
      )}
    </div>
  );
}
