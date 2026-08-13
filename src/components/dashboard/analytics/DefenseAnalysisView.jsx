// src/components/dashboard/analytics/DefenseAnalysisView.jsx
// 수비케미(축구 전용): DF 페어 + 개인 억제율. 지표 토글 = 실점률 / 클린시트율.
// 집계 범위 = 수비수 기록(our_defenders_json)이 있는 경기만 — 레거시 구간 자동 제외.
// 토글은 페어·개인을 함께 바꾼다(한 화면 한 기준). 정렬은 sortDefenseRows 단일소스.
import { useMemo, useState } from 'react';
import { calcDefenseAnalysis, sortDefenseRows } from '../../../utils/soccerAnalytics';
import { DEFENSE_METRICS, DEFENSE_METRIC_KEYS } from './defenseMetrics';

const fmt = (v) => (v == null ? '–' : v.toFixed(2));

export default function DefenseAnalysisView({ matchLogs, C }) {
  const d = useMemo(() => calcDefenseAnalysis({ matchLogs: matchLogs || [] }), [matchLogs]);
  const [metric, setMetric] = useState('conceded');
  const M = DEFENSE_METRICS[metric];

  // 같은 집계 결과를 선택된 축으로 다시 세운다 — 재집계 없음
  const view = useMemo(() => ({
    individuals: sortDefenseRows(d.individuals, { metric, dir: 'desc' }),
    best: sortDefenseRows(d.pairs, { metric, dir: 'desc' }),
    worst: sortDefenseRows(d.pairs, { metric, dir: 'asc' }),
  }), [d, metric]);

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
        {M.formatValue(p)} · {M.formatSecondary(p)}
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {DEFENSE_METRIC_KEYS.map(k => (
          <button
            key={k}
            onClick={() => setMetric(k)}
            style={{
              flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              borderRadius: 6, border: `1px solid ${k === metric ? C.accent : C.grayDarker}`,
              background: k === metric ? C.accent + '22' : 'transparent',
              color: k === metric ? C.accent : C.gray,
            }}
          >
            {DEFENSE_METRICS[k].label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        수비수 기록 {d.scopeMatches}경기 · 팀 평균 {fmt(d.teamConcededPerGame)}실점 · 클린시트 {Math.round(d.teamCleanRate * 100)}%
        <br />⚠️ 페어·억제율 모두 상대팀·GK 영향이 섞인 참고 지표
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>BEST 페어 (억제순)</div>
          {view.best.length === 0 ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족 (페어당 5경기 이상 필요)</div>
          ) : view.best.slice(0, 5).map(p => <PairRow key={`${p.a}|${p.b}`} p={p} sign="best" />)}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 4 }}>WORST</div>
          {view.worst.length === 0 ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
          ) : view.worst.slice(0, 5).map(p => <PairRow key={`${p.a}|${p.b}`} p={p} sign="worst" />)}
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.white, fontWeight: 700, marginBottom: 2 }}>개인 {M.label} 억제</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>
        {M.caption} · 8경기 이상
      </div>
      {view.individuals.length === 0 ? (
        <div style={{ fontSize: 11, color: C.gray }}>표본 부족 (8경기 이상 필요)</div>
      ) : (() => {
        // 다이버징 막대 스케일 — 최대 |Δ| 기준 좌우 대칭 (극성은 색+방향+부호 삼중 인코딩)
        const deltas = view.individuals.map(x => M.deltaOf(x)).filter(v => v != null);
        const maxAbs = Math.max(0.001, ...deltas.map(Math.abs));
        return view.individuals.map(x => {
          const delta = M.deltaOf(x);
          return (
            <div key={x.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
              <span style={{ width: 88, flexShrink: 0, fontSize: 11, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {x.name} <span style={{ color: C.gray, fontSize: 9 }}>{x.games}G</span>
              </span>
              <div style={{ flex: 1, display: 'flex', height: 8 }}>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  {delta != null && delta < 0 && (
                    <div style={{ width: `${(Math.abs(delta) / maxAbs) * 100}%`, height: '100%', background: C.red, borderRadius: '3px 0 0 3px' }} />
                  )}
                </div>
                <div style={{ width: 1, background: C.grayDark, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  {delta != null && delta >= 0 && (
                    <div style={{ width: `${(delta / maxAbs) * 100}%`, height: '100%', background: C.green, borderRadius: '0 3px 3px 0' }} />
                  )}
                </div>
              </div>
              <span style={{ width: 50, flexShrink: 0, textAlign: 'right', fontSize: 11, color: delta == null ? C.gray : C.white, fontVariantNumeric: 'tabular-nums' }}>
                {M.formatDelta(delta)}
              </span>
            </div>
          );
        });
      })()}
    </div>
  );
}
