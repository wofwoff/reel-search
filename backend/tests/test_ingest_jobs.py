from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import main
from app.config import Settings
from app.services import ingest
from app.services.auth import get_current_user_id

USER_ID = "c0a63498-a3ff-41dd-a125-e8c3cfbb20cd"


class FakeRepo:
    def __init__(self, job, current=None):
        self.job = job
        self.current = current  # what get_job sees when the claim fails
        self.events = []
        self.created = []

    def get_job(self, job_id, user_id=None):
        return self.current

    def claim_job(self, job_id):
        if self.job is None:
            return None
        self.job["attempts"] += 1
        return dict(self.job)

    def create_reel(self, **kwargs):
        self.created.append(kwargs)
        return SimpleNamespace(id=uuid4())

    def complete_job(self, job_id, reel_id):
        self.events.append("complete")

    def fail_job(self, job_id, error):
        self.events.append(("fail", error))

    def requeue_job(self, job_id, error):
        self.events.append(("requeue", error))


class FakeEmbedder:
    def __init__(self, fail=False):
        self.fail = fail

    def embed_video(self, gcs_uri, mime_type, title):
        if self.fail:
            raise RuntimeError("vertex down")
        return [0.1, 0.2]

    def generate_summary(self, gcs_uri, mime_type):
        return {"title": "AI title", "summary": "s", "actionable_items": ["a"], "resources": []}


class FakeStorage:
    def __init__(self):
        self.deleted = []

    def download_gcs_uri_to_file(self, uri, path):
        path.write_bytes(b"video")

    def delete_video(self, uri):
        self.deleted.append(uri)


def make_job(**overrides):
    job = {
        "id": uuid4(),
        "user_id": USER_ID,
        "source_url": None,
        "canonical_url": None,
        "staged_gcs_uris": ["gs://bucket/reels/a.mp4"],
        "upload_title": "clip.mp4",
        "attempts": 0,
    }
    job.update(overrides)
    return job


@pytest.fixture(autouse=True)
def no_thumbnail(monkeypatch):
    monkeypatch.setattr(ingest, "generate_thumbnail", lambda path: None)


def run(repo, embedder=None, storage=None, settings=None, **kw):
    return ingest.run_ingest_job(
        uuid4(),
        repository=repo,
        embedder=embedder or FakeEmbedder(),
        storage=storage or FakeStorage(),
        settings=settings or Settings(),
        **kw,
    )


def test_staged_upload_job_saves_reel_and_completes():
    repo = FakeRepo(make_job())
    hook = []

    assert run(repo, after_save=hook.append) == "succeeded"

    assert repo.events == ["complete"]
    saved = repo.created[0]
    assert saved["gcs_uri"] == "gs://bucket/reels/a.mp4"
    assert saved["title"] == "AI title"
    assert saved["user_id"] == USER_ID
    assert hook == [USER_ID]


def test_finished_job_is_skipped():
    repo = FakeRepo(None, current={"status": "succeeded"})
    assert run(repo) == "skipped"
    assert repo.created == [] and repo.events == []


def test_leased_job_raises_so_the_task_is_retried_instead_of_dropped():
    repo = FakeRepo(None, current={"status": "processing"})
    with pytest.raises(ingest.JobLeaseHeld):
        run(repo)
    assert repo.created == [] and repo.events == []


def test_retries_helper_leaves_a_leased_job_to_its_owner():
    repo = FakeRepo(None, current={"status": "processing"})
    result = ingest.run_ingest_job_with_retries(
        uuid4(), repository=repo, embedder=FakeEmbedder(), storage=FakeStorage(), settings=Settings()
    )
    assert result == "skipped"


def test_transient_failure_requeues_and_reraises_so_cloud_tasks_retries():
    repo = FakeRepo(make_job())
    with pytest.raises(RuntimeError, match="vertex down"):
        run(repo, embedder=FakeEmbedder(fail=True))
    assert repo.events == [("requeue", ingest.GENERIC_ERROR)]  # internal detail stays out of the stored error


def test_final_attempt_marks_job_failed_without_raising():
    repo = FakeRepo(make_job(attempts=2))  # claim bumps this to 3 == max
    assert run(repo, embedder=FakeEmbedder(fail=True), settings=Settings(INGEST_MAX_ATTEMPTS=3)) == "failed"
    assert repo.events == [("fail", ingest.GENERIC_ERROR)]


def test_failed_url_download_without_staged_fallback_is_an_error(monkeypatch):
    from app.services.downloader import MediaDownloadError

    def boom(url):
        raise MediaDownloadError("blocked")

    monkeypatch.setattr(ingest, "download_media", boom)
    repo = FakeRepo(make_job(source_url="https://www.instagram.com/reel/x/", staged_gcs_uris=[]))
    with pytest.raises(MediaDownloadError, match="Upload the media file"):
        run(repo)


def test_retries_helper_gives_up_after_max_attempts():
    repo = FakeRepo(make_job())
    result = ingest.run_ingest_job_with_retries(
        uuid4(),
        repository=repo,
        embedder=FakeEmbedder(fail=True),
        storage=FakeStorage(),
        settings=Settings(INGEST_MAX_ATTEMPTS=2),
    )
    assert result == "failed"
    assert [e[0] for e in repo.events] == ["requeue", "fail"]


def test_worker_endpoint_is_closed_when_cloud_tasks_is_not_configured():
    with TestClient(main.app) as client:
        assert client.post(f"/internal/ingest/{uuid4()}").status_code == 404


def test_worker_endpoint_rejects_missing_credentials(monkeypatch):
    monkeypatch.setattr(
        main.settings, "tasks_queue", "q", raising=False
    )
    monkeypatch.setattr(main.settings, "tasks_worker_url", "https://api.example.run.app", raising=False)
    monkeypatch.setattr(main.settings, "google_cloud_project", "proj", raising=False)
    monkeypatch.setattr(main.settings, "tasks_invoker_service_account", "invoker@proj.iam.gserviceaccount.com", raising=False)
    with TestClient(main.app) as client:
        assert client.post(f"/internal/ingest/{uuid4()}").status_code == 401


def test_save_reel_returns_202_and_queues_instead_of_processing(monkeypatch):
    job_id = uuid4()
    job = {
        "id": job_id,
        "status": "queued",
        "attempts": 0,
        "error": None,
        "reel_id": None,
        "created_at": datetime.now(timezone.utc),
    }
    enqueued = []
    monkeypatch.setattr(main.repository, "find_by_canonical_url", lambda *a: None)
    monkeypatch.setattr(main.repository, "create_job", lambda **kw: job)
    monkeypatch.setattr(main.settings, "tasks_queue", "q", raising=False)
    monkeypatch.setattr(main.settings, "tasks_worker_url", "https://api.example.run.app", raising=False)
    monkeypatch.setattr(main.settings, "google_cloud_project", "proj", raising=False)
    monkeypatch.setattr(main.settings, "tasks_invoker_service_account", "invoker@proj.iam.gserviceaccount.com", raising=False)
    monkeypatch.setattr(main.task_queue, "enqueue", lambda job_id, retry_key=None: enqueued.append((job_id, retry_key)))
    main.app.dependency_overrides[get_current_user_id] = lambda: USER_ID
    try:
        with TestClient(main.app) as client:
            res = client.post("/api/reels", data={"url": "https://www.instagram.com/reel/abc123/"})
    finally:
        main.app.dependency_overrides.clear()

    assert res.status_code == 202
    body = res.json()
    assert body["job"]["status"] == "queued" and body["reel"] is None
    assert enqueued == [(str(job_id), None)]  # first dispatch uses the deterministic, dedup-safe task name


def test_cloud_tasks_requires_an_invoker_account_to_be_enabled():
    s = Settings(TASKS_QUEUE="q", TASKS_WORKER_URL="https://x.run.app", GOOGLE_CLOUD_PROJECT="p")
    assert not s.uses_cloud_tasks
    s.tasks_invoker_service_account = "invoker@p.iam.gserviceaccount.com"
    assert s.uses_cloud_tasks


def enable_cloud_tasks(monkeypatch):
    monkeypatch.setattr(main.settings, "tasks_queue", "q", raising=False)
    monkeypatch.setattr(main.settings, "tasks_worker_url", "https://api.example.run.app", raising=False)
    monkeypatch.setattr(main.settings, "google_cloud_project", "proj", raising=False)
    monkeypatch.setattr(main.settings, "tasks_invoker_service_account", "invoker@proj.iam.gserviceaccount.com", raising=False)


def test_worker_returns_409_while_another_worker_holds_the_lease(monkeypatch):
    enable_cloud_tasks(monkeypatch)
    monkeypatch.setattr(main, "verify_worker_request", lambda *a: None)

    def leased(*args, **kwargs):
        raise ingest.JobLeaseHeld("busy")

    monkeypatch.setattr(main, "run_ingest_job", leased)
    with TestClient(main.app) as client:
        assert client.post(f"/internal/ingest/{uuid4()}").status_code == 409


def job_row(**overrides):
    row = {
        "id": uuid4(),
        "status": "processing",
        "attempts": 1,
        "error": None,
        "reel_id": None,
        "created_at": datetime.now(timezone.utc) - timedelta(hours=2),
        "updated_at": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    row.update(overrides)
    return row


def poll_job(monkeypatch, job, recovered):
    calls = {"recover": [], "enqueue": []}
    enable_cloud_tasks(monkeypatch)
    monkeypatch.setattr(main.repository, "get_job", lambda job_id, user_id: job)

    def recover(job_id, max_attempts):
        calls["recover"].append(job_id)
        return recovered

    monkeypatch.setattr(main.repository, "recover_stale_job", recover)
    monkeypatch.setattr(main.task_queue, "enqueue", lambda job_id, retry_key=None: calls["enqueue"].append((job_id, retry_key)))
    main.app.dependency_overrides[get_current_user_id] = lambda: USER_ID
    try:
        with TestClient(main.app) as client:
            res = client.get(f"/api/jobs/{job['id']}")
    finally:
        main.app.dependency_overrides.clear()
    return res, calls


def test_polling_a_stuck_job_requeues_and_redispatches_it(monkeypatch):
    job = job_row()
    res, calls = poll_job(monkeypatch, job, recovered={**job, "status": "queued", "updated_at": datetime.now(timezone.utc)})

    assert res.status_code == 200 and res.json()["status"] == "queued"
    assert calls["recover"] == [job["id"]]
    [(job_id, retry_key)] = calls["enqueue"]
    assert job_id == str(job["id"]) and retry_key  # a fresh task name, since the old one may be reserved


def test_polling_a_stuck_job_out_of_attempts_fails_it_without_redispatch(monkeypatch):
    job = job_row(attempts=3)
    res, calls = poll_job(monkeypatch, job, recovered={**job, "status": "failed", "error": "Processing took too long."})

    assert res.json()["status"] == "failed"
    assert calls["enqueue"] == []


def test_polling_a_job_within_its_lease_leaves_it_alone(monkeypatch):
    job = job_row(updated_at=datetime.now(timezone.utc) - timedelta(minutes=5))
    res, calls = poll_job(monkeypatch, job, recovered=None)

    assert res.json()["status"] == "processing"
    assert calls["recover"] == [] and calls["enqueue"] == []


def test_upload_over_the_size_cap_is_rejected_before_staging(monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 10)
    monkeypatch.setattr(main, "UPLOAD_CHUNK_BYTES", 4)
    staged = []
    monkeypatch.setattr(main.storage_client, "upload_video", lambda path: staged.append(path))
    main.app.dependency_overrides[get_current_user_id] = lambda: USER_ID
    try:
        with TestClient(main.app) as client:
            res = client.post("/api/reels", files={"files": ("clip.mp4", b"x" * 11, "video/mp4")})
    finally:
        main.app.dependency_overrides.clear()

    assert res.status_code == 413
    assert staged == []
