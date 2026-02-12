# Tsenta - Software Engineering Intern Take-Home Assessment

**Time estimate**: 2-4 hours
**Stack**: TypeScript, Playwright

---

## Context

At Tsenta, we automate job applications across dozens of ATS (Applicant Tracking System) platforms, Greenhouse, Lever, Workday, and more. Each platform has different HTML structures, form patterns, and interaction models, but the *data* being entered is the same: name, email, resume, skills, etc.

This assessment gives you **two mock job application forms** with different layouts and interaction patterns. Your job is to build a Playwright automation system that fills out both forms using the same candidate profile, with a clean architecture that could scale to support additional platforms.

---

## Before You Start

### Use whatever tools you want

This is **not** a "write everything by hand" test. You're welcome to use any AI-assisted tools — Claude Code, Cursor, GitHub Copilot, Codex, or anything else. You can also use browser automation tooling like the [Playwright MCP server](https://github.com/microsoft/playwright-mcp), agent-browser, or similar.

We care about the output, not whether you typed every character yourself. Just **document which tools you used** in your write-up — we're genuinely curious about your workflow.

### Parts of this are intentionally vague

We've left some things underspecified on purpose. When something isn't spelled out, make a decision, implement it, and briefly explain your reasoning. There's no single right answer — we want to see how you think through ambiguity.

### Filling in form fields

The `UserProfile` in `src/profile.ts` is your source of truth for what data to enter. But the profile won't map 1:1 to every form field — dropdown values might differ between platforms, some fields won't have an exact match in the profile, and some form fields are optional.

When there's no exact match, **map the profile data intelligently to the closest option**. For example, if the profile says `education: "bachelors"` but the dropdown has `"Bachelor's Degree"` or `"bs"`, pick the right one. For fields that have no corresponding profile data at all (like optional demographic questions), use a sensible default or skip them — the point is that every *required* interaction works correctly, not that values are hardcoded.

---

## A) Setup

### Prerequisites

- Node.js 18+
- npm (or bun/pnpm)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install chromium

# 3. Verify the mock forms work
npm run serve
# Visit http://localhost:3939 — you'll see links to both forms
```

### Project Structure

```
assessment-1/
├── README.md                    # You're here
├── package.json
├── tsconfig.json
├── mock-ats/                    # Two mock job application forms (DO NOT MODIFY)
│   ├── index.html               # Landing page with links to both forms
│   ├── acme.html                # Acme Corp — multi-step form
│   ├── globex.html              # Globex Corp — single-page accordion form
│   └── styles.css               # Styles for Acme
├── fixtures/
│   └── sample-resume.pdf        # Dummy resume for file upload
└── src/
    ├── types.ts                 # Type definitions (UserProfile, ApplicationResult)
    ├── profile.ts               # Sample candidate profile data
    └── automator.ts             # ⬅ YOUR MAIN WORK GOES HERE
```

---

## The Two Forms

Open each form in your browser to explore them before writing any code.

### Acme Corp (`/acme.html`) — Multi-Step Form
- **4 step wizard** with progress bar and Next/Back navigation
- Step validation — must fill required fields before proceeding
- **Typeahead** school field (type to search, click a suggestion)
- Standard **checkboxes** for skills
- **Radio buttons** for yes/no questions
- **Conditional fields** (visa sponsorship appears based on work auth answer)
- File upload with drag-and-drop area
- Review page before final submit, then a success page with confirmation ID

### Globex Corporation (`/globex.html`) — Single-Page Accordion Form
- **Accordion sections** (click headers to expand/collapse) — all on one page
- **Toggle switches** instead of radio buttons for yes/no
- **Chip selectors** instead of checkboxes for skills (click chips to toggle)
- **Salary slider** (`<input type="range">`) instead of text input
- **Async typeahead** for school — results are fetched from a simulated API with network delay, and arrive in **shuffled order** each time (options are NOT in the DOM)
- Inline validation — all sections open on submit if there are errors
- Confirmation with reference number after submit

Same data, very different UI patterns. This is the real challenge of ATS automation.

---

## B) What You Need to Build

### Part 1: Working Automation (~1.5-2 hours)

Implement `src/automator.ts` so that running `npm start` successfully submits applications to **both** forms. Your automation must:

1. Launch a browser and navigate to each form
2. Fill all required fields using the `UserProfile` from `src/profile.ts`
3. Handle platform-specific interactions:
   - Acme: typeahead, step navigation, conditional fields, checkboxes, radio buttons
   - Globex: accordion expansion, toggle switches, chip selection, salary slider, async typeahead
4. Submit each form and capture the confirmation ID / reference number
5. Return an `ApplicationResult` for each

**Run your automation:**
```bash
# Start the mock form server (in one terminal)
npm run serve

# Run your automator (in another terminal)
npm start
```

### Part 2: Architecture (~30 min - 1 hour)

This is where system design shows up *in your code*, not in a doc. Your code structure should answer:

- **How do you detect which platform you're on?** (URL matching, page content, etc.)
- **How do you swap between platform-specific implementations?** (Strategy pattern, registry, etc.)
- **What logic is shared vs. platform-specific?** (e.g., "fill a text input" is universal; "click a chip to select a skill" is Globex-specific)
- **How would someone add a third ATS** without touching existing platform code?

You're free to create whatever files/folders make sense. We're evaluating the design through the code itself.

### Part 3: Human-Like Behavior (~20-30 min)

Real ATS platforms have bot detection. Add at least **two** of these to your automation:

- Randomized delays between actions (not fixed `waitForTimeout`)
- Variable-speed typing (faster for common words, slower for numbers/special chars)
- Hover before clicking
- Simulated reading pauses
- Smooth scrolling

---

## C) What to Submit

Submit your completed project as a **GitHub repo**. Include:

1. **All source code** — we should be able to run `npm install && npm start` and see both forms filled successfully
2. **A short write-up** (add to this README or create `DESIGN.md`) covering:
   - How you structured the code and why
   - What trade-offs you made given the time constraint
   - What was the hardest part
   - What AI tools / assistants you used and how
3. **Submit your repo link here**: https://forms.gle/ACPi3ajwL8x3VfTE9

---

## D) Evaluation Criteria

| Criteria | Weight | What We're Looking For |
|---|---|---|
| **Automation Quality** | 35% | Does it work? Does it handle both forms, all field types, and edge cases? |
| **Code Design** | 40% | Is it well-structured? Could a new ATS be added cleanly? Are abstractions earned, not forced? |
| **Human-Like Behavior** | 25% | Are interactions realistic? Variable delays, natural typing? |

### Bonus Points

Not at all required, but we'd love seeing any of these:

- Screenshots at each step for debugging
- Retry logic for flaky interactions
- Structured logging (timestamps, step names, field names)
- Video/trace recording of the automation run
- Performance tracking (time per step, per form)
- A third mock form or creative extensions
- Tests that verify automation correctness

---

## Tips

- **Read the HTML first.** Open `mock-ats/acme.html` and `mock-ats/globex.html` in your editor. Understand the selectors, validation logic, and conditional behavior. This is exactly how we work with real ATS platforms.
- **Start with one form.** Get Acme working end-to-end, then add Globex. The refactoring to support both is where your design skills show.
- **Don't over-engineer.** We'd rather see clean, working code with natural patterns than an elaborate framework that doesn't run.
- The `fixtures/sample-resume.pdf` file is provided for file upload steps.
- Playwright docs: https://playwright.dev/docs/intro

Good luck, excited to see what you build!
