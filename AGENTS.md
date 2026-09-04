# Repository Working Agreements

- Run the full stack with `make dev` from the repository root.
- Put SQLite DDL and starter data in `database/schema.sql`; do not create application tables dynamically in request handlers.
- Keep FastAPI controllers focused on HTTP concerns, Pydantic contracts in `model.py`, and orchestration/SQL in `service.py`.
- Keep frontend HTTP calls in `src/lib/api.ts`, server-state hooks in `src/lib/data/`, and rendering in the page component.
- The fake sender is provided infrastructure. Configure it in tests rather than replacing it.
- Prefer a small coherent vertical slice over speculative production infrastructure.
- You may change any file when that produces a clearer design, but the existing TODO locations should be sufficient.
