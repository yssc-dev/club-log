// 테니스 클럽 개요 대시보드(2단계). 정적·비인터랙티브. 분석 계산기 재사용.
import { useEffect, useMemo, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildMonthSummary, buildLastMatchDay } from '../../utils/tennis/tennisDashboard';
import { buildDoublesStandings, buildPairChemistry, buildTbRanking, buildBagelRanking, buildAceDfRanking } from '../../utils/tennis/tennisAnalytics';
import { buildSinglesStandings } from '../../utils/tennis/tennisStandings';
import { aggregateLegacySingles } from '../../utils/tennis/tennisDateFilter';
import { useTheme } from '../../hooks/useTheme';
import { makeStyles } from '../../styles/theme';
import { pct } from '../../utils/tennis/tennisFormat';
import { RateBar } from './tennisCharts';

function StatCell({ label, value, C }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.gray }}>{label}</div>
      <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: C.white }}>{value}</div>
    </div>
  );
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
// 마지막 경기일 카드 — 요일·경과일('오늘'/'어제'/'N일 전')은 렌더 시 오늘 기준 계산.
function LastMatchCard({ lastDay, ds, C }) {
  const dt = new Date(`${lastDay.date}T00:00:00`);
  const valid = !Number.isNaN(dt.getTime());
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - dt.getTime()) / 86400000);
  // 유효한 날짜 + 과거/오늘만 경과일 표기. 무효/미래는 배지 생략(md만 표시).
  const ago = !valid || diff < 0 ? '' : diff === 0 ? '오늘' : diff === 1 ? '어제' : `${diff}일 전`;
  const md = valid ? `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW[dt.getDay()]})` : lastDay.date;
  return (
    <>
      <div style={ds.sectionTitle}>마지막 경기</div>
      <div style={ds.card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.white }}>{md}</span>
          {ago && <span style={{ fontSize: 12, color: C.accent }}>{ago}</span>}
        </div>
        <div style={{ display: 'flex' }}>
          <StatCell C={C} label="경기수" value={lastDay.matches} />
          <StatCell C={C} label="참석" value={`${lastDay.memberCount}명${lastDay.guestCount ? ` +용병${lastDay.guestCount}` : ''}`} />
          <StatCell C={C} label="다승" value={lastDay.topWinner ? `${lastDay.topWinner.name} ${lastDay.topWinner.wins}승` : '-'} />
        </div>
      </div>
    </>
  );
}

// 정적 순위 미니테이블 (정렬 없음)
function MiniRankTable({ title, rows, cols, ds }) {
  if (!rows.length) return (
    <>
      <div style={ds.sectionTitle}>{title}</div>
      <div style={{ ...ds.card, color: '#888', fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
    </>
  );
  return (
    <>
      <div style={ds.sectionTitle}>{title}</div>
      <div style={ds.card}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...ds.th, textAlign: 'left' }}>#</th>
              {cols.map(c => <th key={c.key} style={{ ...ds.th, textAlign: c.align || 'center' }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r._key || i}>
                <td style={{ ...ds.td(), textAlign: 'left' }}>{i + 1}</td>
                {cols.map(c => <td key={c.key} style={{ ...ds.td(), textAlign: c.align || 'center' }}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function TennisDashboard({ C: propC }) {
  const { C: themeC } = useTheme();
  const C = propC ?? themeC;
  const ds = makeStyles(C);
  const [rows, setRows] = useState([]);
  const [roster, setRoster] = useState([]);
  const [legacyRows, setLegacyRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      TennisSync.getPlayerGames().then(setRows),
      TennisSync.getRoster().then(setRoster),
      TennisSync.getLegacyRecords().then(setLegacyRows),
    ]).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const months = useMemo(
    () => [...new Set((rows || []).map(r => (r.date || '').slice(0, 7)).filter(Boolean))].sort(),
    [rows]);
  const curMonth = useMemo(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; }, []);
  const targetMonth = months.includes(curMonth) ? curMonth : (months[months.length - 1] || curMonth);

  const summary = useMemo(() => buildMonthSummary({ rows, month: targetMonth }), [rows, targetMonth]);
  const lastDay = useMemo(() => buildLastMatchDay({ rows }), [rows]);
  const doubles = useMemo(() => buildDoublesStandings({ rows, roster }).slice(0, 5), [rows, roster]);
  // 단식 상세 로우는 희소(대부분 집계 전적)라 승률 순위에 레거시를 함께 반영한다.
  // 단, 상세 데이터가 있는 연도(현재 2026)의 레거시만 — 복식 순위·연도 라벨과 스코프를 맞춘다.
  // (전 시즌 합산이면 2024/2025 통산까지 섞여 '2026년' 라벨과 어긋난다.)
  const singlesAgg = useMemo(() => {
    const years = new Set((rows || []).map(r => (r.date || '').slice(0, 4)).filter(Boolean));
    return aggregateLegacySingles(legacyRows, years);
  }, [rows, legacyRows]);
  const singles = useMemo(() => buildSinglesStandings({ rows, roster, asOfDate: today, sortBy: 'rate', legacySingles: singlesAgg }).slice(0, 5), [rows, roster, today, singlesAgg]);   // 길로틴은 승률순(리그 탭과 동일)
  // 페어 케미는 다승 기준으로 상위 노출(승률은 소표본이 상단을 차지하기 쉬움).
  const chem = useMemo(() => buildPairChemistry({ rows, minGames: 3 }).slice(0, 5), [rows]);   // 계산기가 승수↓→승률↓ 정렬, TOP5는 3판↑만
  const tb = useMemo(() => buildTbRanking({ rows, roster }), [rows, roster]);
  const bagel = useMemo(() => buildBagelRanking({ rows, roster }), [rows, roster]);
  const acedf = useMemo(() => buildAceDfRanking({ rows, roster }), [rows, roster]);
  // 대시보드 순위는 전체 데이터 기준 — 데이터의 연도 범위를 제목에 표기(연도는 데이터에서 파생 → 2027 등 자동 대응).
  const yearSpan = useMemo(() => {
    const ys = [...new Set((rows || []).map(r => (r.date || '').slice(0, 4)).filter(Boolean))].sort();
    if (!ys.length) return '';
    return ys.length === 1 ? `${ys[0]}년` : `${ys[0]}~${ys[ys.length - 1]}년`;
  }, [rows]);
  // 하이라이트 최고값이 0이면 의미 없으므로 '-' 처리.
  const topAce = useMemo(() => acedf.slice().sort((a, b) => b.aces - a.aces)[0], [acedf]);

  const highlight = (label, top, fmt) =>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: C.white }}>
      <span style={{ color: C.gray }}>{label}</span>
      <span>{top ? fmt(top) : '-'}</span>
    </div>;

  if (loading) return (
    <div style={ds.section}>
      <div style={{ ...ds.card, color: C.gray, fontSize: 13, textAlign: 'center', padding: 24 }}>데이터 로딩중…</div>
    </div>
  );

  return (
    <div style={ds.section}>
      {/* 0. 마지막 경기 */}
      {lastDay && <LastMatchCard lastDay={lastDay} ds={ds} C={C} />}

      {/* 1. 이번달 요약 */}
      <div style={ds.sectionTitle}>{`${targetMonth.slice(0, 4)}년 ${Number(targetMonth.slice(5, 7))}월`} 요약</div>
      <div style={ds.card}>
        <div style={{ display: 'flex', marginBottom: 12 }}>
          <StatCell C={C} label="경기수" value={summary.matches} />
          <StatCell C={C} label="경기일" value={`${summary.days}일`} />
        </div>
        <div style={{ display: 'flex' }}>
          <StatCell C={C} label="최다 출전" value={summary.topAttender ? `${summary.topAttender.name} (${summary.topAttender.games}경기)` : '-'} />
          <StatCell C={C} label="이달 다승 1위" value={summary.hotPlayer ? `${summary.hotPlayer.name} ${summary.hotPlayer.wins}승 (${pct(summary.hotPlayer.rate)})` : '-'} />
        </div>
      </div>

      {/* 2. 순위 TOP 5 */}
      <MiniRankTable title={`복식 순위 TOP 5${yearSpan ? ` · ${yearSpan}` : ''}`} rows={doubles.map(s => ({ ...s, _key: s.name }))} ds={ds}
        cols={[
          { key: 'name', label: '이름', align: 'left', render: r => r.name },
          { key: 'rec', label: '전적', render: r => `${r.wins}-${r.losses}` },
          { key: 'rate', label: '승률', render: r => <RateBar rate={r.rate} pctText={pct(r.rate)} C={C} /> },
        ]} />
      <MiniRankTable title={`단식 순위 TOP 5${yearSpan ? ` · ${yearSpan}` : ''}`} rows={singles.map(s => ({ ...s, _key: s.name }))} ds={ds}
        cols={[
          { key: 'name', label: '이름', align: 'left', render: r => r.name },
          { key: 'rec', label: '전적', render: r => `${r.wins}-${r.losses}` },
          { key: 'rate', label: '승률', render: r => <RateBar rate={r.rate} pctText={pct(r.rate)} C={C} /> },
        ]} />

      {/* 3. 페어 케미 TOP 5 */}
      <MiniRankTable title={`페어 케미 TOP 5${yearSpan ? ` · ${yearSpan}` : ''}`} rows={chem.map(p => ({ ...p, _key: p.players.join('|') }))} ds={ds}
        cols={[
          { key: 'pair', label: '페어', align: 'left', render: r => `${r.players.join(' · ')}${r.hasGuest ? ' *' : ''}` },
          { key: 'rec', label: '전적', render: r => `${r.wins}-${r.losses}` },
          { key: 'rate', label: '승률', render: r => <RateBar rate={r.rate} pctText={pct(r.rate)} C={C} /> },
        ]} />

      {/* 4. 하이라이트 */}
      <div style={ds.sectionTitle}>하이라이트{yearSpan ? ` · ${yearSpan}` : ''}</div>
      <div style={ds.card}>
        {highlight('타이브레이크', tb[0]?.tbPlayed > 0 ? tb[0] : null, t => `${t.name} ${t.tbWon}/${t.tbPlayed}`)}
        {highlight('베이글', bagel[0]?.given > 0 ? bagel[0] : null, b => `${b.name} ${b.given}개`)}
        {highlight('에이스', topAce?.aces > 0 ? topAce : null, a => `${a.name} ${a.aces}개`)}
      </div>
    </div>
  );
}
