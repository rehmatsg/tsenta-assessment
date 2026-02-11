# Agent Guidelines for Tsenta Assessment

This document provides guidelines for AI coding agents working in this repository.

## Project Overview

TypeScript-based Playwright automation system for filling job application forms across multiple ATS platforms (Acme Corp, Globex Corp).

## Build & Run Commands

```bash
# Install dependencies
npm install

# Install Playwright browsers (required after npm install)
npx playwright install chromium

# Run the automator
npm start

# Serve mock ATS forms (run in separate terminal)
npm run serve
```

## Tech Stack

- **Runtime**: Node.js 18+ with `tsx` for TypeScript execution
- **Browser Automation**: Playwright
- **Language**: TypeScript 5.7+ (strict mode)
- **Module System**: ESNext with bundler resolution

## Code Style Guidelines

### TypeScript Conventions

- **Strict mode enabled**: Always define proper types, no `any` without justification
- **Use type imports**: `import type { Foo } from "./types"` for type-only imports
- **Explicit return types**: Functions should declare return types (e.g., `Promise<ApplicationResult>`)
- **Prefer interfaces for objects**, type aliases for unions/complex types
- **Path alias**: Use `@/*` to reference files in `src/` directory

### Naming Conventions

- **Files**: kebab-case (e.g., `automator.ts`, `acme-handler.ts`)
- **Types/Interfaces**: PascalCase (e.g., `UserProfile`, `ApplicationResult`)
- **Functions**: camelCase, descriptive verbs (e.g., `fillTextField`, `detectPlatform`)
- **Constants**: camelCase for local, UPPER_SNAKE_CASE for true constants
- **Boolean variables**: Use prefixes like `is`, `has`, `should` (e.g., `isAuthorized`)

### Code Organization

```typescript
// 1. Imports grouped by: external → internal → types
import { chromium } from "playwright";
import { sampleProfile } from "./profile";
import type { ApplicationResult, UserProfile } from "./types";

// 2. Constants
const BASE_URL = "http://localhost:3939";

// 3. Type definitions (if not in separate file)

// 4. Functions
async function applyToJob(url: string, profile: UserProfile): Promise<ApplicationResult> {
  // implementation
}

// 5. Entry point
async function main() {
  // orchestration
}

main();
```

### Error Handling

- Use typed error handling with specific error messages
- Return `ApplicationResult` with `{ success: false, error: string }` for failures
- Use try-catch blocks around Playwright operations
- Log errors to `console.error` with context

### Documentation

- JSDoc for public functions explaining purpose and params
- Inline comments for complex automation logic explaining the "why"
- Keep comments concise and relevant

## Architecture Patterns

### Platform Detection Strategy

Use URL patterns, DOM selectors, or page content to detect ATS platform:

```typescript
function detectPlatform(page: Page): "acme" | "globex" | null {
  // Implementation based on URL or unique selectors
}
```

### Handler Pattern

Create platform-specific handlers implementing a common interface:

```typescript
interface ATSHandler {
  fillForm(page: Page, profile: UserProfile): Promise<void>;
  submit(page: Page): Promise<string>; // returns confirmationId
}
```

### Shared Utilities

Extract common field-filling logic into reusable utilities:

- `fillTextField()` - type into text inputs with human-like delays
- `selectDropdown()` - handle select elements with option matching
- `uploadFile()` - handle file uploads
- `waitForElement()` - robust waiting with retry logic

### Human-Like Behavior

Add randomized delays and realistic interaction patterns:

- Variable typing speed (faster for common words)
- Hover before clicking
- Random pauses between actions (100-500ms)
- Smooth scrolling to elements before interaction

## File Structure

```
src/
├── types.ts           # Shared type definitions (don't modify)
├── profile.ts         # Sample profile data (don't modify)
├── automator.ts       # Main entry point (your implementation)
├── handlers/          # Platform-specific handlers
│   ├── acme.ts
│   └── globex.ts
└── utils/             # Shared utilities
    ├── human-like.ts
    └── field-filler.ts
```

## Testing

Currently no test runner configured. To add tests:
- Consider `vitest` or `jest` for unit tests
- Use Playwright's built-in test runner for E2E tests: `@playwright/test`

Run single file: `npx tsx src/automator.ts`

## Dependencies

**Production**: `playwright`
**Development**: `typescript`, `tsx`, `serve`

Lockfile: `package-lock.json` (use `npm ci` in CI)

## Git Ignore Patterns

See `.gitignore`: `node_modules/`, `dist/`, `test-results/`, `playwright-report/`
