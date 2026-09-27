const {
  esmJsTransform,
  mastraTransformIgnorePatterns,
} = require("../../jest.esm-interop.cjs");

module.exports = {
  displayName: "api",
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
    // @nestjs/bullmq and @nestjs/config ship ESM-only output, and @law/mastra
    // pulls in Mastra's ESM dependencies; compile those node_modules too.
    "^.+\\.[mc]?js$": esmJsTransform,
  },
  transformIgnorePatterns: mastraTransformIgnorePatterns([
    "@nestjs/bullmq",
    "@nestjs/bull-shared",
    "@nestjs/config",
  ]),
  moduleFileExtensions: ["ts", "js", "mjs", "cjs", "html"],
  coverageDirectory: "../../coverage/apps/api",
};
