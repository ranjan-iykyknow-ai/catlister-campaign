import argparse
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = REPOSITORY_ROOT / "database" / "app.db"
SCHEMA_PATH = REPOSITORY_ROOT / "database" / "schema.sql"

# Local development reads the repository-level file. Railway injects these
# same names directly, so deployment does not depend on the file existing.
load_dotenv(REPOSITORY_ROOT / ".env")


def database_path() -> Path:
    configured_path = os.environ.get("DATABASE_PATH")
    return Path(configured_path).expanduser() if configured_path else DEFAULT_DATABASE_PATH


def create_connection(path: Path | None = None) -> sqlite3.Connection:
    target = path or database_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(target, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    # Initialize the empty starter file without ever resetting existing user data.
    with create_connection() as connection:
        tables = connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        if not tables:
            connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        elif connection.execute("PRAGMA user_version").fetchone()[0] != 1:
            raise RuntimeError("Unsupported database schema. Back up the database before upgrading.")


@lru_cache(maxsize=8)
def engine_for(path: str):
    engine = create_engine(f"sqlite:///{path}", poolclass=NullPool, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def configure(connection, _record):
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")

    return engine


@contextmanager
def session_scope(*, write: bool = False):
    with Session(engine_for(str(database_path().resolve())), expire_on_commit=False) as session:
        try:
            if write:
                session.execute(text("BEGIN IMMEDIATE"))
            yield session
            if write:
                session.commit()
        except BaseException:
            session.rollback()
            raise


def reset_database() -> None:
    target = database_path()
    resolved_target = target.resolve()
    if target.exists():
        if (
            target.suffix != ".db"
            or target.is_dir()
            or resolved_target in {Path.home().resolve(), REPOSITORY_ROOT.resolve()}
        ):
            raise RuntimeError(f"Refusing to remove unsafe database path: {target}")
        target.unlink()

    with create_connection(target) as connection:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def get_database() -> Iterator[sqlite3.Connection]:
    connection = create_connection()
    try:
        yield connection
    finally:
        connection.close()


DatabaseDep = Annotated[sqlite3.Connection, Depends(get_database)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize the interview database from database/schema.sql")
    parser.add_argument("--reset", action="store_true", help="Delete and recreate the local database")
    arguments = parser.parse_args()
    reset_database() if arguments.reset else initialize_database()


if __name__ == "__main__":
    main()
