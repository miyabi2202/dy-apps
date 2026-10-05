import { createJestConfig } from '@dy-apps/config/jest';

export default createJestConfig({
  setupFilesAfterEnv: ['<rootDir>/tests/setup-tests.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/stories/**'],
});
