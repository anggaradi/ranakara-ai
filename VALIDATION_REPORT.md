# RANAKARA AI v1.0 — Validation Report

## Local automated checks (completed)

Date of preparation: 29 October 2026 (Bali time).

- Node.js syntax check on frontend engine, frontend app and Netlify Function: **PASS**.
- Build asset/structure check (pure static publish `public/`): **PASS**.
- Node test runner: **10/10 PASS**.
- Tested: deterministic material aggregation, stock shortage, status filtering, missing recipe, date validation, order validation, unknown AI catalog ID rejection, API authorization guard, API missing configuration handling, and mocked server-side API call schema.
- No paid API requests performed during local tests.

## Not tested / not verified yet (requires user's accounts or external environment)

- Real OpenAI API calls with an active key and paid quota.
- End-to-end real Supabase email signup, email verification, login, cross-device persistence, and RLS with two users.
- Live Netlify serverless-function deployment, log checks and HTTPS accessibility.
- Full browser interaction end-to-end (browser navigation was restricted in the test environment).
- Accuracy measurement on annotated real-world order messages and evaluation by target MSME users.
- Third-party privacy and penetration testing.

**Release status: candidate MVP source package that passed local automated tests, NOT production-certified or externally verified deployment.**

## Recommended pass criteria before submitting to competition

- AI call live works for at least 20–30 hold-out messages; report exact match accuracy for product IDs, quantities, and dates, not assumed metrics.
- At least 3 prospective users (target) attempt a full workflow and report issues.
- Every mandatory form statement can be demonstrated on the deployed site.
- GitHub commit/tag points to the exact deployment version.
