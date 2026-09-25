import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's auto-cleanup only self-registers when `afterEach` is a global
// (vite.config.ts does not set test.globals: true), so without this,
// DOM/portal content leaks across test cases in every test file.
afterEach(() => {
	cleanup();
});
