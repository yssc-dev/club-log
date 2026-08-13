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
        수비수 기록 {d.scopeMatches}경기 · 팀 평균 {fmt(d.teamConcededPerGame)}실점
        <br />⚠️ 페어·억제율 모두 상대팀·GK 영향이 섞인 참고 지표
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>BEST 페어 (억제순)</div>
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
        Δ = 부재 − 출전 실점차 · +면 억제 · 8경기 이상
      </div>
      {d.individuals.length === 0 ? (
        <div style={{ fontSize: 11, color: C.gray }}>표본 부족 (8경기 이상 필요)</div>
      ) : (() => {
        // 다이버징 막대 스케일 — 최대 |Δ| 기준 좌우 대칭 (극성은 색+방향+부호 삼중 인코딩)
        const maxAbs = Math.max(0.1, ...d.individuals.filter(x => x.delta != null).map(x => Math.abs(x.delta)));
        return d.individuals.map(x => (
          <div key={x.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
            <span style={{ width: 88, flexShrink: 0, fontSize: 11, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {x.name} <span style={{ color: C.gray, fontSize: 9 }}>{x.games}G</span>
            </span>
            <div style={{ flex: 1, display: 'flex', height: 8 }}>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                {x.delta != null && x.delta < 0 && (
                  <div style={{ width: `${(Math.abs(x.delta) / maxAbs) * 100}%`, height: '100%', background: C.red, borderRadius: '3px 0 0 3px' }} />
                )}
              </div>
              <div style={{ width: 1, background: C.grayDark, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                {x.delta != null && x.delta >= 0 && (
                  <div style={{ width: `${(x.delta / maxAbs) * 100}%`, height: '100%', background: C.green, borderRadius: '0 3px 3px 0' }} />
                )}
              </div>
            </div>
            <span style={{ width: 44, flexShrink: 0, textAlign: 'right', fontSize: 11, color: x.delta == null ? C.gray : C.white, fontVariantNumeric: 'tabular-nums' }}>
              {x.delta == null ? '–' : (x.delta >= 0 ? '+' : '') + x.delta.toFixed(2)}
            </span>
          </div>
        ));
      })()}
    </div>
  );
}
