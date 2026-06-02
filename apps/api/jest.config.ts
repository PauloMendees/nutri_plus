import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/../test/jest-setup-env.ts'],
  // jose@6 is pure ESM; map it to a CJS stub so jwks-rsa can be required in Jest's
  // CommonJS transform context. The stub lives at apps/api/__mocks__/jose.js.
  moduleNameMapper: { '^jose$': '<rootDir>/../__mocks__/jose.js' },
};

export default config;
