import json
import psycopg
from google import genai
from google.genai import types
from pydantic import BaseModel
from app.config import get_settings

class Resource(BaseModel):
    title: str
    url: str

class ReelAnalysis(BaseModel):
    title: str
    summary: str
    actionable_items: list[str]
    resources: list[Resource]

def migrate():
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not configured.")
        return

    print("Connecting to database...")
    conn = psycopg.connect(settings.database_url)
    
    # Query all reels that do not have resources populated yet
    cur = conn.cursor()
    cur.execute("SELECT id, title, caption FROM reels WHERE resources IS NULL")
    reels = cur.fetchall()
    
    if not reels:
        print("No reels found that need migration.")
        return

    print(f"Found {len(reels)} reel(s) to process.")
    
    client = genai.Client(
        vertexai=True,
        project=settings.google_cloud_project,
        location=settings.google_cloud_location
    )

    for reel_id, title, caption in reels:
        print(f"\nProcessing reel {reel_id} (Title: {title})...")
        text_content = f"Title: {title or 'None'}\nCaption: {caption or 'None'}"
        
        prompt = (
            "Analyze the following Instagram reel title and caption. Based on the text, provide:\n"
            "1. A short, descriptive, and engaging title (5-10 words) summarizing the core topic.\n"
            "2. A detailed summary explaining what the content is about.\n"
            "3. A list of all useful actionable items/takeaways.\n"
            "4. A list of any external useful resources (such as GitHub repositories, URLs, documentation, "
            "websites, or tools) explicitly mentioned or shown in the text. If none are mentioned, return an empty list.\n\n"
            f"Reel Text:\n{text_content}"
        )
        
        try:
            resp = client.models.generate_content(
                model="gemini-3.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ReelAnalysis,
                )
            )
            analysis = json.loads(resp.text)
            ai_title = analysis.get("title") or title
            summary = analysis.get("summary")
            actionable_items = json.dumps(analysis.get("actionable_items", []))
            resources = json.dumps(analysis.get("resources", []))
            
            # Update database
            cur.execute(
                """
                UPDATE reels 
                SET title = %s, summary = %s, actionable_items = %s, resources = %s 
                WHERE id = %s
                """,
                (ai_title, summary, actionable_items, resources, reel_id)
            )
            conn.commit()
            print(f"Successfully migrated reel {reel_id}!")
            print(f"  AI Title: {ai_title}")
            print(f"  Resources: {resources}")
        except Exception as e:
            print(f"Failed to process reel {reel_id}: {e}")
            conn.rollback()

    cur.close()
    conn.close()
    print("\nMigration completed successfully!")

if __name__ == "__main__":
    migrate()
