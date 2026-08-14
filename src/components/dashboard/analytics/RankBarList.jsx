// src/components/dashboard/analytics/RankBarList.jsx
// 순위 막대 목록 공용 컴포넌트 — 어워드/크로바·고구마/지표 Top5가 공유한다.
// 행 = 순위 · 이름 · 막대 · 값 (+ 부가정보).
//
// 어워드 탭에 Card / RankingCol / MetricBarCol 세 가지 행 스타일이 따로 있던 것을 하나로 접었다.
// 순위 번호를 남긴 이유: 이 목록들은 공동 순위가 실제로 생기고(해트트릭 2회 동률 등),
// 번호가 없으면 목록 순서만으로는 동률이 보이지 않는다.
//
// rows는 이미 순위순으로 정렬돼 있어야 한다(계산층 buildRankedTop/calcMetricLeaders가 보장).
// row.rank가 있으면 그대로 쓰고(공동 순위 유지), 없으면 순서대로 매긴다.

// 막대 길이 비율. lowerIsBetter(실점률·편차)는 1위(최소값) 대비 역수라 1위가 항상 최장이다.
export function barRatio(value, best, lowerIsBetter) {
  if (lowerIsBetter) return value <= 0 ? 1 : Math.min(1, best / value);
  if (best <= 0) return 0;
  return Math.max(0, Math.min(1, value / best));
}

const nameOf = (r) => r.player ?? r.name ?? '';

export default function RankBarList({
  rows, formatValue, C,
  lowerIsBetter = false, color, limit = 5, emptyText = '표본 부족', showRank = true, nameWidth = 40,
}) {
  const list = (rows || []).slice(0, limit);
  if (list.length === 0) {
    return <div style={{ fontSize: 10.5, color: C.grayDark }}>{emptyText}</div>;
  }
  // 기준값은 실제 극값에서 뽑는다 — WORST 목록은 첫 행이 최댓값이 아니라
  // rows[0]을 기준 삼으면 나머지가 전부 100%로 잘린다.
  const values = list.map(r => r.value);
  const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
  const barColor = color || C.accent;

  return (
    <>
      {list.map((r, i) => (
        <div key={nameOf(r)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', fontSize: 10 }}>
          {showRank && (
            <span style={{ width: 22, flexShrink: 0, textAlign: 'right', color: C.grayDark }}>
              {r.rank ?? i + 1}위
            </span>
          )}
          <span style={{ width: nameWidth, flexShrink: 0, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nameOf(r)}
          </span>
          <div style={{ flex: 1, minWidth: 8, height: 6 }}>
            <div style={{
              width: `${barRatio(r.value, best, lowerIsBetter) * 100}%`,
              height: '100%', borderRadius: 3, background: barColor, opacity: 0.75,
            }} />
          </div>
          <span style={{ flexShrink: 0, color: barColor, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatValue(r.value, r)}
          </span>
          {r.sub && (
            <span style={{ width: 40, flexShrink: 0, textAlign: 'right', fontSize: 9, color: C.grayDark, whiteSpace: 'nowrap' }}>
              {r.sub}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
