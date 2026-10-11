-- Additive only. Do not apply to an existing database without deployment review.
ALTER TABLE "IngestionJob" ADD COLUMN "leaseToken" TEXT;
CREATE TYPE "BookUploadStatus" AS ENUM ('UPLOADING', 'FINALIZING', 'COMMITTED', 'CANCELLED', 'EXPIRED');
CREATE TABLE "BookUploadSession" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "declaredBytes" INTEGER NOT NULL,
  "declaredHash" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "stagingKey" TEXT NOT NULL,
  "multipartId" TEXT,
  "partSize" INTEGER,
  "status" "BookUploadStatus" NOT NULL DEFAULT 'UPLOADING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "bookId" TEXT,
  "cleanupKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cleanedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookUploadSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookUploadSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BookUploadSession_declaredBytes_check" CHECK ("declaredBytes" > 0 AND "declaredBytes" <= 52428800)
);
CREATE UNIQUE INDEX "BookUploadSession_stagingKey_key" ON "BookUploadSession"("stagingKey");
CREATE UNIQUE INDEX "BookUploadSession_ownerId_requestId_key" ON "BookUploadSession"("ownerId", "requestId");
CREATE INDEX "BookUploadSession_ownerId_status_expiresAt_idx" ON "BookUploadSession"("ownerId", "status", "expiresAt");
CREATE INDEX "BookUploadSession_expiresAt_cleanedAt_idx" ON "BookUploadSession"("expiresAt", "cleanedAt");
