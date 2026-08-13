// src/components/dashboard/analytics/OpponentLeadersView.jsx
// 상대팀별 리더보드 (축구 전용): 상대팀을 고르면 그 팀 상대 경기당 포인트 TOP / 수비 실점률 TOP.
// 풋살의 '라이벌'(클럽 내전 상대전적) 자리에 대응하는 축구판 — 축구 상대는 외부팀이라 축이 다르다.
// 집계는 앱 기록 구간(legacy 제외)만 — 이유는 calcOpponentLeaders 주석 참고.
import { useMemo, useState } from 'react';
import { calcOpponentLeaders } from '../../../utils/soccerAnalytics';
import { DEFENSE_METRICS } from './defenseMetrics';

// 렌더 함수 밖에 둔다 — 안에서 정의하면 매 렌더마다 새 함수 참조가 되어
// 상대팀 칩을 바꿀 때마다 행들이 diff 대신 언마운트/재마운트된다.
function Row({ i, name, games, value, sub, color, C }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '5px 0', borderBottom: `1px dashed ${C.grayDarker}` }}>
      <span style={{ fontWeight: 700, color: i < 3 ? C.orange : C.gray, minWidth: 14 }}>{i + 1}</span>
      <span style={{ fontWeight: 600, color: C.white, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      <span style={{ color: C.gray, fontSize: 10, flexShrink: 0 }}>{games}G</span>
      <span style={{ fontWeight: 700, color, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {sub && <span style={{ color: C.gray, fontSize: 9.5, flexShrink: 0, width: 46, textAlign: 'right' }}>{sub}</span>}
    </div>
  );
}

export default function OpponentLeadersView({ matchLogs, eventLogs, C }) {
  const data = useMemo(
    () => calcOpponentLeaders({ eventLogs: eventLogs || [], matchLogs: matchLogs || [] }),
    [matchLogs, eventLogs],
  );
  const [picked, setPicked] = useState(null);
  const opponent = picked && data.byOpponent[picked] ? picked : (data.opponents[0]?.opponent ?? null);

  if (!opponent) {
    return (
      <div style={{ textAlign: 'center', padding: 30, color: C.gray, fontSize: 12 }}>
        순위를 낼 만큼 붙어본 상대팀이 없습니다 (5경기 이상 필요)
      </div>
    );
  }

  const view = data.byOpponent[opponent];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {data.opponents.map(o => (
          <button key={o.opponent} onClick={() => setPicked(o.opponent)} style={{
            padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: o.opponent === opponent ? C.accent + '22' : 'transparent',
            color: o.opponent === opponent ? C.accent : C.gray,
            border: `1px solid ${o.opponent === opponent ? C.accent : C.grayDarker}`,
          }}>
            {o.opponent} <span style={{ fontSize: 9 }}>({o.matches})</span>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 2 }}>경기당 포인트 (골+어시)</div>
        <div style={{ fontSize: 10, color: C.gray, marginBottom: 4 }}>{opponent} 상대 {view.matches}경기 · 3경기 이상</div>
        {view.pointLeaders.length === 0
          ? <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
          : view.pointLeaders.map((x, i) => (
            <Row key={x.name} i={i} name={x.name} games={x.games} C={C}
              value={`${x.pointsPerGame.toFixed(2)}P`} sub={`${x.goals}골 ${x.assists}어시`} color={C.green} />
          ))}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 2 }}>수비 실점률</div>
        <div style={{ fontSize: 10, color: C.gray, marginBottom: 4 }}>
          {/* 수비 기록이 0경기면 팀 평균도 없다 — 0.00으로 찍으면 '무실점 팀'으로 읽힌다 */}
          수비수 기록 {view.defenseMatches}경기 · 팀 평균 {view.defenseMatches > 0 ? `${view.teamConcededPerGame.toFixed(2)}실점` : '–'} · 3경기 이상
        </div>
        {view.defenseLeaders.length === 0
          ? <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
          : view.defenseLeaders.map((x, i) => (
            <Row key={x.name} i={i} name={x.name} games={x.games} C={C}
              value={DEFENSE_METRICS.conceded.formatValue(x)}
              sub={`무실점 ${DEFENSE_METRICS.clean.formatValue(x)}`} color={C.accent} />
          ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 9.5, color: C.gray, lineHeight: 1.5 }}>
        앱 기록 구간만 집계 — 그 이전 경기는 출전 명단이 없어 선수 간 비교가 성립하지 않습니다.
        <br />⚠️ 상대팀 전력·GK 영향이 섞인 참고 지표.
      </div>
    </div>
  );
}
