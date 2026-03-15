"""
Lightweight migration helper.

Since this project does not use Alembic, we run idempotent ALTER TABLE
statements at startup to bring an existing schema up to date.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session


_MIGRATIONS: list[str] = [
    """
    CREATE TABLE IF NOT EXISTS pending_registrations (
        id UUID PRIMARY KEY,
        email VARCHAR NOT NULL UNIQUE,
        name VARCHAR,
        hashed_password VARCHAR NOT NULL,
        verification_code_hash VARCHAR NOT NULL,
        code_expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_pending_registrations_email ON pending_registrations(email);
    """,
    # Phase-2: add user_id to recipes
    """
    ALTER TABLE recipes
        ADD COLUMN IF NOT EXISTS user_id UUID
            REFERENCES users(id) ON DELETE SET NULL;
    """,
    # Phase-2: index on recipes.user_id
    """
    CREATE INDEX IF NOT EXISTS ix_recipes_user_id ON recipes(user_id);
    """,
    # Phase-2: add user_id to dishes
    """
    ALTER TABLE dishes
        ADD COLUMN IF NOT EXISTS user_id UUID
            REFERENCES users(id) ON DELETE SET NULL;
    """,
    # Phase-2: add healthiness_score to dishes (may have been created without it)
    """
    ALTER TABLE dishes
        ADD COLUMN IF NOT EXISTS healthiness_score FLOAT;
    """,
    # Phase-2: index on dishes.user_id
    """
    CREATE INDEX IF NOT EXISTS ix_dishes_user_id ON dishes(user_id);
    """,
    # Phase-2: add instructions to recipes (may have been created without it)
    """
    ALTER TABLE recipes
        ADD COLUMN IF NOT EXISTS instructions TEXT;
    """,
    # Phase-2: add instructions to dishes (may have been created without it)
    """
    ALTER TABLE dishes
        ADD COLUMN IF NOT EXISTS instructions TEXT;
    """,
]


def run_migrations(db: Session) -> None:
    """Apply all pending schema migrations idempotently."""
    for stmt in _MIGRATIONS:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception as exc:
            db.rollback()
            # Log but don't crash — most errors here are benign (column already exists, etc.)
            print(f"[migrate] Warning during migration: {exc}")
