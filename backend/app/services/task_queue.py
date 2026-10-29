import logging

from fastapi import HTTPException

from app.config import Settings

logger = logging.getLogger(__name__)

WORKER_PATH = "/internal/ingest"
# Cloud Run's request timeout is the real cap; keep Cloud Tasks' deadline just under it.
DISPATCH_DEADLINE_SECONDS = 1500


class CloudTasksQueue:
    """Enqueues ingest jobs as authenticated HTTP calls back to this service."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from google.cloud import tasks_v2

            self._client = tasks_v2.CloudTasksClient()
        return self._client

    def enqueue(self, job_id: str, retry_key: str | None = None) -> None:
        """Queue a job. Pass a fresh retry_key to re-dispatch a job whose earlier task is gone:
        Cloud Tasks refuses a reused task name for about an hour after that task finishes."""
        from google.api_core.exceptions import AlreadyExists
        from google.cloud import tasks_v2
        from google.protobuf import duration_pb2

        s = self.settings
        parent = self.client.queue_path(s.google_cloud_project, s.tasks_location, s.tasks_queue)
        base = s.tasks_worker_url.rstrip("/")
        task = tasks_v2.Task(
            # A deterministic name makes enqueueing idempotent per job (and per recovery).
            name=f"{parent}/tasks/ingest-{job_id}" + (f"-{retry_key}" if retry_key else ""),
            http_request=tasks_v2.HttpRequest(
                http_method=tasks_v2.HttpMethod.POST,
                url=f"{base}{WORKER_PATH}/{job_id}",
                oidc_token=tasks_v2.OidcToken(
                    service_account_email=s.tasks_invoker_service_account,
                    audience=base,
                ),
            ),
            dispatch_deadline=duration_pb2.Duration(seconds=DISPATCH_DEADLINE_SECONDS),
        )
        try:
            self.client.create_task(parent=parent, task=task)
        except AlreadyExists:
            logger.info("Ingest task for job %s already enqueued", job_id)


def verify_worker_request(authorization: str | None, settings: Settings) -> None:
    """Reject anything that isn't a Cloud Tasks call signed by the invoker service account."""
    if not settings.uses_cloud_tasks:
        raise HTTPException(status_code=404, detail="Not found")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing worker credentials")

    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        claims = id_token.verify_oauth2_token(
            authorization.split(" ", 1)[1],
            google_requests.Request(),
            audience=settings.tasks_worker_url.rstrip("/"),
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid worker credentials") from exc

    if claims.get("email") != settings.tasks_invoker_service_account or not claims.get("email_verified"):
        raise HTTPException(status_code=403, detail="Worker caller not allowed")
