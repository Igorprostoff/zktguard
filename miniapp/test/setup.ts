import "@testing-library/jest-dom/vitest";

// jsdom doesn't ship fetch; Vitest's environment === "jsdom" gives
// us Node's global fetch by default. If a test needs to stub it,
// the App's flow code uses `global.fetch`, so spies work normally.
