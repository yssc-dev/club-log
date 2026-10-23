import { describe, it, expect } from 'vitest';
import { styleOf, hasStyleDeclaration } from '../domStyle';

// 이 파일은 두 가지를 한다:
//  1) 헬퍼가 동작하는지 검증
//  2) jsdom 의 "CSS 변수가 섞인 shorthand 는 longhand 로 분해되지 않는다"는 전제를 못 박는다.
//     jsdom 이 올라가며 동작이 바뀌면 여기가 깨져서 알게 된다.
describe('jsdom 의 CSS 변수 + shorthand 동작 (헬퍼의 전제)', () => {
  const div = (apply) => { const el = document.createElement('div'); apply(el); return el; };

  it('shorthand 에 변수가 섞이면 longhand getter 가 빈다', () => {
    const el = div(e => { e.style.borderTop = '1px solid var(--app-divider)'; });
    expect(el.style.borderTop).toBe('1px solid var(--app-divider)');
    expect(el.style.borderTopWidth).toBe('');      // ← 함정
    expect(el.getAttribute('style')).toContain('border-top:');   // 선언 자체는 남는다
  });

  it('longhand 로 쓰면 shorthand getter 가 빈다', () => {
    const el = div(e => {
      e.style.borderTopWidth = '1px';
      e.style.borderTopStyle = 'solid';
      e.style.borderTopColor = 'var(--app-divider)';
    });
    expect(el.style.borderTopWidth).toBe('1px');
    expect(el.style.borderTop).toBe('');           // ← 반대 방향 함정
  });

  it('변수가 없으면 jsdom 도 정상 분해한다', () => {
    const el = div(e => { e.style.borderTop = '1px solid #fff'; });
    expect(el.style.borderTopWidth).toBe('1px');
  });

  it('getComputedStyle 은 어느 쪽이든 기본값만 준다 — 검증에 쓰면 안 된다', () => {
    const el = div(e => { e.style.borderTop = '1px solid var(--app-divider)'; });
    document.body.appendChild(el);
    expect(window.getComputedStyle(el).borderTopWidth).toBe('medium');
    el.remove();
  });
});

describe('styleOf', () => {
  it('값이 있으면 그대로 돌려준다', () => {
    const el = document.createElement('div');
    el.style.width = '50%';
    expect(styleOf(el, 'width')).toBe('50%');
  });

  it('빈 값이면 터뜨린다 — 잘못된 getter 로 조용히 통과하지 않게', () => {
    const el = document.createElement('div');
    el.style.borderTop = '1px solid var(--app-divider)';
    expect(() => styleOf(el, 'borderTopWidth')).toThrow(/비어 있습니다/);
    // 메시지에 원문을 실어 어디를 봐야 할지 알려준다
    expect(() => styleOf(el, 'borderTopWidth')).toThrow(/border-top/);
  });

  it('요소가 없어도 터지기만 하고 크래시하지 않는다', () => {
    expect(() => styleOf(null, 'width')).toThrow(/비어 있습니다/);
  });
});

describe('hasStyleDeclaration', () => {
  it('shorthand 로 쓴 선언을 찾는다', () => {
    const el = document.createElement('div');
    el.style.borderTop = '1px solid var(--app-divider)';
    expect(hasStyleDeclaration(el, 'border-top')).toBe(true);
    expect(hasStyleDeclaration(el, 'border-bottom')).toBe(false);
  });

  it('longhand 로 쓴 선언을 찾는다', () => {
    const el = document.createElement('div');
    el.style.borderTopWidth = '1px';
    expect(hasStyleDeclaration(el, 'border-top-width')).toBe(true);
  });

  it('값의 일부가 아니라 속성명만 본다', () => {
    const el = document.createElement('div');
    el.style.background = 'url(color:fake)';
    expect(hasStyleDeclaration(el, 'color')).toBe(false);
  });
});
