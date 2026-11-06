// apps-script/Code.js 의 _toDateCell 가드.
//
// 앱은 경기일자를 "2026-11-05" 문자열로 보낸다. 그 문자열이 시트에 글자 그대로 굳으면
// SUMIFS("<"&날짜) 같은 숫자 비교에서 그 행이 에러 없이 통째로 빠져 집계가 조용히 틀린다
// (2026-11-06: 마스터FC 포인트 로그/선수별집계기록 로그 1020행 중 835행이 그 상태였다).
// _writePointLog/_writePlayerLog 가 Date 객체로 넘기는지, 그리고 _toDateCell 이 레거시
// 표기를 망치지 않는지를 여기서 지킨다.
//
// 경로 의존(fragile) 가드 — apps-script/Code.js 의 상대 위치나 함수 선언 형태가 바뀌면
// 이 테스트도 같이 손봐야 한다.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codeJs = fs.readFileSync(path.resolve(__dirname, '../../../apps-script/Code.js'), 'utf8');

// GAS 전역 모킹 — 지정 타임존 기준으로 파싱하는 Utilities.parseDate 의 동작만 흉내낸다.
const UtilitiesMock = {
  parseDate(s, tz, fmt) {
    expect(fmt).toBe('yyyy-MM-dd HH:mm:ss');
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
    if (!m) throw new Error('parseDate 형식 불일치: ' + s);
    const offsets = { 'Asia/Seoul': '+09:00', 'UTC': 'Z', 'America/New_York': '-05:00' };
    const off = offsets[tz];
    if (!off) throw new Error('모킹하지 않은 타임존: ' + tz);
    return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off}`);
  },
};

function loadToDateCell() {
  const m = codeJs.match(/function _toDateCell\(v, tz\) \{[\s\S]*?\n\}/);
  if (!m) throw new Error('_toDateCell 을 Code.js 에서 찾지 못했다 — 선언 형태가 바뀌었을 수 있다');
  return new Function('Utilities', `${m[0]}\nreturn _toDateCell;`)(UtilitiesMock);
}

// 서울 기준 날짜 — Date 가 어느 순간을 가리키는지 타임존을 고정해 확인한다.
function seoulYmd(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

describe('_toDateCell — 시트에 날짜값으로 쓰기 위한 변환', () => {
  const toDateCell = loadToDateCell();

  it('앱이 보내는 "yyyy-MM-dd" 문자열을 Date 로 바꾼다', () => {
    const out = toDateCell('2026-11-05', 'Asia/Seoul');
    expect(out).toBeInstanceOf(Date);
    expect(seoulYmd(out)).toBe('2026-11-05');
  });

  it('시간 성분이 자정이다 — 정오였다면 "=날짜" 정확 매칭 수식이 깨진다', () => {
    const out = toDateCell('2026-11-05', 'Asia/Seoul');
    const hm = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(out);
    expect(hm).toBe('00:00');
  });

  it('스프레드시트 타임존을 따른다 — 다른 타임존이면 그 타임존의 자정이다', () => {
    const ny = toDateCell('2026-11-05', 'America/New_York');
    expect(ny.toISOString()).toBe('2026-11-05T05:00:00.000Z');
  });

  it('이미 Date 면 그대로 통과시킨다', () => {
    const d = new Date('2026-11-05T00:00:00+09:00');
    expect(toDateCell(d, 'Asia/Seoul')).toBe(d);
  });

  // 레거시 표기를 Date 로 바꾸려다 잘못 해석하느니 원본을 남긴다 — 시트에서 직접 고칠 대상이다.
  it.each([
    ['2026. 1. 8', '레거시 점 표기'],
    ['2026.1.8', '레거시 점 표기(공백 없음)'],
    ['2026/11/05', '슬래시 표기'],
    ['', '빈 문자열'],
    ['26-11-05', '두 자리 연도'],
    ['2026-11-5', '한 자리 일'],
  ])('%s (%s) 는 건드리지 않고 원본 그대로 돌려준다', (input) => {
    expect(toDateCell(input, 'Asia/Seoul')).toBe(input);
  });

  it('null/undefined 도 원본 그대로 — 빈 칸을 1970년으로 만들지 않는다', () => {
    expect(toDateCell(null, 'Asia/Seoul')).toBe(null);
    expect(toDateCell(undefined, 'Asia/Seoul')).toBe(undefined);
  });

  it('tz 가 비면 Asia/Seoul 로 떨어진다', () => {
    expect(seoulYmd(toDateCell('2026-11-05', ''))).toBe('2026-11-05');
  });
});

// 헬퍼만 있고 호출부가 안 바뀌면 아무 효과가 없다("반쪽 출하").
describe('풋살 쓰기 함수가 실제로 _toDateCell 을 거친다', () => {
  function bodyOf(fnName) {
    const m = codeJs.match(new RegExp(`function ${fnName}\\(data, sheetName\\) \\{[\\s\\S]*?\\n\\}\\n`));
    if (!m) throw new Error(`${fnName} 을 Code.js 에서 찾지 못했다`);
    return m[0];
  }

  it.each([
    ['_writePointLog', 'e.gameDate'],
    ['_writePlayerLog', 'p.gameDate'],
  ])('%s 가 gameDate 를 날것으로 setValues 하지 않는다', (fnName, raw) => {
    const body = bodyOf(fnName);
    expect(body).toContain(`_toDateCell(${raw}, tz)`);
    // 변환을 거치지 않은 날것의 gameDate 가 행 배열에 남아 있으면 안 된다.
    const rawUses = body.match(new RegExp(`(?<!_toDateCell\\()\\b${raw.replace('.', '\\.')}\\b`, 'g')) || [];
    expect(rawUses, `${fnName} 에 변환 없는 ${raw} 가 남아 있다`).toHaveLength(0);
  });

  it.each(['_writePointLog', '_writePlayerLog'])('%s 가 스프레드시트 타임존을 읽는다', (fnName) => {
    expect(bodyOf(fnName)).toContain('ss.getSpreadsheetTimeZone()');
  });
});
