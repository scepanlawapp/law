module.exports = {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }]
  },
  // @nestjs/bullmq ships ESM-only output; let ts-jest transpile it too.
  transformIgnorePatterns: ['/node_modules/(?!(@nestjs/bullmq|@nestjs/bull-shared)/)'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api'
};
