// 수비 지표 토글의 표시 규약 — 실점률 / 클린시트율.
// 두 지표는 같은 calcDefenseAnalysis 결과 행을 서로 다른 축으로 읽을 뿐이라,
// 정렬 축(key)·주값·부값·Δ 포맷만 다른 서술자로 분리했다. 컴포넌트는 분기 대신 이걸 고른다.
//   - key        : sortDefenseRows({ metric })에 그대로 넘기는 값
//   - formatValue: 대시보드 카드에 찍히는 생값 (Δ가 아님 — 캡션 없이도 읽히도록)
//   - deltaOf/formatDelta : 분석 탭 다이버징 막대용 부재 대비 Δ
// 두 Δ는 부호 방향이 같다(+면 억제). 실점률은 낮을수록 좋아 베이스라인−출전,
// 클린시트율은 높을수록 좋아 출전−베이스라인으로 calcDefenseAnalysis가 맞춰 놓았다.

const signed = (s, v) => (v >= 0 ? '+' : '') + s;

export const DEFENSE_METRICS = {
  conceded: {
    key: 'conceded',
    label: '실점률',
    formatValue: (r) => `${r.concededPerGame.toFixed(2)}실점`,
    formatSecondary: (r) => `CS ${r.cleanSheets}/${r.games}`,
    deltaOf: (r) => r.delta,
    formatDelta: (d) => (d == null ? '–' : signed(d.toFixed(2), d)),
    caption: 'Δ = 부재 − 출전 실점차 · +면 억제',
  },
  clean: {
    key: 'clean',
    label: '클린시트율',
    formatValue: (r) => `${Math.round(r.cleanRate * 100)}%`,
    formatSecondary: (r) => `${r.concededPerGame.toFixed(2)}실점`,
    deltaOf: (r) => r.cleanDelta,
    formatDelta: (d) => (d == null ? '–' : signed(`${Math.round(d * 100)}%p`, d)),
    caption: 'Δ = 출전 − 부재 클린시트율차 · +면 억제',
  },
};

export const DEFENSE_METRIC_KEYS = ['conceded', 'clean'];
