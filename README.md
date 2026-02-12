# Tsenta ATS Automation Submission

https://github.com/user-attachments/assets/19ac9ae6-1aa1-41f0-a935-36be037ec1c6

> The original assessment prompt has been moved to `TASK.md`. This `README.md` documents the implemented solution.

## Overview

This project implements a Playwright + TypeScript automation system that submits job applications to both mock ATS platforms:

- Acme (`/acme.html`): multi-step wizard
- Globex (`/globex.html`): accordion-based single page

The same profile (`src/profile.ts`) is reused across both flows, while platform-specific logic is isolated behind handlers.

## Quick Start

```bash
npm install
npx playwright install chromium
npm run serve
npm start
```

Run integration tests:

```bash
npm run test:e2e
```

## Implementation Summary

Running `npm start`:

1. Opens each target form.
2. Detects the platform (URL + DOM fallback).
3. Fills required fields and selected optional fields from `UserProfile`.
4. Handles platform-specific interactions (wizard steps, accordions, typeaheads, toggles, chips, slider).
5. Submits each application and captures confirmation/reference IDs.
6. Prints a structured run summary with per-target duration.

## Project Structure

- `src/automator.ts`
  - Browser lifecycle, handler detection, run orchestration, summary output, failure artifacts.
- `src/handlers/types.ts`
  - Shared contracts (`ATSHandler`, `ATSHandlerContext`, runtime options).
- `src/handlers/acme.ts`
  - Acme-specific wizard flow.
- `src/handlers/globex.ts`
  - Globex-specific accordion flow.
- `src/handlers/sections.ts`
  - Shared section/step execution abstraction.
- `src/handlers/shared.ts`
  - Shared retry/wait/optional-field/click helpers.
- `src/mappings/registry.ts`
  - Centralized field mapping registry per platform.
- `src/utils/field-filler.ts`
  - Basic form interaction helpers.
- `src/utils/human-like.ts`
  - Human-like interaction engine (typing, pauses, hover, smooth scroll).
- `src/utils/retry.ts`, `src/utils/retry-profiles.ts`
  - Retry utility and retry profiles.
- `src/utils/logger.ts`
  - Centralized structured logging.

## Detailed Code Explanation

### Orchestrator (`src/automator.ts`)

Responsibilities are intentionally limited to orchestration concerns:

- runtime configuration (timeouts, retry/screenshot/video flags, artifact paths)
- browser/context/page lifecycle
- handler detection and invocation
- error handling and `ApplicationResult` shaping
- failure screenshot capture and video saving
- per-run summary output

Step-level instrumentation is provided through `measureStep(...)` and injected into handler context.

### Acme Handler (`src/handlers/acme.ts`)

Acme is modeled as a 4-step wizard:

- Step 1: personal details + optional links
- Step 2: resume upload, experience/education, school typeahead, skills
- Step 3: work authorization, conditional visa field, salary, referral, cover letter
- Step 4: terms agreement + submit + confirmation extraction

Acme-specific interactions implemented:

- school typeahead requires dropdown selection after typing
- visa conditional block handling
- referral `other` conditional field handling
- optional demographics explicitly skipped (no profile data)

### Globex Handler (`src/handlers/globex.ts`)

Globex is modeled as 3 accordion sections plus submit:

- contact
- qualifications
- additional

Globex-specific interactions implemented:

- section open-state enforcement before filling
- toggle switch state handling
- async shuffled typeahead (exact match first, fallback to first valid result)
- skill chips (selection by `data-skill`)
- salary slider update via `input` + `change` events
- referral `other` conditional field handling

### Mapping Registry (`src/mappings/registry.ts`)

A centralized mapping layer resolves platform-specific option differences for:

- experience level
- education
- referral source
- skills

This prevents ad hoc mapping duplication inside each handler and supports extension to additional platforms.

### Reliability and Debugging

Implemented reliability features include:

- targeted retries for known flaky interactions
- explicit visible-selector wait guards
- failure screenshots under `artifacts/failures/`
- Playwright video recording under `artifacts/videos/`
- per-step and per-run duration tracking

### Logging and Observability

`src/utils/logger.ts` provides centralized logs with:

- timestamp
- scope (`Acme`, `Globex`, `Runner`)
- level (`INFO`, `WARN`, `ERROR`, `SUCCESS`)
- final summary (targets, success/failure count, durations, confirmations/errors)

### Human-Like Behavior

Implemented behaviors:

- variable-speed typing (`pressSequentially` with per-character delay class)
- hover before click
- randomized pauses
- smooth scrolling before interaction

Why this is relevant:

- these patterns reduce clearly synthetic interaction signatures (instant fills/clicks everywhere)
- while not guaranteeing bot bypass, they improve realism and robustness on dynamic forms

## Bonus Features Implemented

The implementation includes several bonus-style capabilities from `TASK.md`:

- structured logging with timestamps/scopes
- targeted retry logic
- video recording
- performance tracking (per-step and per-run timing)
- integration test coverage

## Test Coverage

Playwright integration tests are located in `tests/`:

- `tests/automator.e2e.spec.ts`
  - full happy-path submission for both ATS forms
- `tests/edge-cases.e2e.spec.ts`
  - Acme referral `other` path
  - unknown-skill skip safety
  - Globex school fallback when exact match is unavailable

Run:

```bash
npm run test:e2e
```

## Sample Video Artifact

- Sample recording from a real run: [`artifacts/examples/acme-run-sample.mp4`](artifacts/examples/acme-run-sample.mp4)
- Runtime recordings are generated under `artifacts/videos/` and one sample file is copied into `artifacts/examples/`.

<video src="artifacts/examples/acme-run-sample.mp4" controls preload="metadata" width="960"></video>

## Example Run Logs

The following is a real `npm start` run excerpt after switching from trace zips to video recording:

```text
--- Applying to Acme Corp ---
[08:54:25] [Acme] INFO: Launching browser in headless mode.
[08:54:25] [Acme] INFO: Human-like profile: low-overhead, seed mode: random.
[08:54:26] [Acme] INFO: Navigating to http://localhost:3939/acme.html.
[08:54:26] [Acme] INFO: Step 1: filling personal information fields.
[08:54:26] [Acme] INFO: Start: step 1.
[08:54:34] [Acme] INFO: LinkedIn profile provided, filling optional field.
[08:54:34] [Acme] INFO: Portfolio/GitHub provided, filling optional field.
[08:54:34] [Acme] INFO: Done: step 1 (7709ms).
[08:54:34] [Acme] INFO: Step 1 complete, continuing to step 2.
[08:54:34] [Acme] INFO: Step 2: uploading resume and selecting experience/education.
[08:54:34] [Acme] INFO: Start: step 2.
[08:54:34] [Acme] INFO: Selecting school using typeahead.
[08:54:37] [Acme] INFO: Selected 4 matching skills.
[08:54:37] [Acme] INFO: Done: step 2 (2401ms).
[08:54:37] [Acme] INFO: Step 2 complete, continuing to step 3.
[08:54:38] [Acme] INFO: Step 3: setting work authorization and additional questions.
[08:54:38] [Acme] INFO: Start: step 3.
[08:54:38] [Acme] INFO: Work authorization is yes, setting visa sponsorship response.
[08:54:38] [Acme] INFO: Salary expectation provided, filling field.
[08:54:38] [Acme] INFO: Skipping optional demographics section because profile has no demographic data.
[08:55:29] [Acme] INFO: Done: step 3 (51149ms).
[08:55:29] [Acme] INFO: Step 3 complete, continuing to review step.
[08:55:29] [Acme] INFO: Step 4: agreeing to terms and submitting application.
[08:55:29] [Acme] INFO: Start: step 4.
[08:55:30] [Acme] INFO: Waiting for success confirmation.
[08:55:32] [Acme] INFO: Done: step 4 (2896ms).
[08:55:32] [Acme] INFO: Submission completed with confirmation ID ACM-MLJ849KC-TY9B.
[08:55:32] [Acme] SUCCESS: Application flow finished successfully.
[08:55:32] [Acme] INFO: Saved video recording: /Users/rehmatsinghgill/Desktop/Development/Web Projects/tsenta-assessment/artifacts/videos/1f5fbb71dce6e9ace4b8c56ca53fc368.webm
[08:55:32] [Runner] SUCCESS: Acme Corp: application submitted.
[08:55:32] [Runner] INFO: Acme Corp: confirmation ACM-MLJ849KC-TY9B
[08:55:32] [Runner] INFO: Acme Corp: duration 66949ms

--- Applying to Globex Corporation ---
[08:55:32] [Globex] INFO: Launching browser in headless mode.
[08:55:32] [Globex] INFO: Human-like profile: low-overhead, seed mode: random.
[08:55:33] [Globex] INFO: Navigating to http://localhost:3939/globex.html.
[08:55:33] [Globex] INFO: Section contact: filling personal/contact fields.
[08:55:33] [Globex] INFO: Start: section contact.
[08:55:39] [Globex] INFO: LinkedIn profile provided, filling optional field.
[08:55:39] [Globex] INFO: Portfolio/GitHub provided, filling optional field.
[08:55:39] [Globex] INFO: Done: section contact (6860ms).
[08:55:39] [Globex] INFO: Section qualifications: uploading resume and selecting qualification data.
[08:55:39] [Globex] INFO: Start: section qualifications.
[08:55:40] [Globex] INFO: Searching school with async typeahead.
[08:55:42] [Globex] INFO: Exact school match found in results.
[08:55:45] [Globex] INFO: Selected 4 matching skills.
[08:55:45] [Globex] INFO: Done: section qualifications (5180ms).
[08:55:45] [Globex] INFO: Section additional: setting authorization, compensation, source, and motivation.
[08:55:45] [Globex] INFO: Start: section additional.
[08:55:46] [Globex] INFO: Work authorization is true, evaluating visa toggle.
[08:55:46] [Globex] INFO: Normalized salary for slider set to 85000.
[08:55:46] [Globex] INFO: Referral source mapped to "linkedin".
[08:56:37] [Globex] INFO: Done: section additional (52440ms).
[08:56:37] [Globex] INFO: Checking consent and submitting application.
[08:56:37] [Globex] INFO: Waiting for confirmation section.
[08:56:37] [Globex] INFO: Start: submit.
[08:56:40] [Globex] INFO: Done: submit (3212ms).
[08:56:40] [Globex] INFO: Submission completed with reference GX-MLJ85Q1W-BTS.
[08:56:40] [Globex] SUCCESS: Application flow finished successfully.
[08:56:40] [Globex] INFO: Saved video recording: /Users/rehmatsinghgill/Desktop/Development/Web Projects/tsenta-assessment/artifacts/videos/3e87ee0b454d93d6ffeb66b488f5aa68.webm
[08:56:40] [Runner] SUCCESS: Globex Corporation: application submitted.
[08:56:40] [Runner] INFO: Globex Corporation: confirmation GX-MLJ85Q1W-BTS
[08:56:40] [Runner] INFO: Globex Corporation: duration 67941ms

=== Run Summary ===
Targets: 2
Successes: 2
Failures: 0
Total Duration: 135046ms
- Acme Corp: success (66949ms, confirmation=ACM-MLJ849KC-TY9B)
- Globex Corporation: success (67941ms, confirmation=GX-MLJ85Q1W-BTS)
```

## AI Tools and Workflow

Codex (GPT-5.3-Codex) was used to write some parts of this assessment, this readme file and all the tests.

Workflow sequence:

1. establish a working baseline on both forms
2. refactor to handler architecture
3. integrate human-like interaction behavior
4. add reliability features (retries, screenshots, videos, timing)
5. add end-to-end and edge-case integration tests
