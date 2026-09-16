import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { FORMATIONS, FORMATION_KEYS } from '../../utils/formations';
import FormationPitch from './FormationPitch';

// initialFormation/initialAssignments/confirmLabel: 빅마스터FC 배치 중 노드가 저장된 초안을 이어서 편집하려고
// 넘긴다(스펙 §16.3.4). 하버FC 호출부는 넘기지 않으므로 기존과 동일하게 빈 배치로 연다.
export default function FormationSetup({ selectedPlayers, onConfirm, onBack, title, initialFormation, initialAssignments, confirmLabel }) {
  const { C } = useTheme();
  const [formation, setFormation] = useState(initialFormation || "4-4-2");
  const [assignments, setAssignments] = useState(() => ({ ...(initialAssignments || {}) }));
  const [selectingPos, setSelectingPos] = useState(null);   // 포지션 먼저 선택한 빈 슬롯

  const formData = FORMATIONS[formation];
  const assignedNames = new Set(Object.values(assignments));
  const unassigned = selectedPlayers.filter(n => !assignedNames.has(n)).sort((a, b) => a.localeCompare(b, "ko"));
  const assignedCount = Object.keys(assignments).length;
  const canStart = assignedCount === 11;

  // 자동 배치 순서: FW → MF → DF → GK, 같은 라인은 배열 인덱스(좌→우) 순
  const ROLE_FILL_PRIORITY = { FW: 0, MF: 1, DF: 2, GK: 3 };
  const fillOrder = formData.positions
    .map((pos, idx) => idx)
    .sort((a, b) => {
      const pa = ROLE_FILL_PRIORITY[formData.positions[a].role] ?? 9;
      const pb = ROLE_FILL_PRIORITY[formData.positions[b].role] ?? 9;
      return pa - pb || a - b;
    });
  const nextEmptyIdx = fillOrder.find(idx => assignments[idx] === undefined) ?? null;

  // 빈 슬롯 탭: 포지션 먼저 선택(토글)
  const handleEmptyTap = (posIdx) => {
    setSelectingPos(prev => prev === posIdx ? null : posIdx);
  };
  // 점유 슬롯 탭: 배치 해제(후보로 복귀)
  const handlePlayerTap = (posIdx) => {
    setAssignments(prev => { const next = { ...prev }; delete next[posIdx]; return next; });
  };
  // 선수 칩 탭: 선택된 슬롯이 있으면 그 자리에, 없으면 다음 빈 슬롯에 자동 배치
  const handlePlayerChip = (name) => {
    const target = selectingPos !== null ? selectingPos : nextEmptyIdx;
    if (target === null) return;
    setAssignments(prev => ({ ...prev, [target]: name }));
    setSelectingPos(null);
  };

  const handleFormationChange = (key) => { setFormation(key); setAssignments({}); setSelectingPos(null); };

  const handleConfirm = () => {
    if (!canStart) return;
    const gk = Object.entries(assignments).find(([idx]) => formData.positions[idx].role === "GK")?.[1] || "";
    const positionMap = {};
    Object.entries(assignments).forEach(([idx, name]) => { positionMap[name] = formData.positions[idx].role; });
    const subs = selectedPlayers.filter(n => !assignedNames.has(n));
    onConfirm({ formation, assignments, gk, positionMap, subs });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={{ padding: "6px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>←</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{title || "포메이션 · 선수 배치"}</div>
        <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: canStart ? C.green : C.gray }}>{assignedCount}/11</div>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
        {FORMATION_KEYS.map(key => (
          <button key={key} onClick={() => handleFormationChange(key)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              background: formation === key ? C.accent : C.grayDark, color: formation === key ? C.bg : C.grayLight }}>
            {FORMATIONS[key].label}
          </button>
        ))}
      </div>
      <FormationPitch positions={formData.positions} assignments={assignments}
        onPlayerTap={handlePlayerTap} onEmptyTap={handleEmptyTap}
        highlightIdx={selectingPos !== null ? selectingPos : nextEmptyIdx} />
      <div style={{ marginTop: 12, padding: 12, background: C.card, borderRadius: 10, border: `1px solid ${C.grayDark}` }}>
        <div style={{ fontSize: 12, color: C.gray, fontWeight: 700, marginBottom: 8 }}>
          {selectingPos !== null ? `${formData.positions[selectingPos].role} 자리에 넣을 선수를 탭하세요` : `후보 (${unassigned.length}) — 탭하면 순서대로 자동 배치`}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {unassigned.map(name => (
            <button key={name} onClick={() => handlePlayerChip(name)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: C.grayDarker, color: C.white }}>{name}</button>
          ))}
          {unassigned.length === 0 && <span style={{ fontSize: 12, color: C.gray }}>모든 선수 배치 완료</span>}
        </div>
      </div>
      <button onClick={handleConfirm}
        style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 14,
          background: canStart ? C.green : C.grayDark, color: canStart ? C.bg : C.gray, opacity: canStart ? 1 : 0.5 }}>
        {confirmLabel || "경기 시작"}
      </button>
    </div>
  );
}
