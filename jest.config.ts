import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Path to the Next.js app, to load next.config.ts and .env files.
  dir: "./",
});

// Config custom da passare a next/jest. Vedi docs/PLAN.md per lo scope
// funzionale coperto dai test (design tokens, tab bar, auth, calendario,
// buchi comuni, RLS/pairing).
const customJestConfig: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Playwright vive in e2e/** ed è eseguito da `npm run test:e2e`, non da Jest.
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/e2e/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "lib/**/*.{ts,tsx}",
    "!**/*.d.ts",
  ],
};

// next/jest è async (carica next.config.ts), quindi esportiamo la promise.
export default createJestConfig(customJestConfig);
