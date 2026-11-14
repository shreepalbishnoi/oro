"""evidence store, parakh checks, forward trail, reference data, room holdings

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql as pg

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EMBED_DIM = 768
NOW = sa.text("now()")


def _fk(col: str, target: str, table: str, ondelete: str, nullable: bool = False) -> sa.Column:
    ref_table = target.split(".")[0]
    return sa.Column(
        col,
        sa.BigInteger,
        sa.ForeignKey(target, ondelete=ondelete, name=f"fk_{table}_{col}_{ref_table}"),
        nullable=nullable,
    )


def upgrade() -> None:
    # ---- existing tables -------------------------------------------------------------
    op.add_column("users", sa.Column("telegram_chat_id", sa.BigInteger))
    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(timezone=True)))
    op.create_unique_constraint("uq_users_telegram_chat_id", "users", ["telegram_chat_id"])
    op.add_column("instruments", sa.Column("group_name", sa.String(120)))
    op.add_column(
        "llm_calls",
        sa.Column("provider", sa.String(24), nullable=False, server_default="anthropic"),
    )
    op.add_column(
        "llm_calls", sa.Column("status", sa.String(16), nullable=False, server_default="ok")
    )

    # ---- evidence --------------------------------------------------------------------
    op.create_table(
        "sources",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        sa.Column("slug", sa.Text, nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("tier", sa.SmallInteger, nullable=False),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("poll_market_s", sa.Integer, nullable=False, server_default="300"),
        sa.Column("poll_off_s", sa.Integer, nullable=False, server_default="1800"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("etag", sa.Text),
        sa.Column("last_modified", sa.Text),
        sa.Column("high_water", sa.DateTime(timezone=True)),
        sa.Column("next_poll_at", sa.DateTime(timezone=True)),
        sa.Column("last_ok_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text),
        sa.Column("fail_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("items_total", sa.BigInteger, nullable=False, server_default="0"),
        sa.CheckConstraint("tier BETWEEN 1 AND 4", name="ck_sources_tier"),
        sa.UniqueConstraint("slug", name="uq_sources_slug"),
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        _fk("source_id", "sources.id", "documents", "RESTRICT"),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("body", sa.Text, nullable=False, server_default=""),
        sa.Column("content_hash", sa.Text, nullable=False),
        sa.Column("simhash", sa.BigInteger),
        sa.Column("category", sa.Text),
        sa.Column("tier", sa.SmallInteger, nullable=False),
        sa.Column("symbol_hint", sa.Text),
        sa.Column("denies", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("attrs", pg.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("lang", sa.Text, nullable=False, server_default="en"),
        sa.UniqueConstraint("content_hash", name="uq_documents_content_hash"),
    )
    op.create_index("ix_documents_published_at", "documents", ["published_at"])
    op.create_index("ix_documents_source_id", "documents", ["source_id"])
    op.create_index(
        "ix_documents_unprocessed",
        "documents",
        ["id"],
        postgresql_where=sa.text("processed_at IS NULL"),
    )

    op.create_table(
        "chunks",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        _fk("document_id", "documents.id", "chunks", "CASCADE"),
        sa.Column("ord", sa.SmallInteger, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tier", sa.SmallInteger, nullable=False),
        sa.Column(
            "instrument_ids",
            pg.ARRAY(sa.BigInteger),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("embedding", Vector(EMBED_DIM)),
        sa.Column(
            "tsv",
            pg.TSVECTOR,
            sa.Computed("to_tsvector('simple', text)", persisted=True),
        ),
    )
    op.create_index("ix_chunks_document_id", "chunks", ["document_id"])
    op.create_index("ix_chunks_published_at", "chunks", ["published_at"])
    op.create_index("ix_chunks_tsv", "chunks", ["tsv"], postgresql_using="gin")
    op.create_index(
        "ix_chunks_instrument_ids", "chunks", ["instrument_ids"], postgresql_using="gin"
    )
    # HNSW on cosine distance; m/ef_construction sized for a 12 GB VM (PLAN §6.3).
    op.execute(
        "CREATE INDEX ix_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )

    op.create_table(
        "doc_entities",
        _fk("document_id", "documents.id", "doc_entities", "CASCADE"),
        _fk("instrument_id", "instruments.id", "doc_entities", "CASCADE"),
        sa.Column("centrality", sa.Float, nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("document_id", "instrument_id", name="pk_doc_entities"),
    )
    op.create_index("ix_doc_entities_instrument_id", "doc_entities", ["instrument_id"])

    op.create_table(
        "disclosures",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        _fk("instrument_id", "instruments.id", "disclosures", "SET NULL", nullable=True),
        sa.Column("symbol", sa.Text, nullable=False),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("party", sa.Text, nullable=False),
        sa.Column("side", sa.Text),
        sa.Column("quantity", sa.BigInteger),
        sa.Column("price", sa.Numeric(14, 4)),
        sa.Column("detail", sa.Text, nullable=False),
        sa.Column("deal_date", sa.Date, nullable=False),
        sa.Column("source", sa.Text, nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("dedupe_key", sa.Text, nullable=False),
        sa.UniqueConstraint("dedupe_key", name="uq_disclosures_dedupe_key"),
    )
    op.create_index("ix_disclosures_instrument_date", "disclosures", ["instrument_id", "deal_date"])
    op.create_index("ix_disclosures_symbol_date", "disclosures", ["symbol", "deal_date"])

    # ---- reference -------------------------------------------------------------------
    op.create_table(
        "registered_intermediaries",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("reg_no", sa.Text, nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("name_norm", sa.Text, nullable=False),
        sa.Column("valid_until", sa.Date),
        sa.Column("as_of", sa.Date, nullable=False),
        sa.UniqueConstraint("reg_no", name="uq_registered_intermediaries_reg_no"),
    )
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN "
        "CREATE INDEX ix_registered_intermediaries_name_trgm ON registered_intermediaries "
        "USING gin (name_norm gin_trgm_ops); END IF; END $$"
    )

    op.create_table(
        "surveillance_flags",
        _fk("instrument_id", "instruments.id", "surveillance_flags", "CASCADE"),
        sa.Column("list", sa.Text, nullable=False),
        sa.Column("stage", sa.Text, nullable=False),
        sa.Column("as_of", sa.Date, nullable=False),
        sa.PrimaryKeyConstraint("instrument_id", "list", name="pk_surveillance_flags"),
    )

    op.create_table(
        "prices_eod",
        _fk("instrument_id", "instruments.id", "prices_eod", "CASCADE"),
        sa.Column("trade_date", sa.Date, nullable=False),
        sa.Column("close", sa.Numeric(16, 4), nullable=False),
        sa.Column("prev_close", sa.Numeric(16, 4)),
        sa.Column("volume", sa.BigInteger),
        sa.PrimaryKeyConstraint("instrument_id", "trade_date", name="pk_prices_eod"),
    )
    op.create_index("ix_prices_eod_trade_date", "prices_eod", ["trade_date"])

    op.create_table(
        "index_eod",
        sa.Column("index_name", sa.Text, nullable=False),
        sa.Column("trade_date", sa.Date, nullable=False),
        sa.Column("close", sa.Numeric(16, 4), nullable=False),
        sa.Column("change_pct", sa.Numeric(8, 4)),
        sa.PrimaryKeyConstraint("index_name", "trade_date", name="pk_index_eod"),
    )

    op.create_table(
        "fund_portfolios",
        _fk("scheme_id", "instruments.id", "fund_portfolios", "CASCADE"),
        _fk("instrument_id", "instruments.id", "fund_portfolios", "CASCADE"),
        sa.Column("as_of", sa.Date, nullable=False),
        sa.Column("weight", sa.Numeric(9, 6), nullable=False),
        sa.CheckConstraint("weight >= 0 AND weight <= 1", name="ck_fund_portfolios_weight"),
        sa.PrimaryKeyConstraint("scheme_id", "instrument_id", "as_of", name="pk_fund_portfolios"),
    )
    op.create_index("ix_fund_portfolios_instrument_id", "fund_portfolios", ["instrument_id"])

    # ---- parakh ----------------------------------------------------------------------
    op.create_table(
        "checks",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        sa.Column("public_id", sa.Text, nullable=False),
        _fk("user_id", "users.id", "checks", "SET NULL", nullable=True),
        sa.Column("anon_key", sa.Text),
        sa.Column("channel", sa.Text, nullable=False, server_default="web"),
        sa.Column("input_kind", sa.Text, nullable=False),
        sa.Column("redacted_text", sa.Text, nullable=False),
        sa.Column("exact_hash", sa.Text, nullable=False),
        sa.Column("simhash", sa.BigInteger, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="pending"),
        sa.Column("verdict", pg.JSONB),
        sa.Column("karat", sa.SmallInteger),
        sa.Column("risk", sa.Text),
        sa.Column("mode", sa.Text),
        sa.Column("signal_ids", pg.ARRAY(sa.Text), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("share_slug", sa.Text),
        sa.Column("latency_ms", sa.Integer),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('pending','running','done','failed')", name="ck_checks_status"
        ),
        sa.UniqueConstraint("public_id", name="uq_checks_public_id"),
        sa.UniqueConstraint("share_slug", name="uq_checks_share_slug"),
    )
    op.create_index("ix_checks_user_created", "checks", ["user_id", "created_at"])
    op.create_index("ix_checks_exact_hash_created", "checks", ["exact_hash", "created_at"])
    op.create_index("ix_checks_created_at", "checks", ["created_at"])
    op.create_index("ix_checks_anon_key", "checks", ["anon_key"])

    op.create_table(
        "forward_fingerprints",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        sa.Column("cluster_id", sa.BigInteger, nullable=False),
        sa.Column("exact_hash", sa.Text, nullable=False),
        sa.Column("simhash", sa.BigInteger, nullable=False),
        sa.Column("check_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("channels", pg.ARRAY(sa.Text), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.UniqueConstraint("exact_hash", name="uq_forward_fingerprints_exact_hash"),
    )
    op.create_index("ix_forward_fingerprints_cluster_id", "forward_fingerprints", ["cluster_id"])
    op.create_index("ix_forward_fingerprints_last_seen", "forward_fingerprints", ["last_seen"])

    op.create_table(
        "error_reports",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        _fk("check_id", "checks.id", "error_reports", "CASCADE"),
        sa.Column("what", sa.Text, nullable=False),
        sa.Column("link", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )
    op.create_index("ix_error_reports_check_id", "error_reports", ["check_id"])

    op.create_table(
        "corrections",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        _fk("check_id", "checks.id", "corrections", "SET NULL", nullable=True),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("before_label", sa.Text),
        sa.Column("after_label", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )
    op.create_index("ix_corrections_check_id", "corrections", ["check_id"])

    # ---- room ------------------------------------------------------------------------
    op.create_table(
        "portfolios",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        _fk("user_id", "users.id", "portfolios", "CASCADE"),
        sa.Column("source", sa.Text, nullable=False),
        sa.Column("label", sa.Text, nullable=False),
        sa.Column("statement_date", sa.Date),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.CheckConstraint("source IN ('cas','csv','manual')", name="ck_portfolios_source"),
    )
    op.create_index("ix_portfolios_user_id", "portfolios", ["user_id"])

    op.create_table(
        "holdings",
        sa.Column("id", sa.BigInteger, sa.Identity(always=False), primary_key=True),
        _fk("portfolio_id", "portfolios.id", "holdings", "CASCADE"),
        _fk("user_id", "users.id", "holdings", "CASCADE"),
        _fk("instrument_id", "instruments.id", "holdings", "RESTRICT"),
        sa.Column("qty_enc", sa.Text, nullable=False),
        sa.Column("cost_enc", sa.Text),
        sa.Column("as_of", sa.Date),
    )
    op.create_index("ix_holdings_portfolio_id", "holdings", ["portfolio_id"])
    op.create_index("ix_holdings_user_id", "holdings", ["user_id"])
    op.create_index("ix_holdings_instrument_id", "holdings", ["instrument_id"])


def downgrade() -> None:
    for table in (
        "holdings",
        "portfolios",
        "corrections",
        "error_reports",
        "forward_fingerprints",
        "checks",
        "fund_portfolios",
        "index_eod",
        "prices_eod",
        "surveillance_flags",
        "registered_intermediaries",
        "disclosures",
        "doc_entities",
        "chunks",
        "documents",
        "sources",
    ):
        op.drop_table(table)
    op.drop_column("llm_calls", "status")
    op.drop_column("llm_calls", "provider")
    op.drop_column("instruments", "group_name")
    op.drop_constraint("uq_users_telegram_chat_id", "users", type_="unique")
    op.drop_column("users", "last_seen_at")
    op.drop_column("users", "telegram_chat_id")
