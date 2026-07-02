# SonarQube Community

Self-hosted SonarQube Community Build for the Agent Arena monorepo — runs locally
via Docker Desktop, deploys to Render via Blueprint.

## What's here

- `docker-compose.yml` — local stack: SonarQube CE + PostgreSQL 15 + named volumes for data/extensions/logs/db.
- `render.yaml` — Render Blueprint with PostgreSQL + SonarQube web service + 10 GB disk.
- `.env.example` — copy to `.env` and drop in a scanner token (git-ignored).

Image versions are **pinned** (`sonarqube:26.6.0.123539-community`, `postgres:15.18-alpine`)
so every clone runs the same stack. Bump deliberately — see the note in `docker-compose.yml`.

## Local (Docker Desktop)

```bash
cd infra/sonarqube
docker compose up -d
```

First boot takes 2–4 minutes (Elasticsearch indexing + DB schema bootstrap). Watch progress with `docker compose logs -f sonarqube` and wait for `SonarQube is operational`.

- URL: <http://localhost:9000>
- Default creds: `admin` / `admin` — you'll be prompted to set a new password on first login.
- Stop: `docker compose down` (volumes persist).
- Wipe everything: `docker compose down -v`.

### Memory

SonarQube needs ~2 GB RAM available to Docker. In Docker Desktop → Settings → Resources, give the VM at least 4 GB total.

### vm.max_map_count

Elasticsearch (embedded in SQ) requires `vm.max_map_count >= 262144`. On Docker Desktop for Mac/Windows this is already set in the VM — no action needed. On Linux hosts running compose directly:

```bash
sudo sysctl -w vm.max_map_count=262144
```

(Persist by adding `vm.max_map_count=262144` to `/etc/sysctl.conf`.)

## Running a scan against the local server

The scanner config lives at the repo root in `sonar-project.properties` (already committed).
Coverage is one lcov per workspace, so generate coverage first:

```bash
# from the monorepo root
npm run test:coverage
```

Then, after generating a token in _My Account → Security_:

```bash
# from the monorepo root — mount the repo, join the compose network
docker run --rm \
  --network agent-arena-sonarqube_default \
  -e SONAR_HOST_URL=http://sonarqube:9000 \
  -e SONAR_TOKEN=<your-token> \
  -v "$(pwd):/usr/src" \
  sonarsource/sonar-scanner-cli
```

Or, if you have `sonar-scanner` installed on the host (scanner reaches SQ on `localhost:9000`):

```bash
SONAR_HOST_URL=http://localhost:9000 SONAR_TOKEN=<token> sonar-scanner
```

## Render

Self-hosted SonarQube CE deployed via Render Blueprint.

### Cost (as of 2026)

- Web service `standard`: ~$25/mo (2 GB RAM — bare minimum for SQ)
- Postgres `basic-256mb`: ~$6/mo
- Disk 10 GB: ~$2.50/mo
- **Total: ~$33/mo**

If SQ runs out of memory under real load, bump the web plan to `pro` (4 GB, ~$85/mo) and raise the `SONAR_*_JAVAOPTS` heap sizes.

### Deploy

1. **Push this folder to a git repo Render can see.** It can stay in the Agent Arena monorepo — Render just needs to read `render.yaml`.
2. In Render dashboard → **New → Blueprint** → point at the repo, set the blueprint root to `infra/sonarqube/`.
3. Render will provision the Postgres DB and the web service. The web service will fail its first deploy because `SONAR_JDBC_URL` isn't set yet — that's expected.
4. Once the DB is ready, grab its **Internal Database URL** from the Render dashboard. It looks like `postgres://sonarqube:xxx@dpg-xxxxx-a/sonarqube`.
5. On the `agent-arena-sonarqube` web service → **Environment** → set `SONAR_JDBC_URL` to:
   ```
   jdbc:postgresql://dpg-xxxxx-a/sonarqube
   ```
   (Same host/db, but `jdbc:postgresql://` prefix and **no** user/password in the URL — those come from the other env vars.)
6. Manual deploy. First boot takes 3–5 minutes (Elasticsearch indexing + DB schema bootstrap).

### First login

- URL: `https://agent-arena-sonarqube-xxxx.onrender.com`
- Default creds: `admin` / `admin` — **rotate immediately**.
- Then: create a project, generate a token, point your scanner at it.

### Known risk: Elasticsearch boot check

SonarQube's embedded Elasticsearch requires `vm.max_map_count >= 262144` on the host kernel. Render shares the host and doesn't expose `sysctl`. On most Render hosts this is already set high enough; on some it isn't. If the logs show:

```
max virtual memory areas vm.max_map_count [65530] is too low, increase to at least [262144]
```

…there's no in-container fix. Options:

- Open a Render support ticket asking them to raise it on the host.
- Move to **Fly.io** — `fly.toml` lets you pin a host pool, and you can run a privileged init to set the sysctl. Same Docker image, ~similar cost.
- Move to a plain VPS (Hetzner CX22 ~€4/mo, DO $6 droplet). `sysctl -w vm.max_map_count=262144` + `docker compose up`.

### Running scans against this server

From CI:

```yaml
# .github/workflows/sonar.yml
- uses: SonarSource/sonarqube-scan-action@v3
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    SONAR_HOST_URL: https://agent-arena-sonarqube-xxxx.onrender.com
```

Token is generated per-project in the SQ UI under _My Account → Security_.

### Things this setup intentionally skips

- **Persistent `extensions/` and `logs/`** — Render only allows one disk per service, mounted at `/opt/sonarqube/data` (the only path SQ truly cannot lose). Plugins re-download on restart; logs are ephemeral. Stream logs to Render's log drain if you need retention.
- **HTTPS / custom domain** — Render gives you `*.onrender.com` with TLS for free; add a custom domain in the dashboard if needed.
- **Backups** — Render's Postgres has automated daily backups on paid plans. The `/data` disk is not snapshotted; if you care, run `pg_dump` on a cron and ship to S3.
