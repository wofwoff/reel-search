import json

from app.config import Settings


DOCUMENT_INSTRUCTION = (
    "Represent this Instagram reel for retrieval by natural-language user memories."
)
QUERY_INSTRUCTION = (
    "Represent this search query for retrieving matching saved Instagram reels."
)


class EmbeddingError(RuntimeError):
    pass


class VertexEmbeddingProvider:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None

    @property
    def client(self):
        if self._client is None:
            if not self.settings.has_vertex:
                raise EmbeddingError("GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are required")
            from google import genai

            self._client = genai.Client(
                vertexai=True,
                project=self.settings.google_cloud_project,
                location=self.settings.google_cloud_location,
            )
        return self._client

    def embed_query(self, query: str) -> list[float]:
        from google.genai import types

        content = types.Content(
            parts=[types.Part.from_text(text=f"{QUERY_INSTRUCTION}\nquery: {query}")]
        )
        response = self.client.models.embed_content(
            model=self.settings.embedding_model,
            contents=[content],
            config=types.EmbedContentConfig(
                output_dimensionality=self.settings.embedding_dim
            ),
        )
        return list(response.embeddings[0].values)

    def embed_video(self, gcs_uri: str, mime_type: str, title: str | None = None) -> list[float]:
        import json
        from pathlib import Path
        from app.services.storage import guess_mime_type

        try:
            uris = json.loads(gcs_uri)
            if isinstance(uris, list):
                # Retrieve and average embeddings for all items in the carousel
                embeddings = []
                for uri in uris:
                    mtype = guess_mime_type(Path(uri))
                    emb = self.embed_single_media(uri, mtype, title)
                    embeddings.append(emb)
                if not embeddings:
                    raise EmbeddingError("No embeddings generated for slides")
                dim = len(embeddings[0])
                avg_emb = [0.0] * dim
                for emb in embeddings:
                    for i in range(dim):
                        avg_emb[i] += emb[i]
                for i in range(dim):
                    avg_emb[i] /= len(embeddings)
                return avg_emb
        except Exception:
            pass

        return self.embed_single_media(gcs_uri, mime_type, title)

    def embed_single_media(self, gcs_uri: str, mime_type: str, title: str | None = None) -> list[float]:
        from google.genai import types

        text = DOCUMENT_INSTRUCTION
        if title:
            text = f"{text}\ntitle: {title}"

        if mime_type.startswith("video/"):
            content = types.Content(
                parts=[
                    types.Part.from_text(text=text),
                    types.Part(
                        file_data=types.FileData(file_uri=gcs_uri, mime_type=mime_type),
                        video_metadata=types.VideoMetadata(
                            fps=self.settings.video_fps,
                            start_offset="0s",
                            end_offset=f"{self.settings.video_end_offset_seconds}s",
                        ),
                    ),
                ]
            )
            config = types.EmbedContentConfig(
                output_dimensionality=self.settings.embedding_dim,
                audio_track_extraction=True,
            )
        else:
            content = types.Content(
                parts=[
                    types.Part.from_text(text=text),
                    types.Part(
                        file_data=types.FileData(file_uri=gcs_uri, mime_type=mime_type),
                    ),
                ]
            )
            config = types.EmbedContentConfig(
                output_dimensionality=self.settings.embedding_dim,
            )

        response = self.client.models.embed_content(
            model=self.settings.embedding_model,
            contents=[content],
            config=config,
        )
        return list(response.embeddings[0].values)

    def generate_summary(self, gcs_uri: str, mime_type: str) -> dict:
        from google.genai import types
        from pydantic import BaseModel
        from pathlib import Path
        from app.services.storage import guess_mime_type

        class Resource(BaseModel):
            title: str
            url: str

        class ReelAnalysis(BaseModel):
            title: str
            summary: str
            actionable_items: list[str]
            resources: list[Resource]

        parts = []
        import json
        try:
            uris = json.loads(gcs_uri)
            if isinstance(uris, list):
                for uri in uris:
                    mtype = guess_mime_type(Path(uri))
                    parts.append(types.Part(file_data=types.FileData(file_uri=uri, mime_type=mtype)))
        except Exception:
            pass

        if not parts:
            parts.append(types.Part(file_data=types.FileData(file_uri=gcs_uri, mime_type=mime_type)))

        prompt = (
            "Analyze this media content (which may contain multiple slides/photos/videos). Please provide:\n"
            "1. A short, descriptive, and engaging title (5-10 words) summarizing the core topic.\n"
            "2. A detailed summary explaining what the content is about across all files.\n"
            "3. A list of all useful actionable items/takeaways.\n"
            "4. A list of any external useful resources (such as GitHub repositories, URLs, documentation, "
            "websites, or tools) explicitly mentioned or shown. If none are mentioned, return an empty list."
        )
        parts.append(types.Part.from_text(text=prompt))

        response = self.client.models.generate_content(
            model="gemini-3.5-flash",
            contents=parts,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ReelAnalysis,
            ),
        )
        import json
        try:
            return json.loads(response.text)
        except Exception:
            return {"title": "Reel Summary", "summary": response.text, "actionable_items": [], "resources": []}

    def classify_collections(self, reels: list[dict]) -> list[dict]:
        from typing import Literal

        from google.genai import types
        from pydantic import BaseModel, Field

        Domain = Literal[
            "Arts & Creativity",
            "Food & Cooking",
            "Technology",
            "Career & Education",
            "Health & Fitness",
            "Entertainment",
            "Travel & Places",
            "Business & Finance",
            "Lifestyle",
            "Other",
        ]

        class ClassifiedCollection(BaseModel):
            domain: Domain
            name: str = Field(description="Specific subject or craft, usually 1-3 words")
            description: str
            keywords: list[str]
            reel_ids: list[str]

        class CollectionPlan(BaseModel):
            collections: list[ClassifiedCollection]

        reel_context = [
            {
                "id": str(reel["id"]),
                "title": reel.get("title"),
                "summary": reel.get("summary"),
                "caption": reel.get("caption"),
                "actionable_items": reel.get("actionable_items"),
                "resources": reel.get("resources"),
            }
            for reel in reels
        ]
        prompt = (
            "Organize this saved-reel library by what each reel is actually about. "
            "Use a broad human-interest domain and a specific topic or craft name. "
            "Group semantically similar reels together and assign every supplied reel ID exactly once.\n\n"
            "Choose domain from the schema. Topic names should look like Motion Design, Video Editing, "
            "Singing, Cooking, Developer Tools, or Job Search. Prioritize the skill, art form, subject, "
            "or outcome discussed. Do not name a collection GitHub, Repositories, Instagram, YouTube, "
            "Claude Code, or another source/enabling tool unless that tool itself is genuinely the lesson. "
            "For example, a Claude Code workflow that edits videos belongs under Video Editing; a GitHub "
            "repository for animations belongs under Motion Design. Keep descriptions concise and useful.\n\n"
            f"Reels:\n{json.dumps(reel_context, ensure_ascii=False)}"
        )

        response = self.client.models.generate_content(
            model="gemini-3.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=CollectionPlan,
            ),
        )
        parsed = json.loads(response.text)
        collections = parsed.get("collections")
        return collections if isinstance(collections, list) else []
