"""base schema: extensions, users, consents, instruments, aliases, llm_calls

Revision ID: 0001
Revises:
Create Date: 2026-10-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    # pgvector for dense retrieval; lexical search uses built-in full-text search (no pg_search).
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    # pg_trgm ships with every standard Postgres build; embedded dev servers may lack it.
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') "
        "THEN CREATE EXTENSION IF NOT EXISTS pg_trgm; END IF; END $$"
    )

    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("auth_subject", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320)),
        sa.Column("display_name", sa.String(200)),
        sa.Column("phone_e164", sa.String(20)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("auth_subject", name="uq_users_auth_subject"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("phone_e164", name="uq_users_phone_e164"),
    )

    op.create_table(
        "consents",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "user_id",
            sa.BigInteger,
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_consents_user_id_users"),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(64), nullable=False),
        sa.Column("granted", sa.Boolean, nullable=False),
        sa.Column("policy_version", sa.String(32), nullable=False),
        sa.Column(
            "recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_consents"),
    )
    op.create_index("ix_consents_user_id", "consents", ["user_id"])

    op.create_table(
        "instruments",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("isin", sa.String(12)),
        sa.Column("isin_alt", sa.String(12)),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("nse_symbol", sa.String(32)),
        sa.Column("bse_code", sa.String(12)),
        sa.Column("series", sa.String(8)),
        sa.Column("is_sme", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("industry", sa.String(120)),
        sa.Column("listed_on", sa.Date),
        sa.Column("amfi_code", sa.String(12)),
        sa.Column("amc", sa.String(160)),
        sa.Column("scheme_category", sa.String(160)),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_instruments"),
        sa.UniqueConstraint("isin", name="uq_instruments_isin"),
        sa.UniqueConstraint("isin_alt", name="uq_instruments_isin_alt"),
        sa.UniqueConstraint("nse_symbol", name="uq_instruments_nse_symbol"),
        sa.UniqueConstraint("bse_code", name="uq_instruments_bse_code"),
        sa.UniqueConstraint("amfi_code", name="uq_instruments_amfi_code"),
    )
    op.create_index("ix_instruments_kind_active", "instruments", ["kind", "active"])

    op.create_table(
        "entity_aliases",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "instrument_id",
            sa.BigInteger,
            sa.ForeignKey(
                "instruments.id",
                ondelete="CASCADE",
                name="fk_entity_aliases_instrument_id_instruments",
            ),
            nullable=False,
        ),
        sa.Column("alias", sa.String(300), nullable=False),
        sa.Column("alias_norm", sa.String(300), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_entity_aliases"),
        sa.UniqueConstraint("instrument_id", "alias_norm", name="uq_entity_aliases_instrument_id"),
    )
    op.create_index("ix_entity_aliases_instrument_id", "entity_aliases", ["instrument_id"])
    # text_pattern_ops makes `alias_norm LIKE 'prefix%'` index-backed regardless of collation.
    op.execute(
        "CREATE INDEX ix_entity_aliases_alias_norm ON entity_aliases (alias_norm text_pattern_ops)"
    )
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN "
        "CREATE INDEX ix_entity_aliases_alias_trgm ON entity_aliases USING gin (alias_norm gin_trgm_ops); "
        "END IF; END $$"
    )

    op.create_table(
        "llm_calls",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("purpose", sa.String(48), nullable=False),
        sa.Column("model", sa.String(64), nullable=False),
        sa.Column("input_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cache_read_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cache_write_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("batched", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("cost_inr", sa.Numeric(10, 4), nullable=False),
        sa.Column("latency_ms", sa.Integer),
        sa.Column("ref", sa.String(64)),
        sa.PrimaryKeyConstraint("id", name="pk_llm_calls"),
    )
    op.create_index("ix_llm_calls_created_at", "llm_calls", ["created_at"])


def downgrade() -> None:
    op.drop_table("llm_calls")
    op.drop_table("entity_aliases")
    op.drop_table("instruments")
    op.drop_table("consents")
    op.drop_table("users")
