-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "inputsHash" TEXT,
ADD COLUMN     "rulesVersion" TEXT,
ADD COLUMN     "templateVersion" TEXT;

-- AlterTable
ALTER TABLE "Signal" ADD COLUMN     "ingestRunId" TEXT,
ADD COLUMN     "parserVersion" TEXT;

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "httpStatus" INTEGER,
    "contentHash" TEXT,
    "snapshotPath" TEXT,
    "warnings" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalAuditEvent" (
    "id" TEXT NOT NULL,
    "signalId" TEXT,
    "sourceKey" TEXT,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestRun_sourceKey_startedAt_idx" ON "IngestRun"("sourceKey", "startedAt");

-- CreateIndex
CREATE INDEX "IngestRun_status_idx" ON "IngestRun"("status");

-- CreateIndex
CREATE INDEX "IngestRun_createdAt_idx" ON "IngestRun"("createdAt");

-- CreateIndex
CREATE INDEX "SignalAuditEvent_signalId_createdAt_idx" ON "SignalAuditEvent"("signalId", "createdAt");

-- CreateIndex
CREATE INDEX "SignalAuditEvent_sourceKey_createdAt_idx" ON "SignalAuditEvent"("sourceKey", "createdAt");

-- CreateIndex
CREATE INDEX "SignalAuditEvent_action_createdAt_idx" ON "SignalAuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Signal_ingestRunId_idx" ON "Signal"("ingestRunId");

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_ingestRunId_fkey" FOREIGN KEY ("ingestRunId") REFERENCES "IngestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalAuditEvent" ADD CONSTRAINT "SignalAuditEvent_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
