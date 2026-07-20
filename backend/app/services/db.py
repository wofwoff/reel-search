from collections.abc import Sequence
from datetime import datetime
from typing import Any
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from app.services.collections import CollectionDraft
from app.config import Settings
from app.schemas import CollectionOut, ReelOut, SearchResult


class DatabaseError(RuntimeError):
    pass


def vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{float(value):.9f}" for value in values) + "]"


def _reel_from_row(row: dict[str, Any]) -> ReelOut:
    return ReelOut(
        id=row["id"],
        source_url=row["source_url"],
        canonical_url=row.get("canonical_url"),
        title=row.get("title"),
        caption=row.get("caption"),
        creator=row.get("creator"),
        thumbnail_url=row.get("thumbnail_url"),
        ingest_status=row["ingest_status"],
        created_at=row["created_at"],
        gcs_uri=row.get("gcs_uri"),
        summary=row.get("summary"),
        actionable_items=row.get("actionable_items"),
        resources=row.get("resources"),
        collection_id=row.get("collection_id"),
        collection_name=row.get("collection_name"),
    )


REEL_SELECT = """
select
  r.*,
  c.id as collection_id,
  c.name as collection_name
from reels r
left join reel_collection_items ci on ci.reel_id = r.id
left join reel_collections c on c.id = ci.collection_id
"""


class ReelRepository:
    def __init__(self, settings: Settings):
        self.settings = settings

    def _connect(self):
        if not self.settings.database_url:
            raise DatabaseError("DATABASE_URL is not configured")
        return psycopg.connect(self.settings.database_url, row_factory=dict_row)

    def find_by_canonical_url(self, canonical_url: str | None, user_id: str) -> ReelOut | None:
        if not canonical_url:
            return None
        with self._connect() as conn:
            row = conn.execute(
                REEL_SELECT + " where r.canonical_url = %s and r.user_id = %s limit 1",
                (canonical_url, user_id),
            ).fetchone()
        return _reel_from_row(row) if row else None

    def find_by_id(self, reel_id: UUID, user_id: str) -> ReelOut | None:
        with self._connect() as conn:
            row = conn.execute(
                REEL_SELECT + " where r.id = %s and (r.user_id = %s or r.user_id is null) limit 1",
                (reel_id, user_id),
            ).fetchone()
        return _reel_from_row(row) if row else None

    def delete_reel(self, reel_id: UUID, user_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute("delete from reels where id = %s and user_id = %s", (reel_id, user_id))
            conn.commit()
            return cur.rowcount > 0

    def create_reel(
        self,
        *,
        source_url: str,
        canonical_url: str | None,
        title: str | None,
        caption: str | None,
        creator: str | None,
        thumbnail_url: str | None,
        embedding: Sequence[float],
        embedding_model: str,
        user_id: str,
        ingest_status: str = "saved",
        gcs_uri: str | None = None,
        summary: str | None = None,
        actionable_items: str | None = None,
        resources: str | None = None,
    ) -> ReelOut:
        with self._connect() as conn:
            row = conn.execute(
                """
                insert into reels (
                  source_url,
                  canonical_url,
                  title,
                  caption,
                  creator,
                  thumbnail_url,
                  embedding,
                  embedding_model,
                  ingest_status,
                  gcs_uri,
                  summary,
                  actionable_items,
                  resources,
                  user_id
                )
                values (%s, %s, %s, %s, %s, %s, %s::vector, %s, %s, %s, %s, %s, %s, %s)
                on conflict (canonical_url, user_id)
                do update set source_url = excluded.source_url,
                              gcs_uri = excluded.gcs_uri,
                              summary = excluded.summary,
                              actionable_items = excluded.actionable_items,
                              resources = excluded.resources
                returning *
                """,
                (
                    source_url,
                    canonical_url,
                    title,
                    caption,
                    creator,
                    thumbnail_url,
                    vector_literal(embedding),
                    embedding_model,
                    ingest_status,
                    gcs_uri,
                    summary,
                    actionable_items,
                    resources,
                    user_id,
                ),
            ).fetchone()
        if not row:
            raise DatabaseError("Insert did not return a reel")
        return _reel_from_row(row)

    def list_reels(self, user_id: str, limit: int = 50) -> list[ReelOut]:
        with self._connect() as conn:
            rows = conn.execute(
                REEL_SELECT + " where (r.user_id = %s or r.user_id is null) order by r.created_at desc limit %s",
                (user_id, limit),
            ).fetchall()
        return [_reel_from_row(row) for row in rows]

    def count_reels(self, user_id: str) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "select count(*)::int as count from reels where (user_id = %s or user_id is null)",
                (user_id,),
            ).fetchone()
        return int(row["count"]) if row else 0

    def list_collection_source_reels(self, user_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            return conn.execute(
                """
                select id, title, caption, creator, summary, actionable_items, resources, created_at
                from reels
                where user_id = %s
                order by created_at asc
                """,
                (user_id,),
            ).fetchall()

    def replace_collections(self, user_id: str, drafts: list[CollectionDraft]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                delete from reel_collections
                where user_id = %s
                """,
                (user_id,),
            )
            for draft in drafts:
                collection = conn.execute(
                    """
                    insert into reel_collections (user_id, domain, name, description, keywords)
                    values (%s, %s, %s, %s, %s)
                    returning id
                    """,
                    (user_id, draft.domain, draft.name, draft.description, draft.keywords),
                ).fetchone()
                if not collection:
                    continue
                collection_id = collection["id"]
                for reel_id in draft.reel_ids:
                    conn.execute(
                        """
                        insert into reel_collection_items (collection_id, reel_id)
                        values (%s, %s)
                        on conflict (reel_id) do update set collection_id = excluded.collection_id
                        """,
                        (collection_id, reel_id),
                    )
            conn.commit()

    def list_collections(self, user_id: str) -> list[CollectionOut]:
        with self._connect() as conn:
            collection_rows = conn.execute(
                """
                select
                  c.*,
                  count(ci.reel_id)::int as reel_count
                from reel_collections c
                left join reel_collection_items ci on ci.collection_id = c.id
                where c.user_id = %s
                group by c.id
                order by reel_count desc, c.updated_at desc, c.name asc
                """,
                (user_id,),
            ).fetchall()
            reel_rows = conn.execute(
                """
                select *
                from (
                  select
                    r.*,
                    c.id as collection_id,
                    c.name as collection_name,
                    row_number() over (
                      partition by c.id
                      order by r.created_at desc
                    ) as preview_rank
                  from reels r
                  join reel_collection_items ci on ci.reel_id = r.id
                  join reel_collections c on c.id = ci.collection_id
                  where r.user_id = %s and c.user_id = %s
                ) ranked_reels
                where preview_rank <= %s
                order by collection_name asc, created_at desc
                """,
                (user_id, user_id, 3),
            ).fetchall()

        reels_by_collection: dict[Any, list[ReelOut]] = {}
        for row in reel_rows:
            reels_by_collection.setdefault(row["collection_id"], []).append(_reel_from_row(row))

        return [
            CollectionOut(
                id=row["id"],
                domain=row.get("domain"),
                name=row["name"],
                description=row.get("description"),
                keywords=row.get("keywords") or [],
                reel_count=row["reel_count"],
                updated_at=row["updated_at"],
                reels=reels_by_collection.get(row["id"], [])[:3],
            )
            for row in collection_rows
        ]

    def list_collection_reels(self, collection_id: UUID, user_id: str, limit: int = 8) -> list[ReelOut]:
        with self._connect() as conn:
            rows = conn.execute(
                REEL_SELECT
                + """
                where c.id = %s and c.user_id = %s
                order by r.created_at desc
                limit %s
                """,
                (collection_id, user_id, limit),
            ).fetchall()
        return [_reel_from_row(row) for row in rows]

    def search(self, query_text: str, embedding: Sequence[float], limit: int, user_id: str) -> list[SearchResult]:
        with self._connect() as conn:
            rows = conn.execute(
                "select * from match_reels(%s, %s::vector, %s, %s)",
                (query_text, vector_literal(embedding), limit, user_id),
            ).fetchall()
        return [
            SearchResult(
                id=row["id"],
                source_url=row["source_url"],
                canonical_url=row.get("canonical_url"),
                title=row.get("title"),
                caption=row.get("caption"),
                creator=row.get("creator"),
                thumbnail_url=row.get("thumbnail_url"),
                ingest_status=row["ingest_status"],
                created_at=row["created_at"],
                gcs_uri=row.get("gcs_uri"),
                summary=row.get("summary"),
                actionable_items=row.get("actionable_items"),
                resources=row.get("resources"),
                score=float(row["score"]),
            )
            for row in rows
        ]
