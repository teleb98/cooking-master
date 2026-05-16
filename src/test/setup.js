import '@testing-library/jest-dom';

// API 테스트용 환경변수 (프로덕션에서는 Vercel 대시보드에서 설정)
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock fetch globally
global.fetch = vi.fn();

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
