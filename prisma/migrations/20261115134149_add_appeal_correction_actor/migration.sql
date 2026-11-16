-- AlterTable
ALTER TABLE "AppealEvent" ADD COLUMN     "actor" TEXT;

-- AlterTable
ALTER TABLE "AppealRequest" ADD COLUMN     "publicNote" TEXT;

-- AlterTable
ALTER TABLE "Signal" ADD COLUMN     "correctedAt" TIMESTAMP(3),
ADD COLUMN     "correctionNote" TEXT,
ADD COLUMN     "invalidatedAt" TIMESTAMP(3);
