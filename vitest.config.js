import { defineConfig } from 'vitest/config';

export default defineConfig({
  // JSX 자동 런타임 — 컴포넌트 테스트에서 React 전역 없이 JSX 렌더 가능
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}', 'scripts/**/*.test.{js,jsx}'],
    globals: false,
  },
});
