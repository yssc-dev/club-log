import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import LegacyDataNotice from '../LegacyDataNotice';
import { C } from '../../../../config/constants';

const legacy = (date) => ({ date, game_id: `legacy_${date}`, our_members_json: '["A","B","C"]' });
const app = (date) => ({ date, game_id: `s_${date}`, our_members_json: '["A","B","C"]' });

const render = (matchLogs) => renderToStaticMarkup(
  createElement(LegacyDataNotice, { matchLogs, C }),
);

describe('LegacyDataNotice', () => {
  it('앱 이전 경기가 있으면 출전 기록 결핍을 알린다', () => {
    const html = render([legacy('2026-01-06'), app('2026-06-10')]);
    expect(html).toContain('출전');
    expect(html).toContain('2026-06-10'); // 앱 전환 시점을 데이터에서 뽑아 표기
  });

  it('앱 이전 경기 수를 밝힌다 — 얼마나 영향받는지 가늠할 수 있게', () => {
    const html = render([legacy('2026-01-06'), legacy('2026-02-03'), app('2026-06-10')]);
    expect(html).toContain('2경기');
  });

  it('앱 이전 경기가 없으면 배너 자체를 안 띄운다', () => {
    expect(render([app('2026-06-10'), app('2026-06-17')])).toBe('');
  });

  it('빈 입력에도 안전하다', () => {
    expect(render([])).toBe('');
    expect(render(null)).toBe('');
  });

  it('앱 구간 경기가 아직 없으면 전환일 없이도 렌더된다', () => {
    const html = render([legacy('2026-01-06')]);
    expect(html).toContain('출전');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });
});
