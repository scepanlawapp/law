module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }]
  },
  // @nestjs/bullmq and @nestjs/config ship ESM-only output; let ts-jest transpile them too.
  transformIgnorePatterns: ['/node_modules/(?!(@nestjs/bullmq|@nestjs/bull-shared|@nestjs/config)/)'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api'
};
