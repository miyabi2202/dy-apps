import { createJestConfig } from '@dy-apps/config/jest';

export default createJestConfig({
  setupFilesAfterEnv: ['<rootDir>/src/setup-tests.ts'],
});
