#!/usr/bin/env bash
# One-time setup: call POST /internal/sweep-jobs every 10 minutes so ingest jobs whose
# worker died (and whose Cloud Tasks retries ran out) are requeued even when nobody is polling them.
# Safe to re-run; it updates the job if it already exists. Run as a project owner.
set -euo pipefail

P=reel-search-28734
R=us-central1
JOB=reel-ingest-sweeper
SCHEDULE="*/10 * * * *"
# Must match TASKS_WORKER_URL and TASKS_INVOKER_SERVICE_ACCOUNT in cloudbuild.yaml: the endpoint
# accepts only OIDC tokens for that audience, signed as that account.
API_URL=https://reel-search-api-403410843888.us-central1.run.app
INVOKER_SA=reel-search-run@$P.iam.gserviceaccount.com

echo "1/3 Cloud Scheduler API"
gcloud services enable cloudscheduler.googleapis.com --project=$P

echo "2/3 invoker can call the API service"
# Already true if Cloud Tasks ingestion works; repeated here so the sweeper doesn't depend on it.
gcloud run services add-iam-policy-binding reel-search-api --region=$R --project=$P \
  --member="serviceAccount:$INVOKER_SA" --role=roles/run.invoker --quiet >/dev/null

echo "3/3 scheduler job"
ARGS=(
  --location=$R --project=$P
  --schedule="$SCHEDULE" --time-zone=Etc/UTC
  --uri="$API_URL/internal/sweep-jobs" --http-method=POST
  --oidc-service-account-email="$INVOKER_SA" --oidc-token-audience="$API_URL"
  --attempt-deadline=300s
)
if gcloud scheduler jobs describe $JOB --location=$R --project=$P >/dev/null 2>&1; then
  gcloud scheduler jobs update http $JOB "${ARGS[@]}"
else
  gcloud scheduler jobs create http $JOB "${ARGS[@]}"
fi

echo "Done. Try it now with: gcloud scheduler jobs run $JOB --location=$R --project=$P"
echo "and check the result in the reel-search-api logs (it returns requeued/failed/errors counts)."
