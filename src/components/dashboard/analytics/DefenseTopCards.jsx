// src/components/dashboard/analytics/DefenseTopCards.jsx
// 대시보드(축구) 수비 TOP5 카드 3종 — 페어 / 실점률 / 클린시트율.
// 대시보드는 로그_매치를 안 읽으므로 이 컴포넌트가 자기 fetch를 소유한다(지연 로드):
// 첫 페인트를 막지 않고, 도착하면 카드가 채워진다.
// 표시값은 Δ가 아니라 생값 — 골/어시 TOP5와 나란히 놓이는 자리라 캡션 없이 읽혀야 한다.
// Δ 축(부재 대비 억제)은 분석 탭 수비케미에 있다.
import { useEffect, useMemo, useState } from 'react';
import { calcDefenseAnalysis, sortDefenseRows } from '../../../utils/soccerAnalytics';
import { DEFENSE_METRICS } from './defenseMetrics';
import AppSync from '../../../services/appSync';

const TOP_N = 5;

function Row({ i, last, name, games, value, color, C }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '5px 0',
      borderBottom: last ? 'none' : `1px solid ${C.borderColor}`,
    }}>
      <span style={{ fontWeight: 700, color: i < 3 ? C.orange : C.gray, minWidth: 14 }}>{i + 1}</span>
      <span style={{ fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      <span style={{ color: C.gray, fontSize: 10, flexShrink: 0 }}>{games}G</span>
      <span style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{value}</span>
    </div>
  );
}

function Card({ title, rows, nameOf, metric, color, C, ds }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...ds.sectionTitle, fontSize: 12 }}>{title}</div>
      <div style={ds.card}>
        {rows.length === 0
          ? <div style={{ fontSize: 11, color: C.gray, padding: '5px 0' }}>표본 부족</div>
          : rows.map((x, i) => (
            <Row key={nameOf(x)} i={i} last={i === rows.length - 1} C={C}
              name={nameOf(x)} games={x.games}
              value={DEFENSE_METRICS[metric].formatValue(x)} color={color} />
          ))}
      </div>
    </div>
  );
}

export function DefenseTopCardsView({ matchLogs, C, ds }) {
  const d = useMemo(() => calcDefenseAnalysis({ matchLogs: matchLogs || [] }), [matchLogs]);

  // 정렬 축은 분석 탭과 같은 단일소스(sortDefenseRows) — 대시보드만 다른 순서가 되지 않게
  const cards = useMemo(() => ({
    pairs: sortDefenseRows(d.pairs, { metric: 'conceded' }).slice(0, TOP_N),
    conceded: sortDefenseRows(d.individuals, { metric: 'conceded' }).slice(0, TOP_N),
    clean: sortDefenseRows(d.individuals, { metric: 'clean' }).slice(0, TOP_N),
  }), [d]);

  // 임계 미달이면 빈 카드를 걸어두지 않고 통째로 숨긴다
  if (cards.pairs.length === 0 && cards.conceded.length === 0) return null;

  return (
    <div style={ds.section}>
      <Card title="🤝 수비 페어 TOP5" rows={cards.pairs} nameOf={p => `${p.a}·${p.b}`}
        metric="conceded" color={C.green} C={C} ds={ds} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Card title="🛡️ 수비 실점률 TOP5" rows={cards.conceded} nameOf={x => x.name}
          metric="conceded" color={C.green} C={C} ds={ds} />
        <Card title="🧱 수비수 클린시트 TOP5" rows={cards.clean} nameOf={x => x.name}
          metric="clean" color={C.accent} C={C} ds={ds} />
      </div>
      <div style={{ fontSize: 10, color: C.gray, marginTop: 6 }}>
        수비수 기록 {d.scopeMatches}경기 · 팀 평균 {d.teamConcededPerGame.toFixed(2)}실점 · 개인 8경기·페어 5경기 이상
      </div>
    </div>
  );
}

export default function DefenseTopCards({ activeSport, C, ds }) {
  // 로드된 종목을 데이터와 한 덩어리로 들고 있는다 — 종목 전환 직후 이전 종목 카드가
  // 남는 걸 막는 loadedSport 가드(PlayerAnalytics와 같은 규약)를, effect 안 동기 setState 없이 구현.
  const [loaded, setLoaded] = useState({ sport: null, rows: [] });

  useEffect(() => {
    let alive = true;
    AppSync.getMatchLog({ sport: activeSport })
      .then(res => { if (alive) setLoaded({ sport: activeSport, rows: res?.rows || [] }); })
      .catch(() => { if (alive) setLoaded({ sport: activeSport, rows: [] }); });
    return () => { alive = false; };
  }, [activeSport]);

  if (loaded.sport !== activeSport) {
    return (
      <div style={{ ...ds.section, fontSize: 11, color: C.gray, padding: '10px 0' }}>
        수비 지표 불러오는 중...
      </div>
    );
  }
  return <DefenseTopCardsView matchLogs={loaded.rows} C={C} ds={ds} />;
}
