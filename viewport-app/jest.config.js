module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest'],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(d3-interpolate|d3-color|internmap|marked)/)',
  ],
  moduleNameMapper: {
    '\\.(css|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
    'guacamole-common-js': '<rootDir>/tests/__mocks__/guacamole-common-js.js',
  },
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
};
