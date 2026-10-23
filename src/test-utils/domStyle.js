// 테스트에서 인라인 스타일을 읽을 때 쓰는 헬퍼. (테스트 전용 — 앱 코드에서 쓰지 말 것)
//
// ── jsdom 함정 (2026-10-23 확인) ──────────────────────────────────────────
// 이 앱의 색은 대부분 CSS 변수다(C.borderColor === 'var(--app-divider)').
// CSS 변수가 섞인 shorthand 를 jsdom 은 longhand 로 분해하지 못한다. 선언 자체는
// style 속성에 남지만, 반대쪽 getter 가 빈 문자열이 된다:
//
//   el.style.borderTop = '1px solid var(--x)'
//     → style.borderTop      === '1px solid var(--x)'   (읽힌다)
//     → style.borderTopWidth === ''                     (빈다!)
//
//   el.style.borderTopWidth = '1px' ...
//     → style.borderTopWidth === '1px'                  (읽힌다)
//     → style.borderTop      === ''                     (빈다!)
//
//   getComputedStyle 은 두 경우 모두 기본값('medium'/'none')만 돌려준다 — 쓸모없다.
//   (CSS 변수가 없으면 — '1px solid #fff' — jsdom 도 정상 분해한다.)
//
// 그래서 스타일을 그냥 `expect(el.style.borderTopWidth).toBe('')` 처럼 단언하면
// "경계선이 없다"가 아니라 "잘못된 getter 를 읽었다"일 때도 통과하는
// 공허한 테스트가 된다. styleOf 는 빈 값을 성공으로 넘기지 않고 터뜨린다.

/**
 * 인라인 스타일 값을 읽는다. 비어 있으면 실패시킨다(조용한 통과 방지).
 * @param {Element} el
 * @param {string} prop  camelCase DOM 속성명 (예: 'borderTopWidth')
 */
export function styleOf(el, prop) {
  const v = el?.style?.[prop] ?? '';
  if (v === '') {
    const raw = el?.getAttribute?.('style') ?? '';
    throw new Error(
      `style.${prop} 가 비어 있습니다.\n`
      + `  값이 정말 없거나, shorthand/longhand 를 잘못 읽은 것입니다.\n`
      + `  (CSS 변수가 섞인 shorthand 는 jsdom 이 longhand 로 분해하지 못합니다 — src/test-utils/domStyle.js 참고)\n`
      + `  요소의 style 원문: "${raw}"`
    );
  }
  return v;
}

/**
 * style 속성 원문에 그 CSS 선언이 있는지. shorthand/longhand 중 어느 쪽으로 쓰였든
 * "선언을 했는가"만 볼 때 쓴다.
 * @param {Element} el
 * @param {string} cssProp  kebab-case CSS 속성명 (예: 'border-top-width')
 */
export function hasStyleDeclaration(el, cssProp) {
  const raw = el?.getAttribute?.('style') ?? '';
  return new RegExp(`(^|;)\\s*${cssProp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(raw);
}
