/**
 * Jest configuration for the contracts package.
 *
 * We use ts-jest to transpile TypeScript test files on the fly. The test
 * environment is Node since the sandbox and TonCore work in a Node context.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js'],
  clearMocks: true,
  verbose: true
};