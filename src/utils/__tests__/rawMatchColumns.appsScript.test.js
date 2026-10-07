// 영구 가드: apps-script/Code.js 의 RAW_MATCHES_HEADERS(서버가 실제로 쓰는 열 순서)와
// src/utils/matchRowBuilder.js 의 RAW_MATCH_COLUMNS(클라이언트가 가정하는 열 순서)가
// 어긋나면 로그_매치 기존 데이터 전체가 오독된다 — 이 두 배열은 파일이 분리돼 있어
// 한쪽만 바뀌는 "반쪽 출하"가 조용히 통과할 수 있다. 다음 열 추가가 반쪽으로 끝나면
// 여기서 실패해야 한다.
//
// 경로 의존(fragile) 가드 — apps-script/Code.js 의 상대 위치나 변수 선언 형태가
// 바뀌면 이 테스트도 같이 손봐야 한다(I-4).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RAW_MATCH_COLUMNS } from '../matchRowBuilder';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE_JS_PATH = path.resolve(__dirname, '../../../apps-script/Code.js');
const codeJs = fs.readFileSync(CODE_JS_PATH, 'utf8');

function parseStringArrayLiteral(src, varName) {
  const re = new RegExp(`var ${varName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const m = src.match(re);
  if (!m) throw new Error(`${varName} 를 Code.js 에서 찾지 못했다 — 변수 선언 형태가 바뀌었을 수 있다`);
  const withoutComments = m[1].replace(/\/\/.*$/gm, '');
  return [...withoutComments.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe('RAW_MATCHES_HEADERS(Code.js) ↔ RAW_MATCH_COLUMNS(matchRowBuilder.js) 동기화', () => {
  it('열 이름과 순서가 완전히 같다', () => {
    const headers = parseStringArrayLiteral(codeJs, 'RAW_MATCHES_HEADERS');
    expect(headers).toEqual(RAW_MATCH_COLUMNS);
  });

  it('_rawMatchToArray 가 반환하는 슬롯 개수가 RAW_MATCHES_HEADERS 길이와 같다', () => {
    const fnMatch = codeJs.match(/function _rawMatchToArray\(r\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
    expect(fnMatch, '_rawMatchToArray 함수를 Code.js 에서 찾지 못했다').toBeTruthy();
    const slots = fnMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const headers = parseStringArrayLiteral(codeJs, 'RAW_MATCHES_HEADERS');
    expect(slots).toHaveLength(headers.length);
  });
});
