# Campaign Dispatcher

You have a small full-stack product slice to build. You may use the tools you normally use, including coding agents and google. Narrate important decisions, inspect generated code, and verify the behavior you implement.

## Start here

Requires Python 3.12, [uv](https://docs.astral.sh/uv/), and Node.js 22.

```bash
make setup
make dev
```

The campaign UI runs at [http://localhost:5173](http://localhost:5173), and the FastAPI docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

Useful commands:

```bash
make db-reset  # Recreate SQLite after changing database/schema.sql
make test      # Run backend and frontend tests
make check     # Lint, test, type-check, and build
```

## Product goal

> Allow a user to send the displayed campaign to its contacts and see what happened.

Implement an end-to-end slice that:

1. Designs the SQLite tables needed for the campaign, its contacts, and delivery outcomes. Table names and columns are your decision.
2. Inserts the campaign and contacts shown in `database/schema.sql`.
3. Reads the campaign and contacts from SQLite when sending.
4. Replaces `{first_name}` in the message template for each eligible contact.
5. Never calls the sender for opted-out contacts.
6. Persists sent and skipped outcomes.
7. Exposes the behavior through an API contract you design.
8. Connects the existing React screen to the API and displays aggregate and per-contact outcomes.
9. Adds focused backend tests for the behavior you consider most important.

Prefer the simplest coherent design you can explain. You do not need migrations, authentication, retries, idempotency, background jobs, or polished styling.

## Where to work

The repository is already wired so you can focus on the product behavior:

- `database/schema.sql` — define your schema and insert the starter data. This is the only database setup file you need to touch.
- `backend/app/v1/campaigns/model.py` — define Pydantic contracts.
- `backend/app/v1/campaigns/controller.py` — add the route.
- `backend/app/v1/campaigns/service.py` — implement SQL and orchestration.
- `frontend/src/types/api.ts` — define the response shape.
- `frontend/src/lib/api.ts` and `frontend/src/lib/data/use-campaign.ts` — call the API.
- `frontend/src/pages/campaign-detail.tsx` — render the result.

The fake sender in `backend/app/v1/campaigns/sender.py` is complete and records its calls for tests.
