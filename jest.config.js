const path = require('path');

// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const baseConfig = require('./.config/jest.config');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...baseConfig,
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    // Mock the guacamole-common-js runtime dep in unit tests.
    '^guacamole-common-js$': path.resolve(__dirname, 'src', '__mocks__', 'guacamole-common-js.js'),
  },
};
