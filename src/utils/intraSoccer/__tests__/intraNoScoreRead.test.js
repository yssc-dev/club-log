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
      // calcSoccerScore(...) 결과 구조분해 `{ ourScore, opponentScore }` 와 `sc.ourScore` 는 허용 — 저장 필드 접근(m./node./currentMatch./match.)만 금지
      const bad = src.match(/\b(m|node|currentMatch|match|mm)\.(ourScore|opponentScore)\b/g) || [];
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
