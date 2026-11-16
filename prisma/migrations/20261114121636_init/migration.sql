-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "pinyinInitials" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creditCode" TEXT,
    "establishedAt" TIMESTAMP(3),
    "capital" TEXT,
    "status" TEXT,
    "city" TEXT,
    "industry" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "period" TEXT,
    "value" JSONB NOT NULL,
    "severity" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "sourcePublishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "snapshotPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "dataCutoff" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelVersion" TEXT NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewFeedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roundsBand" TEXT,
    "daysToResultBand" TEXT,
    "askedPrivacy" TEXT,
    "testTaskBand" TEXT,
    "rejectionBand" TEXT,
    "anonymousKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JdPhrase" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "interpretation" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "sourceNote" TEXT,

    CONSTRAINT "JdPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportFeedback" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_normalized_key" ON "Company"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "Company_creditCode_key" ON "Company"("creditCode");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Company_pinyinInitials_idx" ON "Company"("pinyinInitials");

-- CreateIndex
CREATE INDEX "Company_city_idx" ON "Company"("city");

-- CreateIndex
CREATE INDEX "Signal_companyId_type_idx" ON "Signal"("companyId", "type");

-- CreateIndex
CREATE INDEX "Signal_companyId_period_idx" ON "Signal"("companyId", "period");

-- CreateIndex
CREATE INDEX "Signal_fetchedAt_idx" ON "Signal"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_cacheKey_key" ON "Report"("cacheKey");

-- CreateIndex
CREATE INDEX "Report_companyId_generatedAt_idx" ON "Report"("companyId", "generatedAt");

-- CreateIndex
CREATE INDEX "InterviewFeedback_companyId_createdAt_idx" ON "InterviewFeedback"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewFeedback_companyId_anonymousKey_key" ON "InterviewFeedback"("companyId", "anonymousKey");

-- CreateIndex
CREATE UNIQUE INDEX "JdPhrase_phrase_key" ON "JdPhrase"("phrase");

-- CreateIndex
CREATE INDEX "ReportFeedback_reportId_idx" ON "ReportFeedback"("reportId");

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportFeedback" ADD CONSTRAINT "ReportFeedback_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
