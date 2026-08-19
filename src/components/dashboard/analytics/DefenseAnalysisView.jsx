// src/components/dashboard/analytics/DefenseAnalysisView.jsx
// 수비케미(축구 전용). 토글 두 축:
//   조합 [2인 | 3인]        — 조합 섹션에만 적용
//   지표 [실점률 | 클린시트율] — 화면 전체(조합 + 개인 억제) 적용
// 집계 범위 = 수비수 기록(our_defenders_json)이 있는 경기만 — 레거시 구간 자동 제외.
//
// 조합 목록은 '생값으로 표시하고 생값으로 정렬'한다. Δ로 세우면 표본이 큰 조합의
// 베이스라인이 팀 평균과 크게 달라져, 화면의 숫자가 정렬을 거스르는 역전이 보인다
// (예: 1.37실점 19경기가 1.40실점 5경기보다 위). 부재 대비 Δ는 아래 개인 섹션이 담당.
import { useMemo, useState } from 'react';
import { calcDefenseAnalysis, sortDefenseRows } from '../../../utils/soccerAnalytics';
import RankBarList from './RankBarList';
import { DEFENSE_METRICS, DEFENSE_METRIC_KEYS } from './defenseMetrics';

const fmt = (v) => (v == null ? '–' : v.toFixed(2));

const COMBO_SIZES = [
  { key: 'pair', label: '2인', rowsKey: 'pairs', minGames: 5, noun: '페어' },
  { key: 'trio', label: '3인', rowsKey: 'trios', minGames: 3, noun: '트리오' },
];

function ToggleRow({ options, value, onChange, C }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            borderRadius: 6, border: `1px solid ${o.key === value ? C.accent : C.grayDarker}`,
            background: o.key === value ? C.accent + '22' : 'transparent',
            color: o.key === value ? C.accent : C.gray,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DefenseComboSection({ d, metric, size, C }) {
  const M = DEFENSE_METRICS[metric];
  const spec = COMBO_SIZES.find(s => s.key === size) || COMBO_SIZES[0];
  const rows = d[spec.rowsKey] || [];

  // 표시값과 같은 축(생값)으로 세운다 — dir:'desc'가 BEST, 지표 극성은 sortDefenseRows가 흡수
  const best = sortDefenseRows(rows, { metric, by: 'raw', dir: 'desc' }).slice(0, 5);
  const worst = sortDefenseRows(rows, { metric, by: 'raw', dir: 'asc' }).slice(0, 5);

  // 실점률은 낮을수록 좋고 클린시트율은 높을수록 좋다 — 막대 극성을 지표에 맞춘다
  const lowerIsBetter = metric === 'conceded';
  const toRows = (list) => list.map(r => ({
    name: r.members.join('·'), value: M.rawOf(r), sub: `${r.games}경기`, formatted: M.formatValue(r),
  }));
  // BEST/WORST가 나란히 놓이므로 척도를 공유한다 — 각자 극값을 쓰면 두 열의
  // 같은 길이가 서로 다른 값을 뜻해 비교가 성립하지 않는다.
  const allValues = [...toRows(best), ...toRows(worst)].map(r => r.value);
  const scaleRef = allValues.length === 0 ? undefined
    : (lowerIsBetter ? Math.min(...allValues) : Math.max(...allValues));

  return (
    <div style={{ marginBottom: 18 }}>
      {size === 'trio' && (
        <div style={{ fontSize: 10, color: C.orange, marginBottom: 6, lineHeight: 1.5 }}>
          ⚠ 3인 조합은 표본이 적어 참고용입니다. 3경기 이상 함께 선 조합만 표시하며,
          같은 날 연속 경기가 섞여 있어 실제 표본은 경기 수보다 적습니다.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>
            BEST {spec.noun} ({M.bestLabel})
          </div>
          <RankBarList
            rows={toRows(best)} formatValue={(v, r) => r.formatted}
            lowerIsBetter={lowerIsBetter} scaleRef={scaleRef} color={C.green} C={C} nameWidth={80}
            emptyText={`표본 부족 (${spec.noun}당 ${spec.minGames}경기 이상 필요)`}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 4 }}>WORST</div>
          {/* 하위 목록이라 순위 번호는 '잘한 순'으로 오독된다 */}
          <RankBarList
            rows={toRows(worst)} formatValue={(v, r) => r.formatted}
            lowerIsBetter={lowerIsBetter} scaleRef={scaleRef} color={C.red} C={C} nameWidth={80} showRank={false}
            emptyText="표본 부족"
          />
        </div>
      </div>
    </div>
  );
}

export default function DefenseAnalysisView({ matchLogs, C }) {
  const d = useMemo(() => calcDefenseAnalysis({ matchLogs: matchLogs || [] }), [matchLogs]);
  const [size, setSize] = useState('pair');
  const [metric, setMetric] = useState('conceded');
  const M = DEFENSE_METRICS[metric];

  const individuals = useMemo(
    () => sortDefenseRows(d.individuals, { metric, dir: 'desc' }),
    [d, metric],
  );

  if (d.scopeMatches === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 30, color: C.gray, fontSize: 12 }}>
        수비수 기록이 있는 경기가 없습니다
      </div>
    );
  }

  return (
    <div>
      <ToggleRow options={COMBO_SIZES} value={size} onChange={setSize} C={C} />
      <ToggleRow options={DEFENSE_METRIC_KEYS.map(k => ({ key: k, label: DEFENSE_METRICS[k].label }))}
        value={metric} onChange={setMetric} C={C} />

      <div style={{ fontSize: 11, color: C.gray, margin: '4px 0 10px', lineHeight: 1.5 }}>
        수비수 기록 {d.scopeMatches}경기 · 팀 평균 {fmt(d.teamConcededPerGame)}실점 · 클린시트 {Math.round(d.teamCleanRate * 100)}%
        {(() => {
          // 상대별 팀 기준선 — 개인 Δ가 이 기준으로 보정된다는 걸 화면에서 보이게 한다.
          // 5경기 미만 상대는 기준선 자체가 소음이라 표기에서 뺀다(보정 계산에는 들어감).
          const majors = (d.opponents || []).filter(o => o.opponent && o.games >= 5);
          if (majors.length === 0) return null;
          const val = (o) => metric === 'clean'
            ? `${Math.round(o.cleanRate * 100)}%` : o.concededPerGame.toFixed(2);
          return (
            <><br />상대별 팀 {metric === 'clean' ? '무실점률' : '실점'}: {majors.map(o => `${o.opponent} ${val(o)}`).join(' · ')}</>
          );
        })()}
        <br />⚠️ 조합은 상대팀·GK 영향 미보정 · 개인 Δ는 같은 상대 기준 보정(GK는 미보정)
      </div>

      <DefenseComboSection d={d} metric={metric} size={size} C={C} />

      <div style={{ fontSize: 11, color: C.white, fontWeight: 700, marginBottom: 2 }}>개인 {M.label} 억제</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>
        {M.caption} · 8경기 이상
      </div>
      {individuals.length === 0 ? (
        <div style={{ fontSize: 11, color: C.gray }}>표본 부족 (8경기 이상 필요)</div>
      ) : (() => {
        // 다이버징 막대 스케일 — 최대 |Δ| 기준 좌우 대칭 (극성은 색+방향+부호 삼중 인코딩)
        const deltas = individuals.map(x => M.deltaOf(x)).filter(v => v != null);
        const maxAbs = Math.max(0.001, ...deltas.map(Math.abs));
        return individuals.map(x => {
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
