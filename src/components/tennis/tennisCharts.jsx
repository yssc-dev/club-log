// 테니스 분석 SVG 차트 컴포넌트 모음.
// 외부 라이브러리 없음. C 토큰으로 테마 반응형. MonthlyFormSection 스타일 준용.
// — HBarChart: 가로 바 (상대 전적·파트너별 공용)
// — PlayerRadarChart: 5축 정오각형 레이더 (개인 프로필)

// ── HBarChart ───────────────────────────────────────────────
// rows: [{ label, value(0~1), note }]  colorFor(row) → CSS 색
// 빈 rows → "데이터 없음" 카드
export function HBarChart({ rows, ds, C, colorFor }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>
        데이터 없음
      </div>
    );
  }

  const getColor = colorFor || (() => C.accent);
  const rowH = 30;
  const padT = 6;
  const padB = 6;
  // 레이아웃 — 라벨(0~70), 바(74~224), 노트(228~)
  const labW = 70;
  const barX = 74;
  const barW = 148;
  const noteX = 228;
  const vW = 300;
  const vH = padT + rows.length * rowH + padB;

  return (
    <div style={ds.card}>
      <svg
        viewBox={`0 0 ${vW} ${vH}`}
        style={{ width: '100%', display: 'block' }}
        role="img"
        aria-label="가로 바 차트"
      >
        {rows.map((row, i) => {
          const y = padT + i * rowH;
          const midY = y + rowH / 2;
          const fill = Math.max(0, Math.min(1, row.value || 0));

          return (
            <g key={`hbar-${i}`}>
              {/* 라벨 */}
              <text
                x={labW}
                y={midY + 4}
                textAnchor="end"
                fontSize={10}
                fill={C.gray}
              >
                {row.label}
              </text>
              {/* 트랙 (배경) */}
              <rect
                x={barX}
                y={midY - 7}
                width={barW}
                height={14}
                rx={7}
                fill={C.grayDarker}
                fillOpacity={0.55}
              />
              {/* 채우기 */}
              {fill > 0 && (
                <rect
                  x={barX}
                  y={midY - 7}
                  width={fill * barW}
                  height={14}
                  rx={7}
                  fill={getColor(row)}
                />
              )}
              {/* 노트 (우측 값 라벨) */}
              <text
                x={noteX}
                y={midY + 4}
                textAnchor="start"
                fontSize={10}
                fill={C.gray}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {row.note || ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── PlayerRadarChart ─────────────────────────────────────────
// radar: buildPlayerRadar 반환값 { axes:[{key,label,value,raw}], player }
// 정오각형 + 0.5·1.0 그리드링 + 선수 폴리곤(C.accent) + 꼭짓점 라벨+raw
// 전 값 0이어도 크래시 없음. role="img" aria-label.
export function PlayerRadarChart({ radar, ds, C }) {
  if (!radar || !radar.axes || !radar.axes.length) {
    return (
      <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>
        데이터 없음
      </div>
    );
  }

  const { axes, player } = radar;
  const n = axes.length;          // 5
  const vW = 220;
  const vH = 220;
  const cx = 110;
  const cy = 115;                 // 아래쪽 여백 확보 (아래 꼭짓점 라벨)
  const r = 68;                   // 외부 링 반지름
  const rLab = 83;                // 축 라벨 기준점 반지름

  // i번째 축 각도: -π/2 에서 시작해 시계 방향 (SVG 좌표계)
  const angleOf = (i) => -Math.PI / 2 + i * (2 * Math.PI / n);

  // 반지름 scale로 정오각형 꼭짓점 배열
  const polyPts = (scale) =>
    Array.from({ length: n }, (_, i) => {
      const a = angleOf(i);
      return [cx + r * scale * Math.cos(a), cy + r * scale * Math.sin(a)];
    });

  // [x,y] 배열 → SVG polygon points 문자열
  const toAttr = (pts) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  const outerPts = polyPts(1);
  const halfPts = polyPts(0.5);

  const allZero = axes.every(ax => (ax.value || 0) === 0);
  const dataPts = axes.map((ax, i) => {
    const a = angleOf(i);
    const v = allZero ? 0 : Math.max(0, Math.min(1, ax.value || 0));
    return [cx + r * v * Math.cos(a), cy + r * v * Math.sin(a)];
  });

  return (
    <div style={ds.card}>
      <svg
        viewBox={`0 0 ${vW} ${vH}`}
        style={{ width: '100%', display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={`${player || '선수'} 개인 프로필 레이더 차트`}
      >
        {/* 그리드 링: 1.0 (외부) */}
        <polygon
          points={toAttr(outerPts)}
          fill="none"
          stroke={C.grayDarker}
          strokeWidth={0.75}
        />
        {/* 그리드 링: 0.5 (내부, 점선) */}
        <polygon
          points={toAttr(halfPts)}
          fill="none"
          stroke={C.grayDarker}
          strokeWidth={0.5}
          strokeDasharray="3 2"
        />

        {/* 축 스포크 (중심 → 꼭짓점) */}
        {outerPts.map(([x, y], i) => (
          <line
            key={`spoke-${i}`}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke={C.grayDarker}
            strokeWidth={0.5}
          />
        ))}

        {/* 선수 데이터 폴리곤 */}
        {!allZero && (
          <polygon
            points={toAttr(dataPts)}
            fill={C.accent}
            fillOpacity={0.15}
            stroke={C.accent}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}

        {/* 선수 데이터 꼭짓점 점 */}
        {!allZero && dataPts.map(([x, y], i) => (
          <circle
            key={`dot-${i}`}
            cx={x}
            cy={y}
            r={3.5}
            fill={C.accent}
            stroke={C.card}
            strokeWidth={1.5}
          />
        ))}

        {/* 축 라벨 + raw 값 */}
        {axes.map((ax, i) => {
          const a = angleOf(i);
          const cosA = Math.cos(a);
          const sinA = Math.sin(a);
          const lx = cx + rLab * cosA;
          const ly = cy + rLab * sinA;

          // 텍스트 앵커: 오른쪽=start, 왼쪽=end, 위/아래=middle
          const textAnchor = cosA > 0.25 ? 'start' : cosA < -0.25 ? 'end' : 'middle';

          // 세로 시작 오프셋: 위쪽 꼭짓점(sinA < -0.4)은 위로 올려서 label→raw 순으로
          // 아래/측면은 label이 먼저, raw가 아래
          const isUpper = sinA < -0.4;
          const dy1 = isUpper ? '-0.9em' : '0.1em';

          return (
            <text key={ax.key} textAnchor={textAnchor}>
              <tspan x={lx} y={ly} dy={dy1} fontSize={8} fill={C.gray}>
                {ax.label}
              </tspan>
              <tspan x={lx} dy="1.15em" fontSize={8.5} fontWeight="600" fill={C.white}>
                {ax.raw}
              </tspan>
            </text>
          );
        })}

        {/* 중심 점 */}
        <circle cx={cx} cy={cy} r={2.5} fill={C.grayDarker} />
      </svg>
    </div>
  );
}
