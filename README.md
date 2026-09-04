# Catlister Campaign Dispatcher

A full-stack campaign manager built with React, FastAPI, SQLAlchemy, SQLite, and Resend.

## Live demo

- Application: [catlister-campaign-demo.up.railway.app](https://catlister-campaign-demo.up.railway.app/)
- Access: the reviewer password is provided separately.

## Features

- Campaign CRUD
- Contact CRUD with a maximum of 10 contacts per campaign
- Atomic CSV contact import
- Reusable message-template CRUD
- `{first_name}` subject and message personalization
- Contact opt-out handling
- Rate-limited background email delivery through Resend
- Expandable run history with per-recipient delivery results
- Optional shared-password protection

## Run locally

Requirements: Docker and Make.

```bash
cp .env.example .env
make docker-up
```

Open [localhost:8080](http://localhost:8080/).

```bash
make docker-logs  # View logs
make docker-down  # Stop the application
```

The default `.env.example` uses the fake email provider, so local testing does not send real email. SQLite data is stored in the `catlister-campaign-data` Docker volume.

## Resend configuration

To send real email from a verified domain, update `.env`:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_server_side_key
RESEND_FROM_EMAIL=Catlister <campaigns@mail.ranjan.ai>
SEND_RATE_PER_SECOND=1
```

`RESEND_DEMO_RECIPIENT` must remain unset when using a verified domain. Secrets are ignored by Git and excluded from the Docker image.

## CSV format

```csv
first_name,email
Maya,maya@example.com
Noah,noah@example.com
```

The CSV must be UTF-8, use exactly the `first_name,email` headers, remain under 64 KiB, and keep the campaign at or below 10 contacts. Invalid imports are rejected without partial writes.

## Verification

```bash
make check
```

This runs backend linting and tests, frontend type checking and tests, and the production frontend build.

## API

- `/v1/campaigns` — campaign CRUD
- `/v1/campaigns/{id}/contacts` — contact CRUD and CSV import
- `/v1/campaigns/{id}/preview` — personalized preview
- `/v1/campaigns/{id}/send` — background campaign delivery
- `/v1/campaigns/{id}/runs` — delivery history and outcomes
- `/v1/templates` — template CRUD
- `/v1/auth/session` — demo authentication

Interactive API documentation is available at `/docs`.

## Deployment

The application is packaged as one Docker image. Railway serves the React build and FastAPI API from the same origin.

Required Railway configuration:

```env
DATABASE_PATH=/data/app.db
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_server_side_key
RESEND_FROM_EMAIL=Catlister <campaigns@mail.ranjan.ai>
SEND_RATE_PER_SECOND=1
APP_PASSWORD=provide-separately
SESSION_SECRET=generate-a-long-random-value
```

Mount a persistent Railway volume at `/data` and run one application replica.
