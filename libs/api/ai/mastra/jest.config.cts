const {
  esmJsTransform,
  mastraTransformIgnorePatterns,
} = require("../../../../jest.esm-interop.cjs");

module.exports = {
  displayName: "mastra",
  preset: "../../../../jest.preset.js",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
    "^.+\\.[mc]?js$": esmJsTransform,
  },
  transformIgnorePatterns: mastraTransformIgnorePatterns(),
  moduleFileExtensions: ["ts", "js", "mjs", "cjs", "html"],
  coverageDirectory: "../../../../coverage/libs/api/ai/mastra",
};
