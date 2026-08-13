// 테니스 클럽 개요 대시보드(2단계). 정적·비인터랙티브. 분석 계산기 재사용.
import { useEffect, useMemo, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildMonthSummary } from '../../utils/tennis/tennisDashboard';
import { buildDoublesStandings, buildPairChemistry, buildTbRanking, buildBagelRanking, buildAceDfRanking } from '../../utils/tennis/tennisAnalytics';
import { buildSinglesStandings } from '../../utils/tennis/tennisStandings';
import { useTheme } from '../../hooks/useTheme';
import { makeStyles } from '../../styles/theme';

const pct = (r) => r > 0 ? `${Math.round(r * 100)}%` : '-';

function StatCell({ label, value, C }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.gray }}>{label}</div>
      <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: C.white }}>{value}</div>
    </div>
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

  useEffect(() => {
    TennisSync.getPlayerGames().then(setRows);
    TennisSync.getRoster().then(setRoster);
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const months = useMemo(
    () => [...new Set((rows || []).map(r => (r.date || '').slice(0, 7)).filter(Boolean))].sort(),
    [rows]);
  const curMonth = useMemo(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; }, []);
  const targetMonth = months.includes(curMonth) ? curMonth : (months[months.length - 1] || curMonth);

  const summary = useMemo(() => buildMonthSummary({ rows, month: targetMonth }), [rows, targetMonth]);
  const doubles = useMemo(() => buildDoublesStandings({ rows, roster }).slice(0, 5), [rows, roster]);
  const singles = useMemo(() => buildSinglesStandings({ rows, roster, asOfDate: today }).slice(0, 5), [rows, roster, today]);
  const chem = useMemo(() => buildPairChemistry({ rows }).slice(0, 5), [rows]);
  const tb = useMemo(() => buildTbRanking({ rows, roster }), [rows, roster]);
  const bagel = useMemo(() => buildBagelRanking({ rows, roster }), [rows, roster]);
  const acedf = useMemo(() => buildAceDfRanking({ rows, roster }), [rows, roster]);

  const highlight = (label, top, fmt) =>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: C.white }}>
      <span style={{ color: C.gray }}>{label}</span>
      <span>{top ? fmt(top) : '-'}</span>
    </div>;

  return (
    <div style={ds.section}>
      {/* 1. 이번달 요약 */}
      <div style={ds.sectionTitle}>{targetMonth} 요약</div>
      <div style={ds.card}>
        <div style={{ display: 'flex', marginBottom: 12 }}>
          <StatCell C={C} label="경기수" value={summary.matches} />
          <StatCell C={C} label="경기일" value={`${summary.days}일`} />
        </div>
        <div style={{ display: 'flex' }}>
          <StatCell C={C} label="최다 출전" value={summary.topAttender ? `${summary.topAttender.name} (${summary.topAttender.games})` : '-'} />
          <StatCell C={C} label="이달 승률 1위" value={summary.hotPlayer ? `${summary.hotPlayer.name} ${pct(summary.hotPlayer.rate)} (${summary.hotPlayer.wins}승)` : '-'} />
        </div>
      </div>

      {/* 2. 순위 TOP 5 */}
      <MiniRankTable title="복식 순위 TOP 5" rows={doubles.map(s => ({ ...s, _key: s.name }))} ds={ds}
        cols={[
          { key: 'name', label: '이름', align: 'left', render: r => r.name },
          { key: 'rec', label: '전적', render: r => `${r.wins}-${r.losses}` },
          { key: 'rate', label: '승률', render: r => pct(r.rate) },
        ]} />
      <MiniRankTable title="단식 순위 TOP 5" rows={singles.map(s => ({ ...s, _key: s.name }))} ds={ds}
        cols={[
          { key: 'name', label: '이름', align: 'left', render: r => r.name },
          { key: 'rec', label: '전적', render: r => `${r.wins}-${r.losses}` },
          { key: 'rate', label: '승률', render: r => pct(r.rate) },
          { key: 'p', label: 'P', render: r => r.points },
        ]} />

      {/* 3. 페어 케미 TOP 5 */}
      <MiniRankTable title="페어 케미 TOP 5" rows={chem.map(p => ({ ...p, _key: p.players.join('|') }))} ds={ds}
        cols={[
          { key: 'pair', label: '페어', align: 'left', render: r => `${r.players.join(' · ')}${r.hasGuest ? ' *' : ''}` },
          { key: 'rec', label: '전적', render: r => `${r.wins}-${r.losses}` },
          { key: 'rate', label: '승률', render: r => pct(r.rate) },
        ]} />

      {/* 4. 하이라이트 */}
      <div style={ds.sectionTitle}>하이라이트</div>
      <div style={ds.card}>
        {highlight('타이브레이크', tb[0], t => `${t.name} ${t.tbWon}/${t.tbPlayed}`)}
        {highlight('베이글', bagel[0], b => `${b.name} ${b.given}개`)}
        {highlight('에이스', acedf.slice().sort((a, b) => b.aces - a.aces)[0], a => `${a.name} ${a.aces}개`)}
      </div>
    </div>
  );
}
