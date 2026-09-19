# Contributing to AllGo

Thanks for helping improve AllGo. The project is under active development, so contributions should stay small, reviewable, and backed by evidence.

## Development setup

Requirements:

- Node.js 18 or newer
- npm 10
- MySQL 8 for database-backed development and E2E work
- Redis 7 for distributed dispatch and cache-related work

Install dependencies from the repository root:

```bash
npm ci
```

Use `.env.example` as the reference for local environment variables. Never commit real secrets, production credentials, access tokens, OTPs, or customer data.

## Repository structure

- `apps/customer` - customer mobile app
- `apps/driver` - driver mobile app
- `apps/admin` - administrative web app
- `server` - backend API and real-time services
- `shared` - shared types, constants, and utilities
- `docs` - project and implementation documentation

## Branching

Create focused branches from an up-to-date `main`.

Recommended prefixes:

- `fix/` for bug fixes
- `feat/` for product work
- `chore/` for maintenance
- `docs/` for documentation
- `test/` for test-only changes

Avoid mixing unrelated fixes in one branch.

## Validation

Run validation that matches the scope of your change. At minimum, before opening a pull request:

```bash
npm run typecheck
npm --workspace @allgo/server test
npm --workspace @allgo/server run build
git diff --check
```

For backend changes that affect persistence, dispatch, lifecycle state, or distributed behavior, also run the relevant E2E or smoke tests described in `TESTING.md`.

CI on pull requests to `main` runs the repository's authoritative validation workflow.

## Tests

Every bug fix should include a regression test when practical.

Concurrency fixes should test the actual shared-state interleaving or guarded database predicate rather than only mocking a desired return value.

Do not weaken existing assertions merely to make a change pass.

## Pull requests

Keep pull requests narrow and explain:

- the concrete problem;
- the production behavior changed;
- tests added or updated;
- validation performed;
- known limitations or deliberately excluded follow-up work.

Do not merge with failing required checks.

## Security

Do not report exploitable security issues in a public issue. Follow `SECURITY.md` for private disclosure guidance.

## Commit messages

Use concise, imperative commit messages. Conventional prefixes are encouraged, for example:

```text
fix(auth): make successful OTP consumption atomic
feat(dispatch): add driver offer acknowledgement
docs: add deployment notes
```

## Code review

Review for correctness first, then maintainability. Pay particular attention to:

- authorization boundaries;
- race conditions and stale-state writes;
- idempotency;
- retry behavior;
- distributed state ownership;
- secret handling;
- error-path behavior;
- backward compatibility.

A small patch with strong evidence is preferred over a broad patch with optimistic comments.
