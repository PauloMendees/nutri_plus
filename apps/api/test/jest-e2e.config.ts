import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/setup-e2e.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  // jose@6 is pure ESM; map it to a CJS shim so jwks-rsa can be required in Jest's
  // CommonJS transform context. The shim implements importJWK/exportSPKI/decodeJwt/
  // decodeProtectedHeader via Node's built-in Web Crypto API.
  moduleNameMapper: { '^jose$': '<rootDir>/../__mocks__/jose.js' },
};

export default config;
