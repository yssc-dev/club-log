// src/components/dashboard/analytics/ChemistryTab.jsx
import { useState, useMemo, useEffect } from 'react';
import * as futsalCalc from '../../../utils/analyticsV2';
import GoldenTrioView from './GoldenTrioView';
import AssistPairList from './AssistPairList';
import GkChemistryView from './GkChemistryView';
import RivalryView from './RivalryView';
import DefenseAnalysisView from './DefenseAnalysisView';
import * as soccerCalc from '../../../utils/soccerAnalytics';

export default function ChemistryTab({ matchLogs, eventLogs, C, isSoccer = false }) {
  const { calcAssistPairs, calcGkChemistry, calcSynergyMatrix } = isSoccer ? soccerCalc : futsalCalc;
  const [sub, setSub] = useState('trio');
  // 종목 전환 시 종목 전용 서브탭(defense/rival)에 좌초 방지 — TeamDashboard activeTab 'records' 리셋과 동일 규약
  useEffect(() => { setSub('trio'); }, [isSoccer]);

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
    // 수비케미는 our_defenders_json이 있는 축구 전용
    ...(isSoccer ? [{ key: 'defense', label: '수비케미' }] : []),
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
      {sub === 'defense' && isSoccer && <DefenseAnalysisView matchLogs={matchLogs} C={C} />}
      {sub === 'rival' && !isSoccer && <RivalryView matchLogs={matchLogs} C={C} />}
    </div>
  );
}
