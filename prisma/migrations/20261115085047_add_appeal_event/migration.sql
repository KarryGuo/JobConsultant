-- CreateTable
CREATE TABLE "AppealEvent" (
    "id" TEXT NOT NULL,
    "appealId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppealEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppealEvent_appealId_createdAt_idx" ON "AppealEvent"("appealId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppealEvent" ADD CONSTRAINT "AppealEvent_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "AppealRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
