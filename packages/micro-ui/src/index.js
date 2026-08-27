// Re-export from TypeScript source for browser / direct imports.
// esdev and tsx handle .ts natively; this file exists for environments
// that resolve plain .js (test.html, CDN, etc.).
export * from "./index.ts";
