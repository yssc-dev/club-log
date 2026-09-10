// src/utils/intraSoccer/__tests__/intraNoScoreRead.test.js
// 스펙 §4: 자체전에서 m.ourScore/m.opponentScore 는 A 시점 점수가 아니다. Intra 계열은 읽지 않는다.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const FILES = [
  'src/IntraSoccerApp.jsx',
  'src/components/intra/IntraSoccerMatchView.jsx',
  'src/components/intra/IntraSoccerMatchResults.jsx',
  'src/components/intra/IntraSoccerArchiveDetail.jsx',
  'src/utils/intraSoccer/buildIntraRows.js',
];

describe('Intra 계열 정적 불변식', () => {
  for (const f of FILES) {
    it(`${f} 는 .ourScore/.opponentScore 저장 필드를 읽지 않는다`, () => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      // 수신자 화이트리스트(negative lookahead) — calcSoccerScore(...) 결과에만 .ourScore 를 허용한다.
      // 허용 이름은 sc / scoreA / score 뿐이고 그 밖의 모든 수신자(m., node., v., vA. …)는 실패.
      // 새 지역변수에 점수 결과를 담을 때는 목록을 넓히지 말고 이름을 sc 로 맞춘다.
      const bad = src.match(/\b(?!(?:sc|scoreA|score)\b)[A-Za-z_$][\w$]*\.(ourScore|opponentScore)\b/g) || [];
      expect(bad).toEqual([]);
    });
  }
  it('Intra 계열은 하버FC 원본 컴포넌트를 수정하지 않고 import 만 한다', () => {
    const view = fs.readFileSync(path.join(ROOT, 'src/components/intra/IntraSoccerMatchView.jsx'), 'utf8');
    for (const leaf of ['FormationSetup', 'FormationRecorder', 'FormationPitch', 'LineupEditView', 'RoundNav', 'ConfirmBar']) {
      expect(view).toMatch(new RegExp(`import ${leaf} from '../game/${leaf}'`));
    }
  });
});
