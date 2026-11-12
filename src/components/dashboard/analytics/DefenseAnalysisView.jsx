// src/components/dashboard/analytics/DefenseAnalysisView.jsx
// 수비케미(축구 전용). 토글 두 축:
//   조합 [2인 | 3인]        — 조합 섹션에만 적용
//   지표 [실점률 | 클린시트율] — 화면 전체(조합 + 개인 억제) 적용
// 집계 범위 = 수비수 기록(our_defenders_json)이 있는 경기만 — 레거시 구간 자동 제외.
//
// 조합 목록은 '생값으로 표시하고 생값으로 정렬'한다. Δ로 세우면 표본이 큰 조합의
// 베이스라인이 팀 평균과 크게 달라져, 화면의 숫자가 정렬을 거스르는 역전이 보인다
// (예: 1.37실점 19경기가 1.40실점 5경기보다 위). 그날 평균 대비 Δ는 아래 개인 섹션이 담당.
import { useMemo, useState } from 'react';
import { calcDefenseAnalysis, sortDefenseRows } from '../../../utils/soccerAnalytics';
import RankBarList from './RankBarList';
import { DEFENSE_METRICS, DEFENSE_METRIC_KEYS } from './defenseMetrics';

const fmt = (v) => (v == null ? '–' : v.toFixed(2));

// 진입선은 calcDefenseAnalysis.minDates(경기일 수, 최다의 30%)에서 온다 — 여기 숫자를 박지 않는다.
const COMBO_SIZES = [
  { key: 'pair', label: '2인', rowsKey: 'pairs', noun: '페어' },
  { key: 'trio', label: '3인', rowsKey: 'trios', noun: '트리오' },
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
          ⚠ 3인 조합은 표본이 적어 참고용입니다. 함께 선 경기일 {d.minDates?.trio ?? 0}일 이상 + 3경기 이상만 표시합니다.
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
            emptyText={`표본 부족 (${spec.noun}당 함께 선 경기일 ${d.minDates?.[size] ?? 0}일 이상 필요)`}
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
    () => sortDefenseRows(d.individuals, { metric, by: 'raw', dir: 'desc' }),
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
        수비수 기록 {d.scopeMatches}경기({d.scopeDates}일) · 진입선 = 수비수로 선 경기일 최다의 30%(개인 {d.minDates.individual}일 · 2인 {d.minDates.pair}일 · 3인 {d.minDates.trio}일)
        <br />팀 평균 {fmt(d.teamConcededPerGame)}실점 · 클린시트 {Math.round(d.teamCleanRate * 100)}%
        <br />⚠️ 조합 목록은 생값 · 개인은 그날 평균 대비(상대·GK 미보정)
      </div>

      <DefenseComboSection d={d} metric={metric} size={size} C={C} />

      {/* 개인 순위(2026-11-12 유저 결정): 수비수로 선 경기의 생값 — 실점률=총실점÷경기(낮은 순), 클린시트율=무실점 경기÷경기.
          진입선 = 가장 많이 뛴 수비수 경기 수의 30%. 보정값(그날 평균 대비)은 직관적이지 않아 화면에서 뺐다. */}
      <div style={{ fontSize: 11, color: C.white, fontWeight: 700, marginBottom: 2 }}>개인 {M.label} ({M.bestLabel})</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>
        수비수로 선 경기만 · 최다 출전 수비수({d.maxIndividualGames}경기)의 30%({d.individualMinGames}경기) 이상
      </div>
      <RankBarList
        rows={individuals.map(x => ({ name: x.name, value: M.rawOf(x), formatted: M.formatValue(x), sub: `${x.games}경기 ${x.conceded}실점 · 무실점 ${x.cleanSheets}` }))}
        formatValue={(v, r) => r.formatted} lowerIsBetter={metric === 'conceded'} color={C.green} C={C}
        limit={individuals.length} nameWidth={44} subWidth={110}
        emptyText={`표본 부족 (수비수 ${d.individualMinGames}경기 이상 필요)`}
      />
    </div>
  );
}
