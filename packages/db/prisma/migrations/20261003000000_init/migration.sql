-- CreateTable
CREATE TABLE "installations" (
    "id" SERIAL NOT NULL,
    "github_installation_id" BIGINT NOT NULL,
    "account_login" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" SERIAL NOT NULL,
    "installation_id" INTEGER NOT NULL,
    "github_repo_id" BIGINT NOT NULL,
    "full_name" TEXT NOT NULL,
    "default_branch" TEXT,
    "config" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pull_requests" (
    "id" SERIAL NOT NULL,
    "repository_id" INTEGER NOT NULL,
    "github_pr_number" INTEGER NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "state" TEXT DEFAULT 'open',
    "head_sha" TEXT,
    "opened_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "merged_at" TIMESTAMP(3),

    CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" SERIAL NOT NULL,
    "pull_request_id" INTEGER NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verdict" TEXT,
    "summary" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "latency_ms" INTEGER,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_issues" (
    "id" SERIAL NOT NULL,
    "review_id" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "line_number" INTEGER,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "suggested_fix" TEXT,
    "source" TEXT NOT NULL DEFAULT 'llm',
    "confidence" DOUBLE PRECISION,
    "fingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "github_comment_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_reviews" (
    "id" SERIAL NOT NULL,
    "pull_request_id" INTEGER,
    "commit_sha" TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "error_stack" TEXT,
    "failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_id" TEXT,
    "job_data" JSONB,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "failed_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" SERIAL NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "action" TEXT,
    "repository_id" INTEGER,
    "installation_id" BIGINT,
    "payload" JSONB,
    "status_code" INTEGER NOT NULL DEFAULT 200,
    "error_message" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" SERIAL NOT NULL,
    "issue_id" INTEGER,
    "review_id" INTEGER,
    "user_id" TEXT,
    "helpful" BOOLEAN NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "installations_github_installation_id_key" ON "installations"("github_installation_id");

-- CreateIndex
CREATE INDEX "idx_installations_login" ON "installations"("account_login");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_github_repo_id_key" ON "repositories"("github_repo_id");

-- CreateIndex
CREATE INDEX "idx_repositories_installation" ON "repositories"("installation_id");

-- CreateIndex
CREATE INDEX "idx_repositories_full_name" ON "repositories"("full_name");

-- CreateIndex
CREATE INDEX "idx_pull_requests_repo" ON "pull_requests"("repository_id");

-- CreateIndex
CREATE INDEX "idx_pull_requests_state" ON "pull_requests"("state");

-- CreateIndex
CREATE INDEX "idx_pull_requests_opened_at" ON "pull_requests"("opened_at");

-- CreateIndex
CREATE INDEX "idx_pull_requests_head_sha" ON "pull_requests"("head_sha");

-- CreateIndex
CREATE UNIQUE INDEX "pull_requests_repository_id_github_pr_number_key" ON "pull_requests"("repository_id", "github_pr_number");

-- CreateIndex
CREATE INDEX "idx_reviews_pr" ON "reviews"("pull_request_id");

-- CreateIndex
CREATE INDEX "idx_reviews_status" ON "reviews"("status");

-- CreateIndex
CREATE INDEX "idx_reviews_completed_at" ON "reviews"("completed_at");

-- CreateIndex
CREATE INDEX "idx_reviews_commit_sha" ON "reviews"("commit_sha");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_pull_request_id_commit_sha_key" ON "reviews"("pull_request_id", "commit_sha");

-- CreateIndex
CREATE INDEX "idx_issues_review" ON "review_issues"("review_id");

-- CreateIndex
CREATE INDEX "idx_issues_fingerprint" ON "review_issues"("fingerprint");

-- CreateIndex
CREATE INDEX "idx_issues_severity" ON "review_issues"("severity");

-- CreateIndex
CREATE INDEX "idx_issues_category" ON "review_issues"("category");

-- CreateIndex
CREATE INDEX "idx_issues_status" ON "review_issues"("status");

-- CreateIndex
CREATE INDEX "idx_issues_comment_id" ON "review_issues"("github_comment_id");

-- CreateIndex
CREATE INDEX "idx_issues_file_path" ON "review_issues"("file_path");

-- CreateIndex
CREATE INDEX "idx_failed_reviews_pr" ON "failed_reviews"("pull_request_id");

-- CreateIndex
CREATE INDEX "idx_failed_reviews_resolved" ON "failed_reviews"("resolved_at");

-- CreateIndex
CREATE INDEX "idx_failed_reviews_failed_at" ON "failed_reviews"("failed_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_delivery_id_key" ON "webhook_deliveries"("delivery_id");

-- CreateIndex
CREATE INDEX "idx_webhook_delivery_id" ON "webhook_deliveries"("delivery_id");

-- CreateIndex
CREATE INDEX "idx_webhook_received_at" ON "webhook_deliveries"("received_at");

-- CreateIndex
CREATE INDEX "idx_feedback_issue" ON "feedback"("issue_id");

-- CreateIndex
CREATE INDEX "idx_feedback_review" ON "feedback"("review_id");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_pull_request_id_fkey" FOREIGN KEY ("pull_request_id") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_issues" ADD CONSTRAINT "review_issues_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failed_reviews" ADD CONSTRAINT "failed_reviews_pull_request_id_fkey" FOREIGN KEY ("pull_request_id") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "review_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
