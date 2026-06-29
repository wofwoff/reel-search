FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Environment defaults
ENV PORT=8080
# Cookie file is mounted from Secret Manager at runtime (Cloud Run secret volume), not baked into the image.
ENV YT_DLP_COOKIE_FILE=/secrets/instagram-cookies.txt

EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
