#!/usr/bin/env bash
# One-time setup: deploy both Cloud Run services on every push to master.
# Safe to re-run; each step skips what already exists. Run as a project owner.
set -euo pipefail

P=reel-search-28734
R=us-central1
REPO=wofwoff/reel-search
SA_NAME=reel-search-builder
SA=$SA_NAME@$P.iam.gserviceaccount.com
RUNTIME_SA=reel-search-run@$P.iam.gserviceaccount.com
CONN=reel-search-github

echo "1/5 builder service account"
gcloud iam service-accounts describe "$SA" --project=$P >/dev/null 2>&1 ||
  gcloud iam service-accounts create $SA_NAME --project=$P \
    --display-name="Reel Search Cloud Build deployer"

echo "2/5 roles (deploy services, push images, write logs)"
for role in roles/run.admin roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding $P --member="serviceAccount:$SA" \
    --role=$role --condition=None --quiet >/dev/null
done
# Needed because the deploy steps pass --service-account=reel-search-run.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project=$P \
  --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser --quiet >/dev/null

echo "3/5 GitHub connection"
# Creating the connection stores the GitHub token in Secret Manager, which the
# Cloud Build service agent (P4SA) needs permission to do.
PROJECT_NUMBER=$(gcloud projects describe $P --format="value(projectNumber)")
gcloud projects add-iam-policy-binding $P \
  --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-cloudbuild.iam.gserviceaccount.com" \
  --role=roles/secretmanager.admin --condition=None --quiet >/dev/null
if ! gcloud builds connections describe $CONN --region=$R --project=$P >/dev/null 2>&1; then
  gcloud builds connections create github $CONN --region=$R --project=$P
fi
gcloud builds connections describe $CONN --region=$R --project=$P \
  --format="value(installationState.stage,installationState.actionUri)"
echo
echo "If the stage above is not COMPLETE, open the URL in a browser, sign in as"
echo "a GitHub owner of $REPO, install the Cloud Build GitHub App on that repo,"
read -r -p "then press Enter to continue... "

echo "4/5 link repository"
gcloud builds repositories describe ${REPO//\//-} --connection=$CONN --region=$R --project=$P >/dev/null 2>&1 ||
  gcloud builds repositories create ${REPO//\//-} --connection=$CONN --region=$R --project=$P \
    --remote-uri="https://github.com/$REPO.git"

echo "5/5 trigger"
gcloud builds triggers describe reel-search-deploy --region=$R --project=$P >/dev/null 2>&1 ||
  gcloud builds triggers create github --name=reel-search-deploy --region=$R --project=$P \
    --repository="projects/$P/locations/$R/connections/$CONN/repositories/${REPO//\//-}" \
    --branch-pattern='^master$' --build-config=cloudbuild.yaml \
    --service-account="projects/$P/serviceAccounts/$SA"

echo "Done. Verify with: gcloud builds triggers list --region=$R --project=$P"
