# 🚀 Production Deployment & Live Setup Guide

This guide walks you through deploying the **AI Code Review & PR Assistant** to production with independent scaling for the web dashboard (Vercel) and the background worker (Render / Railway / Fly.io).

---

## 🏗️ Architecture Split & Cloud Providers

| Service | Hosting | Why | Free Tier Option |
| :--- | :--- | :--- | :--- |
| **Web Dashboard & Webhook Receiver** (`apps/web`) | **Vercel** | Fast cold starts, automatic global CDN, lightweight route handler for webhooks | Vercel Hobby (Free) |
| **BullMQ Worker Process** (`apps/worker`) | **Render / Railway / Fly.io** | Always-on Node.js process listening continuously to the Redis queue | Render / Fly.io free tier |
| **PostgreSQL Database** | **Neon / Supabase** | Serverless Postgres with instant pooling | Neon / Supabase (Free) |
| **Redis Queue Storage** | **Upstash** | Low-latency Redis instance accessible via standard `redis://` URI | Upstash Redis (Free) |

---

## Step 1: Database & Redis Setup (5 Minutes)

### 1. Provision PostgreSQL
1. Create a free project on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Copy the connection string (`DATABASE_URL`):
   ```bash
   DATABASE_URL="postgresql://user:password@ep-xyz.us-east-1.aws.neon.tech/neondb?sslmode=require"
   ```

### 2. Provision Redis
1. Create a free Redis database on [Upstash](https://upstash.com).
2. Copy the `REDIS_URL` connection string:
   ```bash
   REDIS_URL="redis://default:token@xyz.upstash.io:6379"
   ```

### 3. Push Database Schema & Seed Data
From your local machine:
```bash
# Push Prisma schema to your remote database
npx prisma db push --schema=packages/db/prisma/schema.prisma

# (Optional) Seed realistic sample PRs and reviews
npx tsx packages/db/prisma/seed.ts
```

---

## Step 2: Register the GitHub App (2 Minutes)

1. Go to **GitHub Settings** -> **Developer Settings** -> **GitHub Apps** -> **New GitHub App**.
2. Alternatively, copy the parameters from [github-app-manifest.json](./github-app-manifest.json).
3. Set the following settings:
   - **GitHub App name**: `YourOrg-AI-Code-Reviewer`
   - **Homepage URL**: Your production dashboard URL (e.g. `https://your-dashboard.vercel.app`)
   - **Webhook URL**: `https://your-dashboard.vercel.app/api/webhooks/github`
   - **Webhook Secret**: Generate a secure random string (e.g., `openssl rand -hex 20`).
4. Set **Repository Permissions**:
   - **Pull requests**: `Read & Write` (to submit inline reviews and PR summary comments)
   - **Contents**: `Read-only` (to fetch PR diffs)
   - **Metadata**: `Read-only`
5. Under **Subscribe to events**, check:
   - `Pull request`
6. Click **Create GitHub App**.
7. In the app settings:
   - Note the **App ID** (`GITHUB_APP_ID`).
   - Scroll to **Private keys** and click **Generate a private key**. Save the downloaded `.pem` file (`GITHUB_PRIVATE_KEY`).
   - Note the **Client ID** and generate a **Client Secret** for NextAuth GitHub login.
8. Install the app on your personal account or organization and select your repositories.

---

## Step 3: Deploy Web Dashboard (`apps/web`) to Vercel

1. Push your repository to GitHub.
2. In [Vercel](https://vercel.com), click **Add New Project** and import your repo.
3. Configure the project:
   - **Root Directory**: Leave as root `./` or select `apps/web`.
   - **Build Command**: `npm run build --workspace=apps/web`
   - **Output Directory**: `.next`
4. Add Environment Variables in Vercel:
   ```env
   DATABASE_URL="postgresql://user:password@.../neondb?sslmode=require"
   REDIS_URL="redis://default:...@...upstash.io:6379"
   GITHUB_APP_ID="123456"
   GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
   GITHUB_WEBHOOK_SECRET="your-webhook-secret"
   NEXTAUTH_URL="https://your-dashboard.vercel.app"
   NEXTAUTH_SECRET="openssl-generated-secret-32-chars"
   NEXTAUTH_GITHUB_CLIENT_ID="Iv1..."
   NEXTAUTH_GITHUB_CLIENT_SECRET="..."
   ```
5. Click **Deploy**.

---

## Step 4: Deploy Worker Service (`apps/worker`) to Render / Railway

The worker requires an always-on Docker container to listen to Redis events.

### Deploying to Render
1. In [Render](https://render.com), click **New** -> **Web Service** or **Background Worker**.
2. Select your repository.
3. Set:
   - **Environment**: `Docker`
   - **Dockerfile Path**: `apps/worker/Dockerfile`
   - **Docker Context**: `.` (root directory)
4. Configure Environment Variables:
   ```env
   DATABASE_URL="postgresql://user:password@.../neondb?sslmode=require"
   REDIS_URL="redis://default:...@...upstash.io:6379"
   GITHUB_APP_ID="123456"
   GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
   LLM_PROVIDER="gemini" # or "openai" or "mock"
   GEMINI_API_KEY="AIzaSy..." # if using gemini
   OPENAI_API_KEY="sk-..."    # if using openai
   WORKER_CONCURRENCY="5"
   ```
5. Click **Create Background Worker**.

---

## Step 5: Testing the Live Deployment

1. Open any pull request in a repository where your GitHub App is installed.
2. Within ~40–60 seconds:
   - The bot posts inline comments with severity tags (`CRITICAL`, `WARNING`, `SUGGESTION`) and replacement code suggestions on changed lines.
   - The bot posts a consolidated PR review summary comment with an overall verdict (`Approved`, `Changes Requested`, `Comments`).
3. Open your Vercel web dashboard to view real-time turnaround latency, bug density, and offending files!

---

## Local Webhook Forwarding with Smee (For Local Testing)

If developing locally without deploying to Vercel:
1. Visit [smee.io](https://smee.io) and create a channel (e.g. `https://smee.io/abc123xyz`).
2. Set your GitHub App webhook URL to your smee URL.
3. In a local terminal, forward events to your local server:
   ```bash
   npx smee-client --url https://smee.io/abc123xyz --target http://localhost:3000/api/webhooks/github
   ```
4. Start your local dashboard and worker:
   ```bash
   npm run dev:web
   npm run dev:worker
   ```
Now pull requests opened on GitHub will stream directly into your local machine!
