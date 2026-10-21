# Mechi Safi

Mechi Safi is a private football prediction benchmark. It generates 1X2 predictions for upcoming fixtures, reconstructs pre-match features for historical backtests, and evaluates predictions against finalized regulation-time results.

The dashboard uses Next.js, TypeScript, Tailwind, shadcn-style local components, TanStack Query, React Hook Form, Recharts, and Lucide. The API uses Fastify. PostgreSQL and Prisma store versioned fixtures, snapshots, predictions, batches, and evaluations. A BullMQ worker uses Redis for fixture sync, prediction, backtest, and evaluation jobs.

## Quick start (mock mode)

Requirements: Node.js 20+, pnpm 10+, Docker Desktop or another Docker daemon.

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm dev:all
```

The `dev:all` command starts PostgreSQL and Redis, applies migrations, seeds the six supported competitions and the default prediction configuration, and runs the API, worker, and web app. Open [http://localhost:3000](http://localhost:3000). Set `ADMIN_PASSWORD` in `.env` and use it to sign in. The API is at [http://localhost:4000/api/v1](http://localhost:4000/api/v1), and OpenAPI documentation is at [http://localhost:4000/docs](http://localhost:4000/docs).

Mock mode is enabled by default and is visibly labeled in the UI. It creates deterministic synthetic fixtures and deterministic mock Jev probabilities. Mock outputs are never presented as real Jev predictions.

If the dependencies are already running, use `pnpm db:migrate`, `pnpm db:seed`, and `pnpm dev`. Stop dependencies with `pnpm deps:down`.

## Real providers

Set `MOCK_MODE=false`, `JEV_API_KEY`, and `FOOTBALL_DATA_API_KEY` in `.env`. Also set a unique `ADMIN_PASSWORD` of at least 16 characters and `SESSION_SECRET` of at least 32 characters. The API and worker validate these before startup. Provider keys stay on the server. `FOOTBALL_DATA_BASE_URL` and `JEV_BASE_URL` can be overridden for a compatible gateway.

The football adapter calls the [football-data.org v4 API](https://www.football-data.org/documentation/api) using `X-Auth-Token`, normalizes competitions and matches, uses full-time regulation scores, handles 429 and transient server errors, and spaces requests for the free tier. Competition and season availability depends on the subscription. A sync marks competitions absent from the provider list unavailable.

The Jev adapter calls the documented [decision endpoint](https://jev-ai.org/docs/) at `POST /api/v1/systemone/` with a bearer token, a versioned three-choice question, and a structured pre-match state. It validates all three probabilities, their sum, the selected outcome, and model identity. It stores both the normalized result and the original request and response. Jev's answer confidence is stored separately from outcome probabilities.

Real provider requests were not exercised without credentials. The adapters are covered with normalized provider response tests and mock-provider tests.

## Workflows

- **Generate Predictions:** Select a period from 1 to 168 hours and enabled competitions. The API returns `202` with a batch ID. The worker discovers fixtures, skips existing successful predictions or creates new versions, and updates batch progress. Fixture kickoff is rechecked before each prediction.
- **History:** Each prediction retains its configuration, resolved model version, input snapshot, cutoff, full 1X2 distribution, raw provider payload, and evaluation. Batch items link overlapping batches to the same skipped prediction without overwriting it.
- **Backtesting:** Select competitions, seasons, cutoff, and minimum earlier matches. The worker imports historical fixtures and reconstructs form and Elo using finalized matches with kickoff plus a three-hour buffer before the cutoff. The target and later matches are excluded. The UI displays a provenance limitation because football-data.org does not provide historical publication timestamps for result corrections.
- **Results and evaluation:** The worker refreshes results every 30 minutes and evaluates successful predictions using finalized full-time scores only. Fixture revisions preserve provider changes; evaluations track the result version. Failed provider requests are separate from incorrect predictions.
- **Analytics:** Live and backtest modes are separate. Accuracy, three-class Brier score, log loss, coverage, calibration, distributions, confusion matrix, and comparisons with home-team, Elo, and historical-frequency baselines are available. Comparisons use the same evaluated fixture set.
- **Automation:** Fixture discovery runs every six hours. Optional scheduled predictions run at the configured pre-kickoff cutoff; enable them in Settings.

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

The Playwright suite expects a running mock-mode stack at `http://localhost:3000` with the API at `http://127.0.0.1:4000`. Install the browser with `pnpm exec playwright install chromium` if needed. It covers sign-in, dashboard, manual prediction generation, batch progress, prediction details and history, a historical backtest, request idempotency, duplicate skipping, and prediction version preservation.

## Deployment notes

Run the database migration before starting the API and worker. Run `pnpm db:seed` after the first migration. Start the three applications as separate processes (`pnpm --filter @mechi/api start`, `pnpm --filter @mechi/worker start`, and `pnpm --filter @mechi/web start`) behind HTTPS, with `NODE_ENV=production` set for the API and worker. Point `WEB_ORIGIN` to the web origin and `NEXT_PUBLIC_API_URL` to the externally reachable API `/api/v1` URL. Keep PostgreSQL and Redis persistent, configure backups, and use a strong admin password and session secret. The production API cookie is HTTP-only, secure, and SameSite strict. All dashboard API routes require authentication except health and session endpoints.

## Data limitations

- Historical result records do not include reliable publication timestamps. Backtests prevent future fixture results from entering feature calculations by cutoff, but cannot prove that an earlier result was already published at that historical instant. Backtest outputs show this limitation.
- Mock fixtures and outcomes are synthetic and must not be used as real performance evidence.
- Provider coverage and historical seasons depend on the configured football-data.org plan.
- This MVP supports only the full-time 1X2 market and one private admin account.
