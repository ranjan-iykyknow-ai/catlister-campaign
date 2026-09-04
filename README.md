# Campaign Dispatcher

A small full-stack campaign manager for creating campaigns, importing contacts, personalizing message templates, and tracking email outcomes. The React UI, FastAPI API, SQLite data, and Resend integration are delivered as one deployable service.

## What it supports

- Campaign create, read, update, and delete
- Contact CRUD with a hard limit of 10 contacts per campaign
- Atomic CSV import using `first_name,email` headers
- Reusable message-template CRUD and campaign assignment
- `{first_name}` personalization in both subject and message
- Explicit opt-out handling: opted-out contacts never reach the sender
- FastAPI background dispatch at one email per second
- Fake sender for safe tests and Resend for live delivery
- Persistent aggregate and per-contact delivery results
- Optional shared-password protection for a public demo

## Run locally

Requires Python 3.12, [uv](https://docs.astral.sh/uv/), and Node.js 22.

```bash
make setup
make db-reset
make dev
```

Open [http://localhost:5173](http://localhost:5173). API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

Copy `.env.example` to `.env` for local configuration. If `RESEND_API_KEY` exists and `EMAIL_PROVIDER` is omitted, the backend selects Resend automatically. Set `EMAIL_PROVIDER=fake` whenever you want to guarantee that no real email is sent.

## Resend demo mode

The no-domain demo uses:

```text
RESEND_API_KEY=re_...
EMAIL_PROVIDER=resend
RESEND_FROM_EMAIL=Campaign Dispatcher <onboarding@resend.dev>
RESEND_DEMO_RECIPIENT=the-email-on-your-resend-account@example.com
SEND_RATE_PER_SECOND=1
```

`onboarding@resend.dev` can send only to the email address associated with the Resend account. Set `RESEND_DEMO_RECIPIENT` to that exact address so the application rejects other recipients before calling Resend. Reaching unrelated inboxes requires a verified sending domain.

The API key stays server-side. It is ignored by Git, excluded from the Docker build context, and never returned to the frontend.

## CSV format

```csv
first_name,email
Maya,maya@example.com
Noah,noah@example.com
```

Imports are UTF-8, at most 64 KiB, and all-or-nothing. Duplicate emails or any row that would take the campaign above 10 contacts rejects the whole import.

## API outline

- `GET|POST /v1/campaigns`
- `GET|PATCH|DELETE /v1/campaigns/{campaign_id}`
- `GET|POST /v1/campaigns/{campaign_id}/contacts`
- `PATCH|DELETE /v1/campaigns/{campaign_id}/contacts/{contact_id}`
- `POST /v1/campaigns/{campaign_id}/contacts/import`
- `POST /v1/campaigns/{campaign_id}/preview`
- `POST /v1/campaigns/{campaign_id}/send`
- `GET /v1/campaigns/{campaign_id}/runs/{run_id}`
- `GET|POST /v1/templates`
- `GET|PATCH|DELETE /v1/templates/{template_id}`
- `GET|POST|DELETE /v1/auth/session`

## Verification

```bash
make test
make check
```

Backend tests cover CRUD, CSV atomicity, personalization, opt-out skipping, persisted outcomes, template protections, and shared-password access. Frontend checks cover API behavior, TypeScript, tests, and production build.

## Deploy to Railway

Railway detects the root `Dockerfile`, builds the React application, installs the FastAPI backend, and serves both from one origin.

1. Push this repository to GitHub and connect it to a new Railway service.
2. Add a Railway volume mounted at `/data`.
3. Add these service variables:

   ```text
   DATABASE_PATH=/data/app.db
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=your-key
   RESEND_FROM_EMAIL=Campaign Dispatcher <onboarding@resend.dev>
   RESEND_DEMO_RECIPIENT=your-resend-account-email
   SEND_RATE_PER_SECOND=1
   APP_PASSWORD=a-reviewer-password
   SESSION_SECRET=a-long-random-value
   ```

4. Deploy one replica and generate a Railway domain in the service Networking settings.
5. Sign in with `APP_PASSWORD`, replace the seeded example contacts with the permitted live recipient, and run one reviewed demonstration.

SQLite plus in-process background work intentionally assumes one application replica. A production system would move to a managed database, a durable queue, webhooks, and stronger user authentication.

## Design notes

The schema lives in `database/schema.sql`. Controllers handle HTTP concerns, Pydantic models define contracts, and the service layer owns SQL and orchestration. Each send creates immutable subject, message, and recipient snapshots before returning `202 Accepted`; the background task then records one outcome per contact. Provider success means Resend accepted the request, not guaranteed inbox delivery.
