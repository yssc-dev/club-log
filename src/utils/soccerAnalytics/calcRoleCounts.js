// 사람별 역할 횟수(영상촬영 · 주심 · 부심) 집계.
// 입력은 로그_매치 행의 roles_json — 역할 기능 이전 행은 전부 빈칸이라 자연히 제외된다.
//
// 축구 전용이다. 풋살 계산층(utils/analyticsV2)에는 대응 함수를 두지 않는다 —
// 분석 탭이 isSoccer 로 분해하는 이름이 아니라 컴포넌트가 직접 import 하는 함수이기 때문.

import { parseRoles } from '../soccerRoles';

export function calcRoleCounts(matchLogs) {
  const acc = new Map(); // name → { camera, referee, assistant }
  let hasAny = false;

  const bump = (name, key) => {
    if (!name) return;
    if (!acc.has(name)) acc.set(name, { camera: 0, referee: 0, assistant: 0 });
    acc.get(name)[key] += 1;
    hasAny = true;
  };

  for (const row of (matchLogs || [])) {
    const r = parseRoles(row?.roles_json);
    r.camera.forEach(n => bump(n, 'camera'));
    bump(r.referee, 'referee');
    r.assistants.forEach(n => bump(n, 'assistant'));
  }

  const rows = [...acc.entries()]
    .map(([name, c]) => ({ name, ...c, total: c.camera + c.referee + c.assistant }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ko'));

  return { rows, hasAny };
}
