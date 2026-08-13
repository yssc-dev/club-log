// src/components/dashboard/analytics/DefenseAnalysisView.jsx
// 수비케미(축구 전용): DF 페어 실점 케미 + 개인 실점억제율.
// 집계 범위 = 수비수 기록(our_defenders_json)이 있는 경기만 — 레거시 구간 자동 제외.
import { useMemo } from 'react';
import { calcDefenseAnalysis } from '../../../utils/soccerAnalytics';

const fmt = (v) => (v == null ? '–' : v.toFixed(2));

export default function DefenseAnalysisView({ matchLogs, C }) {
  const d = useMemo(() => calcDefenseAnalysis({ matchLogs: matchLogs || [] }), [matchLogs]);

  if (d.scopeMatches === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 30, color: C.gray, fontSize: 12 }}>
        수비수 기록이 있는 경기가 없습니다
      </div>
    );
  }

  const PairRow = ({ p, sign }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 12 }}>
      <span style={{ color: C.gray }}>{p.a}·{p.b} <span style={{ fontSize: 10 }}>({p.games})</span></span>
      <span style={{ color: sign === 'best' ? C.green : C.red, fontWeight: 600 }}>
        {fmt(p.concededPerGame)}실점 · CS {p.cleanSheets}/{p.games}
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        수비수 기록이 있는 {d.scopeMatches}경기 기준 · 팀 평균 경기당 {fmt(d.teamConcededPerGame)}실점.
        <br />⚠️ GK·상대 강도 미보정 — 실점은 수비수 단독 지표가 아님.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>BEST 페어 (억제 Δ)</div>
          {d.pairs.length === 0 ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족 (페어당 5경기 이상 필요)</div>
          ) : d.pairs.slice(0, 5).map(p => <PairRow key={`${p.a}|${p.b}`} p={p} sign="best" />)}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 4 }}>WORST</div>
          {d.worstPairs.length === 0 ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
          ) : d.worstPairs.slice(0, 5).map(p => <PairRow key={`${p.a}|${p.b}`} p={p} sign="worst" />)}
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.white, fontWeight: 700, marginBottom: 2 }}>개인 실점억제율</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>
        Δ = 부재 시 경기당 실점 − 출전 시 경기당 실점 (양수=억제) · 8경기 이상
      </div>
      {d.individuals.length === 0 ? (
        <div style={{ fontSize: 11, color: C.gray }}>표본 부족 (8경기 이상 필요)</div>
      ) : d.individuals.map(x => (
        <div key={x.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 12 }}>
          <span style={{ color: C.white }}>
            {x.name} <span style={{ color: C.gray, fontSize: 10 }}>({x.games}경기 · CS {x.cleanSheets})</span>
          </span>
          <span style={{ color: C.gray, fontVariantNumeric: 'tabular-nums' }}>
            출전 {fmt(x.concededPerGame)} / 부재 {fmt(x.baselineConcededPerGame)} ·{' '}
            <span style={{ color: x.delta == null ? C.gray : x.delta >= 0 ? C.green : C.red, fontWeight: 700 }}>
              Δ{x.delta == null ? '–' : (x.delta >= 0 ? '+' : '') + x.delta.toFixed(2)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
