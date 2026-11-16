-- CreateTable
CREATE TABLE "AppealRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "companyName" TEXT NOT NULL,
    "reportId" TEXT,
    "signalId" TEXT,
    "category" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "contact" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppealRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppealRequest_companyId_createdAt_idx" ON "AppealRequest"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AppealRequest_status_createdAt_idx" ON "AppealRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AppealRequest_contact_createdAt_idx" ON "AppealRequest"("contact", "createdAt");
