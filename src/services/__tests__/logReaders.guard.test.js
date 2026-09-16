// src/services/__tests__/logReaders.guard.test.js
// 스펙 §5·§10 불변식 8·9 — 풋살 로그 3종의 격리는 SheetCache rowFilter 한 곳에서 이뤄진다.
// 그 밖의 파일이 AppSync 로 로그를 직접 읽기 시작하면 컵 행이 새로 새기 시작하므로 정적으로 막는다.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') walk(p, out); }
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

// 직접 읽기가 허용된 파일. 새 경로를 추가하려면 같은 tournament_id 필터를 넣고 여기에 등록한다.
const ALLOWED = new Set(['services/sheetCache.js', 'utils/recoverFinalizedFromSheets.js']);

describe('로그 3종 직접 읽기 화이트리스트', () => {
  it('SheetCache 와 복구 유틸 외에는 AppSync.getMatchLog/getEventLog/getPlayerGameLog 를 부르지 않는다', () => {
    const offenders = [];
    for (const f of walk(SRC)) {
      const rel = path.relative(SRC, f).split(path.sep).join('/');
      if (ALLOWED.has(rel)) continue;
      if (/AppSync\.(getMatchLog|getEventLog|getPlayerGameLog)\(/.test(fs.readFileSync(f, 'utf8'))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
  it('허용 파일 둘은 실제로 tournament_id 필터를 갖는다', () => {
    expect(read('services/sheetCache.js')).toMatch(/tournament_id/);
    expect(read('utils/recoverFinalizedFromSheets.js')).toMatch(/!r\.tournament_id/);
  });
});

describe('App.jsx 마감 태그 단일화', () => {
  const src = read('App.jsx');
  it('logTagsOf 로 태그를 만든다', () => {
    expect(src).toMatch(/logTagsOf\(/);
  });
  it("mode: '기본' / tournamentId: '' 리터럴이 없다", () => {
    expect(src).not.toMatch(/mode:\s*['"]기본['"]/);
    expect(src).not.toMatch(/tournamentId:\s*['"]{2}/);
  });
  it('컵 마감은 refreshAfterFinalize 가 아니라 refreshDatasets(CUP_FINALIZE_DATASETS) 를 부른다', () => {
    expect(src).toMatch(/refreshDatasets\(CUP_FINALIZE_DATASETS/);
  });
  it('컵 마감 전송 목록은 selectFinalizeWrites(true) 에서 온다', () => {
    expect(src).toMatch(/selectFinalizeWrites\(true\)/);
  });
});
