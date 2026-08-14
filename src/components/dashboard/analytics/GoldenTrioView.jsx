import { useMemo, useState } from 'react';
import * as futsalCalc from '../../../utils/analyticsV2';
import * as soccerCalc from '../../../utils/soccerAnalytics';

export default function GoldenTrioView({ matchLogs, C, isSoccer = false }) {
  const { calcGoldenTrio } = isSoccer ? soccerCalc : futsalCalc;
  const trios = useMemo(() => calcGoldenTrio({ matchLogs: matchLogs || [], minRounds: 5, topN: 5 }), [matchLogs]);
  const [expanded, setExpanded] = useState(null);

  if (!matchLogs || matchLogs.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>로그_매치 데이터가 없습니다.</div>;
  }
  if (trios.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>조건을 만족하는 2인 조합이 없습니다. (최소 5경기 동행)</div>;
  }

  const outcomeColor = (o) => o === 'W' ? '#22c55e' : o === 'D' ? C.gray : '#ef4444';
  const outcomeLabel = (o) => o === 'W' ? '승' : o === 'D' ? '무' : '패';

  // 케미는 음수가 가능해(같이 뛰면 평소보다 못함) 좌우 다이버징 — 수비 억제 막대와 같은 규약.
  // 스케일은 목록 안 최대 |케미| 기준. 측정 불가(항상 동행)는 막대를 그리지 않는다.
  const maxAbsChem = Math.max(0.001, ...trios
    .filter(t => !t.baselineUnavailable)
    .map(t => Math.abs(t.chemistry)));

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        케미 = 듀오 승률 − 둘의 개인 평균 승률(duo 라운드 제외). 양수일수록 "같이 뛰면 평소보다 잘함" (최소 5경기, TOP 5)
        <br />
        ⚠️ 라운드별 5인 출전이 미입력이라 "같은 팀 로스터" 기준 근사 — 동일 세션 내 실제 함께 뛴 매치 수는 다를 수 있음
      </div>
      {trios.map((t, i) => {
        const key = t.members.join('|');
        const isOpen = expanded === key;
        const chemPct = Math.round(t.chemistry * 100);
        const chemColor = t.baselineUnavailable ? C.gray : t.chemistry > 0 ? "#22c55e" : t.chemistry < 0 ? "#ef4444" : C.gray;
        return (
          <div key={key} style={{ background: C.cardLight, borderRadius: 8, marginBottom: 8 }}>
            <div
              onClick={() => setExpanded(isOpen ? null : key)}
              style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            >
              <div>
                <div style={{ fontSize: 10, color: C.gray, marginBottom: 2 }}>#{i + 1} {isOpen ? '▾' : '▸'}</div>
                <div style={{ fontSize: 13, color: C.white, fontWeight: 700 }}>
                  {t.members.join(" + ")}
                </div>
                <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>
                  {t.baselineUnavailable
                    ? `${t.games}경기 듀오승률 ${Math.round(t.winRate * 100)}% / 단독 출전 표본 없음`
                    : `${t.games}경기 듀오승률 ${Math.round(t.winRate * 100)}% / 개인평균 ${Math.round(t.indivAvg * 100)}%`}
                </div>
                {!t.baselineUnavailable && t.attackLift != null && (
                  <div style={{ fontSize: 10, marginTop: 2, color: t.attackLift > 0 ? '#22c55e' : t.attackLift < 0 ? '#ef4444' : C.gray }}>
                    공격 케미 {t.attackLift >= 0 ? '+' : ''}{t.attackLift.toFixed(2)}골/경기
                    <span style={{ color: C.gray }}> (함께 {t.pairGoalsPerGame.toFixed(2)} vs 개인 {t.indivGoalsPerGame.toFixed(2)})</span>
                  </div>
                )}
              </div>
              {t.baselineUnavailable ? (
                <div style={{ fontSize: 10, fontWeight: 600, color: C.gray, textAlign: 'right' }}>
                  측정 불가<br />(항상 동행)
                </div>
              ) : (
                <div style={{ fontSize: 22, fontWeight: 800, color: chemColor }}>
                  {chemPct > 0 ? '+' : ''}{chemPct}
                </div>
              )}
            </div>
            {!t.baselineUnavailable && (
              <div style={{ display: 'flex', height: 5, margin: '0 12px 8px' }}>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  {t.chemistry < 0 && (
                    <div style={{ width: `${(Math.abs(t.chemistry) / maxAbsChem) * 100}%`, height: '100%', background: '#ef4444', borderRadius: '3px 0 0 3px' }} />
                  )}
                </div>
                <div style={{ width: 1, background: C.grayDark, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  {t.chemistry > 0 && (
                    <div style={{ width: `${(t.chemistry / maxAbsChem) * 100}%`, height: '100%', background: '#22c55e', borderRadius: '0 3px 3px 0' }} />
                  )}
                </div>
              </div>
            )}
            {isOpen && (
              <div style={{ padding: "0 12px 10px", borderTop: `1px dashed ${C.grayDarker}` }}>
                {t.matches
                  .slice()
                  .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.match_id || '').localeCompare(b.match_id || ''))
                  .map((m, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: `1px dashed ${C.grayDarker}22` }}>
                      <span style={{ color: C.gray }}>{m.date} · {m.match_id}</span>
                      <span style={{ color: C.white }}>
                        {m.team || '-'} {m.our}:{m.opp} {m.opponent || '-'}
                        <span style={{ marginLeft: 6, color: outcomeColor(m.outcome), fontWeight: 700 }}>{outcomeLabel(m.outcome)}</span>
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
