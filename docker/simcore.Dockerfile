# Simcore API server, built from a pinned commit of dgarcoe/simcore (a fork of
# https://github.com/elisonfrank/simcore with the agent life cycle).
FROM python:3.12-slim

ARG SIMCORE_REPO=https://github.com/dgarcoe/simcore
ARG SIMCORE_REF=9d06f9ff109e5c5dafc905ebcf94b2a0aebf768b
ENV SIMCORE_REPO=$SIMCORE_REPO SIMCORE_REF=$SIMCORE_REF

# Fetch the source tarball for the pinned ref (no git needed in the image).
RUN python - <<'PY'
import io, os, shutil, tarfile, urllib.request
repo = os.environ["SIMCORE_REPO"].removesuffix(".git")
ref = os.environ["SIMCORE_REF"]
data = urllib.request.urlopen(f"{repo}/archive/{ref}.tar.gz").read()
with tarfile.open(fileobj=io.BytesIO(data)) as tar:
    root = tar.getnames()[0].split("/")[0]
    tar.extractall("/tmp/src", filter="data")
shutil.move(f"/tmp/src/{root}", "/app")
shutil.rmtree("/app/dashboard", ignore_errors=True)
PY

WORKDIR /app
# Editable install: Simcore looks for built-in scenarios next to its source (/app/scenarios).
RUN pip install --no-cache-dir -e .

# Example scenarios for the UI themes (spaceship, warehouse, factory, space battle).
COPY scenarios/ /app/scenarios/

# Local fallback for cloud models without API keys (see docker/sitecustomize.py).
COPY docker/sitecustomize.py /opt/simcore-ui/sitecustomize.py
ENV PYTHONPATH=/opt/simcore-ui

ENV PYTHONUNBUFFERED=1
EXPOSE 8420
# `manage` serves the API without a running simulation; the UI lists and launches scenarios.
CMD ["simcore", "manage", "--port", "8420"]
