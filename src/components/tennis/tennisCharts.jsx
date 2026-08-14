// 테니스 분석 SVG 차트 컴포넌트 모음.
// 외부 라이브러리 없음. C 토큰으로 테마 반응형. MonthlyFormSection 스타일 준용.
// — HBarChart: 가로 바 (상대 전적·파트너별 공용)
// — PlayerRadarChart: 5축 정오각형 레이더 (개인 프로필)
// — LeagueDonut: 경기 유형 도넛 (리그 탭)
// — YearlyBarChart: 연도별 승률 세로 바 (개인 뷰)
// — AceDfScatter: 에이스·DF 산점도 (전체 뷰)
// — RateBar: 순위표 승률 칸 배경 미니바 (인라인)

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

// ── LeagueDonut ──────────────────────────────────────────────
// counts: buildLeagueCounts 반환 { tumong, guillotine, exhibition, total }
// 3세그먼트 도넛(투몽=accent·길로틴=purple·번외=grayDark) + 중앙 전체 수 + 범례.
// total 0이면 null (호출부가 숨김 판단). role="img".
export function LeagueDonut({ counts, ds, C }) {
  const { tumong = 0, guillotine = 0, exhibition = 0, total = 0 } = counts || {};
  if (!total) return null;

  const segs = [
    { label: '투몽', value: tumong, color: C.accent },
    { label: '길로틴', value: guillotine, color: C.purple },
    { label: '번외', value: exhibition, color: C.grayDark },
  ].filter(s => s.value > 0);

  const cx = 55, cy = 55, r = 42, sw = 15;
  const circ = 2 * Math.PI * r;
  let acc = 0; // 누적 길이(오프셋)

  return (
    <div style={ds.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <svg
          viewBox="0 0 110 110"
          width={110}
          style={{ flexShrink: 0, display: 'block' }}
          role="img"
          aria-label={`경기 유형 분포 — 전체 ${total}`}
        >
          {/* 트랙 */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.grayDarker} strokeWidth={sw} fillOpacity={0} />
          {/* 세그먼트 (12시 방향 시작: -90도 회전) */}
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {segs.map((s) => {
              const dash = (s.value / total) * circ;
              const el = (
                <circle
                  key={s.label}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={sw}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-acc}
                />
              );
              acc += dash;
              return el;
            })}
          </g>
          {/* 중앙 전체 수 */}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={22} fontWeight="700" fill={C.white}
            style={{ fontVariantNumeric: 'tabular-nums' }}>{total}</text>
          <text x={cx} y={cy + 13} textAnchor="middle" fontSize={9} fill={C.gray}>경기</text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12, minWidth: 0 }}>
          {segs.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ color: C.white }}>{s.label}</span>
              <span style={{ marginLeft: 'auto', color: C.gray, fontVariantNumeric: 'tabular-nums' }}>
                {s.value} ({Math.round((s.value / total) * 100)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── YearlyBarChart ───────────────────────────────────────────
// entries: buildYearlyRecords 반환 [{ season, wins, losses, rate(0~1) }], 마지막='통산'
// 세로 바(승률) + 바 위 전적 라벨 + 축에 시즌. '통산'은 purple로 구분. 빈 배열이면 null.
export function YearlyBarChart({ entries, ds, C }) {
  if (!entries || !entries.length) return null;

  const n = entries.length;
  const colW = 46;
  const plotH = 88;
  const padT = 18;   // 바 위 전적 라벨
  const padB = 30;   // 시즌 + 승률 라벨
  const vW = n * colW;
  const vH = padT + plotH + padB;
  const baseY = padT + plotH;
  const barW = 24;

  return (
    <div style={ds.card}>
      <svg
        viewBox={`0 0 ${vW} ${vH}`}
        style={{ width: '100%', display: 'block' }}
        role="img"
        aria-label="연도별 승률 세로 바 차트"
      >
        {/* 기준선 */}
        <line x1={0} y1={baseY} x2={vW} y2={baseY} stroke={C.grayDarker} strokeWidth={0.75} />
        {entries.map((e, i) => {
          const cx = i * colW + colW / 2;
          const v = Math.max(0, Math.min(1, e.rate || 0));
          const barH = v * plotH;
          const barY = baseY - barH;
          const isTotal = e.season === '통산';
          const color = isTotal ? C.purple : C.accent;
          return (
            <g key={e.season}>
              {/* 바 */}
              {barH > 0 && (
                <rect x={cx - barW / 2} y={barY} width={barW} height={barH} rx={3} fill={color} />
              )}
              {/* 전적 라벨 (바 위) */}
              <text x={cx} y={barY - 4} textAnchor="middle" fontSize={9} fill={C.gray}
                style={{ fontVariantNumeric: 'tabular-nums' }}>{e.wins}-{e.losses}</text>
              {/* 시즌 라벨 */}
              <text x={cx} y={baseY + 13} textAnchor="middle" fontSize={9.5}
                fontWeight={isTotal ? '700' : '400'} fill={isTotal ? C.white : C.gray}>{e.season}</text>
              {/* 승률 라벨 */}
              <text x={cx} y={baseY + 24} textAnchor="middle" fontSize={9} fill={C.gray}
                style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(v * 100)}%</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── AceDfScatter ─────────────────────────────────────────────
// rows: buildAceDfRanking 반환 [{ name, aces, doubleFaults, recordedGames }]
// x=에이스, y=DF, 점=선수(이름 라벨). 대각선(에이스=DF) 안내선 — 우하=좋은 서버.
// x·y 공유 스케일(대각선이 45°가 되도록). 빈 배열이면 null.
export function AceDfScatter({ rows, ds, C }) {
  if (!rows || !rows.length) return null;

  const maxAxis = Math.max(1, ...rows.map(r => Math.max(r.aces || 0, r.doubleFaults || 0)));
  const padL = 32, padT = 10, padB = 26, padR = 12;
  const plot = 150;
  const vW = padL + plot + padR;
  const vH = padT + plot + padB;
  const sx = v => padL + (v / maxAxis) * plot;
  const sy = v => padT + plot - (v / maxAxis) * plot;

  return (
    <div style={ds.card}>
      <svg
        viewBox={`0 0 ${vW} ${vH}`}
        style={{ width: '100%', display: 'block', overflow: 'visible' }}
        role="img"
        aria-label="에이스·더블폴트 산점도"
      >
        {/* 대각선 안내선 (에이스=DF) */}
        <line x1={sx(0)} y1={sy(0)} x2={sx(maxAxis)} y2={sy(maxAxis)}
          stroke={C.grayDark} strokeWidth={0.75} strokeDasharray="4 3" />
        {/* 축 */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + plot} stroke={C.grayDarker} strokeWidth={0.75} />
        <line x1={padL} y1={padT + plot} x2={padL + plot} y2={padT + plot} stroke={C.grayDarker} strokeWidth={0.75} />
        {/* 축 라벨 */}
        <text x={padL + plot} y={padT + plot + 16} textAnchor="end" fontSize={8.5} fill={C.gray}>에이스 →</text>
        <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize={8.5} fill={C.gray}>DF ↑</text>
        {/* 최댓값 눈금 */}
        <text x={padL - 4} y={sy(maxAxis) + 3} textAnchor="end" fontSize={8} fill={C.gray}
          style={{ fontVariantNumeric: 'tabular-nums' }}>{maxAxis}</text>
        <text x={sx(maxAxis)} y={padT + plot + 16} textAnchor="middle" fontSize={8} fill={C.gray}
          style={{ fontVariantNumeric: 'tabular-nums' }}>{maxAxis}</text>
        {/* 점 + 이름 */}
        {rows.map((r) => {
          const x = sx(r.aces || 0);
          const y = sy(r.doubleFaults || 0);
          const rad = 3.5 + Math.min(r.recordedGames || 0, 10) * 0.2;
          return (
            <g key={r.name}>
              <circle cx={x} cy={y} r={rad} fill={C.accent} fillOpacity={0.85}
                stroke={C.card} strokeWidth={1} />
              <text x={x + rad + 2} y={y + 3} fontSize={8} fill={C.white}>{r.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── RateBar ──────────────────────────────────────────────────
// 순위표 승률 칸 인라인 미니바 — pctText를 배경 바(0~100%) 위에 얹는다.
// td 안에 그대로 넣어 쓴다. C 없으면(테스트 등) 바 없이 텍스트만.
export function RateBar({ rate, pctText, C }) {
  const v = Math.max(0, Math.min(1, rate || 0));
  return (
    <div style={{ position: 'relative', display: 'inline-block', minWidth: 40, padding: '0 2px' }}>
      {C && v > 0 && (
        <span style={{
          position: 'absolute', left: 0, top: 1, bottom: 1, width: `${v * 100}%`,
          background: C.accent, opacity: 0.16, borderRadius: 3,
        }} />
      )}
      <span style={{ position: 'relative', fontVariantNumeric: 'tabular-nums' }}>{pctText}</span>
    </div>
  );
}
