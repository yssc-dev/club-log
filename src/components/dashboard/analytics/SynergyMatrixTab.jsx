// src/components/dashboard/analytics/SynergyMatrixTab.jsx
import { useState, useMemo } from 'react';
import { calcSynergyMatrix } from '../../../utils/analyticsV2/calcSynergyMatrix';
import * as soccerCalc from '../../../utils/soccerAnalytics';

// 종목별 계산층 선택용 (풋살 기본)
const futsalCalc = { calcSynergyMatrix };

export default function SynergyMatrixTab({ matchLogs, C, isSoccer = false }) {
  const { calcSynergyMatrix } = isSoccer ? soccerCalc : futsalCalc;
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sortMode, setSortMode] = useState('default');

  const data = useMemo(() => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: 5 }), [matchLogs]);

  const players = useMemo(() => {
    if (sortMode === 'default') return data.players;
    const avg = {};
    for (const p of data.players) {
      let sum = 0, cnt = 0;
      for (const q of data.players) {
        if (p === q) continue;
        const [a, b] = [p, q].sort((x, y) => x.localeCompare(y, 'ko'));
        const cell = data.cells[`${a}|${b}`];
        if (!cell || cell.games < data.minRounds) continue;
        if (cell.baselineUnavailable) continue; // 오염된 lift는 평균에서 제외
        sum += cell.liftSymmetric ?? 0; cnt += 1;
      }
      avg[p] = cnt > 0 ? sum / cnt : null;
    }
    const list = [...data.players];
    list.sort((p, q) => {
      const av = avg[p], bv = avg[q];
      if (av == null && bv == null) return p.localeCompare(q, 'ko');
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortMode === 'low' ? av - bv : bv - av;
    });
    return list;
  }, [data, sortMode]);

  if (!matchLogs || matchLogs.length === 0) {
    return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>로그_매치 데이터가 없습니다.</div>;
  }

  // 색상 = 케미(liftSymmetric) 기준. 양수=초록, 음수=빨강, 중립=카드색
  // baselineUnavailable(항상 동행)은 lift가 오염된 값이라 색을 칠하지 않음
  const colorFor = (cell, isDiag, isSelected) => {
    if (isSelected) return C.accent;
    if (isDiag) return C.borderColor;
    if (!cell || cell.games < data.minRounds) return C.cardLight;
    if (cell.baselineUnavailable) return C.card;
    const lift = cell.liftSymmetric ?? 0;
    if (lift >= 0.05) return `rgba(34,197,94,${0.3 + Math.min(0.6, lift * 2)})`;
    if (lift <= -0.05) return `rgba(239,68,68,${0.3 + Math.min(0.6, -lift * 2)})`;
    return C.card;
  };

  const cellSize = 24;
  const nameColWidth = 60;
  const active = selected || hover;
  const isCellSelected = (a, b) => selected && ((selected.a === a && selected.b === b) || (selected.a === b && selected.b === a));

  return (
    <div style={{ paddingBottom: 56 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: C.gray }}>정렬:</span>
        {[
          { k: 'default', l: '기본' },
          { k: 'low', l: '역시너지 TOP' },
          { k: 'high', l: '시너지 TOP' },
        ].map(({ k, l }) => (
          <button key={k} onClick={() => setSortMode(k)} style={{
            padding: '3px 10px', borderRadius: 50, fontSize: 10, fontWeight: 600,
            background: sortMode === k ? C.accent : 'transparent',
            color: sortMode === k ? '#fff' : C.gray,
            border: `1px solid ${sortMode === k ? C.accent : C.grayDarker}`,
            cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        색상 = <b>케미</b>(둘의 개인 평균 승률 — 함께 뛴 매치 제외 — 대비 함께 뛸 때 추가 효과). 초록=호흡 좋음, 빨강=호흡 안좋음, 회색=표본 부족(&lt; {data.minRounds}경기) 또는 항상 동행이라 측정 불가. 셀을 탭하면 아래 상세가 고정됩니다.
      </div>
      <div style={{ overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr>
              <th style={{ width: nameColWidth }}></th>
              {players.map(p => (
                <th key={p} style={{ width: cellSize, writingMode: "vertical-rl", color: C.gray, fontWeight: 500, padding: 2, position: "sticky", top: 0, zIndex: 9, background: C.bg }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map(a => (
              <tr key={a} style={{ height: cellSize }}>
                <td style={{ color: C.gray, paddingRight: 6, textAlign: "right", fontSize: 10 }}>{a}</td>
                {players.map(b => {
                  const sortedKey = [a, b].sort((x, y) => x.localeCompare(y, 'ko'));
                  const key = `${sortedKey[0]}|${sortedKey[1]}`;
                  const cell = data.cells[key];
                  const isDiag = a === b;
                  const tappable = cell && cell.games >= data.minRounds;
                  const sel = isCellSelected(a, b);
                  return (
                    <td key={b}
                      onMouseEnter={() => !isDiag && tappable && setHover({ a, b, cell })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => {
                        if (isDiag || !tappable) return;
                        if (sel) setSelected(null);
                        else setSelected({ a, b, cell });
                      }}
                      style={{
                        width: cellSize, height: cellSize,
                        background: colorFor(cell, isDiag, sel),
                        border: sel ? `1px solid ${C.accent}` : `1px solid ${C.grayDarker}`,
                        cursor: !isDiag && tappable ? "pointer" : "default",
                      }} />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{
        position: "sticky", bottom: 0, zIndex: 10,
        marginTop: 12, padding: "10px 12px",
        background: C.card, borderRadius: 8,
        border: `1px solid ${C.borderColor}`,
        fontSize: 12, color: active ? C.white : C.gray, minHeight: 36, boxSizing: "border-box",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        boxShadow: "0 -2px 8px rgba(0,0,0,0.15)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {active ? (
            active.a === active.b ? (
              <><b>{active.a}</b> 개인 전체: {active.cell.games}경기 {active.cell.wins}승 {active.cell.draws}무 {active.cell.losses}패 · 승률 {Math.round(active.cell.winRate * 100)}%</>
            ) : (
              <>
                <b>{active.a} × {active.b}</b>: {active.cell.games}경기 {active.cell.wins}승 {active.cell.draws}무 {active.cell.losses}패
                · 승률 {Math.round(active.cell.winRate * 100)}%
                {active.cell.baselineUnavailable
                  ? ' · 케미 측정 불가(항상 동행)'
                  : ` · 케미 ${(active.cell.liftSymmetric ?? 0) >= 0 ? '+' : ''}${((active.cell.liftSymmetric ?? 0) * 100).toFixed(1)}`}
              </>
            )
          ) : (
            <span>셀을 탭하거나 호버하면 상세가 표시됩니다.</span>
          )}
        </div>
        {selected && (
          <button onClick={() => setSelected(null)}
            style={{ padding: "4px 8px", fontSize: 10, borderRadius: 4, border: `1px solid ${C.grayDarker}`, background: "transparent", color: C.gray, cursor: "pointer", whiteSpace: "nowrap" }}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}
