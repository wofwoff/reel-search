from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any


STOP_WORDS = {
    "about",
    "above",
    "action",
    "actually",
    "after",
    "again",
    "also",
    "around",
    "based",
    "because",
    "before",
    "being",
    "between",
    "build",
    "building",
    "content",
    "could",
    "create",
    "different",
    "does",
    "doing",
    "each",
    "example",
    "explains",
    "from",
    "give",
    "have",
    "helps",
    "into",
    "just",
    "like",
    "make",
    "more",
    "most",
    "need",
    "people",
    "post",
    "reel",
    "reels",
    "share",
    "shows",
    "some",
    "take",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "thing",
    "this",
    "through",
    "tips",
    "using",
    "video",
    "want",
    "ways",
    "what",
    "when",
    "where",
    "which",
    "while",
    "with",
    "work",
    "would",
    "your",
}

GENERIC_LABEL_WORDS = STOP_WORDS | {
    "ai",
    "app",
    "best",
    "data",
    "digital",
    "idea",
    "ideas",
    "learn",
    "learning",
    "new",
    "online",
    "product",
    "simple",
    "social",
    "tool",
    "tools",
    "use",
    "user",
    "users",
}


@dataclass(frozen=True)
class CollectionDraft:
    name: str
    description: str
    keywords: list[str]
    reel_ids: list[str]


def _tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9+#.-]{1,}", text.lower())
    return [token.strip(".-") for token in tokens if token not in STOP_WORDS and len(token.strip(".-")) > 1]


def _text_for_reel(row: dict[str, Any]) -> str:
    fields = [
        row.get("summary"),
        row.get("title"),
        row.get("caption"),
        row.get("actionable_items"),
        row.get("resources"),
        row.get("creator"),
    ]
    return " ".join(str(field) for field in fields if field)


def _terms(tokens: list[str]) -> Counter[str]:
    counts: Counter[str] = Counter(tokens)
    for first, second in zip(tokens, tokens[1:]):
        if first not in GENERIC_LABEL_WORDS and second not in GENERIC_LABEL_WORDS:
            counts[f"{first} {second}"] += 2
    return counts


def _tfidf_vectors(token_lists: list[list[str]]) -> list[dict[str, float]]:
    doc_count = len(token_lists)
    dfs: Counter[str] = Counter()
    term_counts = [_terms(tokens) for tokens in token_lists]
    for counts in term_counts:
        dfs.update(counts.keys())

    vectors: list[dict[str, float]] = []
    for counts in term_counts:
        vector: dict[str, float] = {}
        for term, count in counts.items():
            idf = math.log((1 + doc_count) / (1 + dfs[term])) + 1
            vector[term] = (1 + math.log(count)) * idf
        norm = math.sqrt(sum(weight * weight for weight in vector.values())) or 1.0
        vectors.append({term: weight / norm for term, weight in vector.items()})
    return vectors


def _cosine(left: dict[str, float], right: dict[str, float]) -> float:
    if len(left) > len(right):
        left, right = right, left
    return sum(weight * right.get(term, 0.0) for term, weight in left.items())


def _cluster_similarity(cluster_a: list[int], cluster_b: list[int], similarities: list[list[float]]) -> float:
    total = 0.0
    pairs = 0
    for idx_a in cluster_a:
        for idx_b in cluster_b:
            total += similarities[idx_a][idx_b]
            pairs += 1
    return total / max(pairs, 1)


def _target_cluster_count(reel_count: int) -> int:
    if reel_count <= 3:
        return 1
    return max(2, min(8, round(math.sqrt(reel_count))))


def _cluster_indices(vectors: list[dict[str, float]]) -> list[list[int]]:
    reel_count = len(vectors)
    if reel_count == 0:
        return []

    similarities = [[0.0 for _ in range(reel_count)] for _ in range(reel_count)]
    for i in range(reel_count):
        similarities[i][i] = 1.0
        for j in range(i + 1, reel_count):
            score = _cosine(vectors[i], vectors[j])
            similarities[i][j] = score
            similarities[j][i] = score

    clusters = [[idx] for idx in range(reel_count)]
    target = _target_cluster_count(reel_count)
    minimum_merge_score = 0.055

    while len(clusters) > target:
        best_pair: tuple[int, int] | None = None
        best_score = -1.0
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                score = _cluster_similarity(clusters[i], clusters[j], similarities)
                if score > best_score:
                    best_score = score
                    best_pair = (i, j)
        if best_pair is None or best_score < minimum_merge_score:
            break
        left, right = best_pair
        clusters[left] = sorted(clusters[left] + clusters[right])
        del clusters[right]

    mixed: list[int] = []
    stable: list[list[int]] = []
    for cluster in clusters:
        if len(cluster) == 1 and reel_count > 5:
            mixed.extend(cluster)
        else:
            stable.append(cluster)
    if len(mixed) == 1 and stable:
        nearest_idx = max(
            range(len(stable)),
            key=lambda idx: _cluster_similarity(mixed, stable[idx], similarities),
        )
        stable[nearest_idx] = sorted(stable[nearest_idx] + mixed)
    elif mixed:
        stable.append(sorted(mixed))

    return sorted(stable, key=lambda cluster: (-len(cluster), cluster[0]))


def _title_case(term: str) -> str:
    keep_upper = {"ai", "api", "css", "gpt", "llm", "ml", "ui", "ux"}
    return " ".join(part.upper() if part in keep_upper else part.capitalize() for part in term.split())


def _collection_name(cluster: list[int], token_lists: list[list[str]], fallback_index: int) -> tuple[str, list[str]]:
    combined: Counter[str] = Counter()
    for idx in cluster:
        combined.update(_terms(token_lists[idx]))

    keywords = [
        term
        for term, _ in combined.most_common(12)
        if not all(part in GENERIC_LABEL_WORDS for part in term.split())
    ]
    if not keywords:
        return ("Mixed Saved Ideas", [])

    label_terms: list[str] = []
    for term in keywords:
        if " " in term:
            label_terms.append(term)
            break
    if not label_terms:
        label_terms = keywords[:2]
    else:
        for term in keywords:
            if term not in label_terms and " " not in term:
                label_terms.append(term)
                break

    name = " & ".join(_title_case(term) for term in label_terms[:2])
    if len(name) > 44:
        name = _title_case(label_terms[0])
    return (name or f"Collection {fallback_index}", [_title_case(term) for term in keywords[:5]])


def build_collections(reels: list[dict[str, Any]]) -> list[CollectionDraft]:
    if not reels:
        return []

    token_lists = [_tokenize(_text_for_reel(row)) for row in reels]
    vectors = _tfidf_vectors(token_lists)
    clusters = _cluster_indices(vectors)
    seen_names: Counter[str] = Counter()
    drafts: list[CollectionDraft] = []

    for idx, cluster in enumerate(clusters, start=1):
        name, keywords = _collection_name(cluster, token_lists, idx)
        seen_names[name] += 1
        if seen_names[name] > 1:
            name = f"{name} {seen_names[name]}"

        sample_titles = [
            reels[reel_idx].get("title") or reels[reel_idx].get("caption") or "Untitled reel"
            for reel_idx in cluster[:3]
        ]
        description = "Grouped from summaries around " + ", ".join(keywords[:3]).lower() if keywords else "Grouped saved reels without a strong shared topic yet."
        if sample_titles:
            description = f"{description} Includes: {', '.join(str(title) for title in sample_titles)}."

        drafts.append(
            CollectionDraft(
                name=name,
                description=description,
                keywords=keywords,
                reel_ids=[str(reels[reel_idx]["id"]) for reel_idx in cluster],
            )
        )

    return drafts
