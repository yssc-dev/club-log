// src/components/dashboard/analytics/ChemistryTab.jsx
import { useState, useMemo } from 'react';
import { calcAssistPairs } from '../../../utils/analyticsV2/calcAssistPairs';
import { calcGkChemistry } from '../../../utils/analyticsV2/calcGkChemistry';
import { calcSynergyMatrix } from '../../../utils/analyticsV2/calcSynergyMatrix';
import GoldenTrioView from './GoldenTrioView';
import AssistPairList from './AssistPairList';
import GkChemistryView from './GkChemistryView';
import RivalryView from './RivalryView';
import * as soccerCalc from '../../../utils/soccerAnalytics';

// 종목별 계산층 선택용 (풋살 기본)
const futsalCalc = { calcAssistPairs, calcGkChemistry, calcSynergyMatrix };

export default function ChemistryTab({ matchLogs, eventLogs, C, isSoccer = false }) {
  const { calcAssistPairs, calcGkChemistry, calcSynergyMatrix } = isSoccer ? soccerCalc : futsalCalc;
  const [sub, setSub] = useState('trio');

  // 어시페어 노출 보정 분모(함께 뛴 라운드 수)용 — SynergyMatrixTab과 동일 계산을 탭 자체적으로 수행
  const synergyMatrix = useMemo(
    () => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: 5 }),
    [matchLogs]
  );
  const assistPairs = useMemo(
    () => calcAssistPairs({ eventLogs: eventLogs || [], threshold: 3, topN: 10, synergyCells: synergyMatrix.cells }),
    [eventLogs, synergyMatrix]
  );
  const gkChem = useMemo(
    () => calcGkChemistry({ matchLogs: matchLogs || [], threshold: 5, includeOpponent: !isSoccer }),
    [matchLogs, isSoccer]
  );

  const subs = [
    { key: 'trio', label: '베스트 듀오' },
    { key: 'assist', label: '어시페어' },
    { key: 'gk', label: 'GK케미' },
    // 대결 케미는 클럽 내전(풋살)에서만 의미 — 축구 상대는 외부팀
    ...(!isSoccer ? [{ key: 'rival', label: '라이벌' }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {subs.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)} style={{
            padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600,
            background: sub === s.key ? C.accent : 'transparent',
            color: sub === s.key ? C.black : C.gray,
            border: `1px solid ${sub === s.key ? C.accent : C.grayDarker}`,
            cursor: 'pointer',
          }}>{s.label}</button>
        ))}
      </div>
      {sub === 'trio' && <GoldenTrioView matchLogs={matchLogs} C={C} isSoccer={isSoccer} />}
      {sub === 'assist' && <AssistPairList pairs={assistPairs} C={C} />}
      {sub === 'gk' && <GkChemistryView chem={gkChem} C={C} />}
      {sub === 'rival' && !isSoccer && <RivalryView matchLogs={matchLogs} C={C} />}
    </div>
  );
}
