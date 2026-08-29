-- CreateEnum
CREATE TYPE "BookVisibility" AS ENUM ('PRIVATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('QUEUED', 'PARSING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED', 'DELETING');

-- CreateEnum
CREATE TYPE "AssistantResponseDepth" AS ENUM ('BRIEF', 'BALANCED', 'DEEP');

-- CreateEnum
CREATE TYPE "AssistantTone" AS ENUM ('NATURAL', 'WARM', 'ANALYTICAL');

-- CreateEnum
CREATE TYPE "ReadingMode" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "IngestionJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "visibility" "BookVisibility" NOT NULL DEFAULT 'PRIVATE',
    "title" TEXT NOT NULL,
    "author" TEXT,
    "originalFileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "language" TEXT,
    "coverStorageKey" TEXT,
    "status" "BookStatus" NOT NULL DEFAULT 'QUEUED',
    "statusProgress" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "sectionCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "parserVersion" TEXT NOT NULL,
    "embeddingVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookSection" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sourceRef" TEXT,
    "content" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookChunk" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "sectionOrder" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "embeddingVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAssistant" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "responseDepth" "AssistantResponseDepth" NOT NULL DEFAULT 'BALANCED',
    "tone" "AssistantTone" NOT NULL DEFAULT 'NATURAL',
    "customInstruction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAssistant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "ownerId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "mode" "ReadingMode" NOT NULL DEFAULT 'NOT_STARTED',
    "currentSectionOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("ownerId", "bookId")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "status" "IngestionJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ChatSessionRecord"
ADD COLUMN "bookAssistantId" TEXT,
ADD COLUMN "title" TEXT;

-- AlterTable
ALTER TABLE "MemoryRecord"
ADD COLUMN "bookId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Book_ownerId_contentHash_key" ON "Book"("ownerId", "contentHash");
CREATE INDEX "Book_ownerId_updatedAt_idx" ON "Book"("ownerId", "updatedAt");
CREATE INDEX "Book_status_updatedAt_idx" ON "Book"("status", "updatedAt");
CREATE UNIQUE INDEX "BookSection_bookId_order_key" ON "BookSection"("bookId", "order");
CREATE INDEX "BookSection_bookId_idx" ON "BookSection"("bookId");
CREATE UNIQUE INDEX "BookChunk_sectionId_chunkIndex_embeddingVersion_key" ON "BookChunk"("sectionId", "chunkIndex", "embeddingVersion");
CREATE INDEX "BookChunk_bookId_embeddingVersion_idx" ON "BookChunk"("bookId", "embeddingVersion");
CREATE INDEX "BookChunk_bookId_sectionOrder_idx" ON "BookChunk"("bookId", "sectionOrder");
CREATE UNIQUE INDEX "BookAssistant_ownerId_bookId_key" ON "BookAssistant"("ownerId", "bookId");
CREATE INDEX "BookAssistant_bookId_idx" ON "BookAssistant"("bookId");
CREATE INDEX "ReadingProgress_bookId_idx" ON "ReadingProgress"("bookId");
CREATE UNIQUE INDEX "IngestionJob_bookId_key" ON "IngestionJob"("bookId");
CREATE INDEX "IngestionJob_status_updatedAt_idx" ON "IngestionJob"("status", "updatedAt");
CREATE INDEX "ChatSessionRecord_bookAssistantId_updatedAt_idx" ON "ChatSessionRecord"("bookAssistantId", "updatedAt");
CREATE INDEX "MemoryRecord_ownerId_bookId_idx" ON "MemoryRecord"("ownerId", "bookId");

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookSection" ADD CONSTRAINT "BookSection_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookChunk" ADD CONSTRAINT "BookChunk_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookChunk" ADD CONSTRAINT "BookChunk_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "BookSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookAssistant" ADD CONSTRAINT "BookAssistant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookAssistant" ADD CONSTRAINT "BookAssistant_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatSessionRecord" ADD CONSTRAINT "ChatSessionRecord_bookAssistantId_fkey" FOREIGN KEY ("bookAssistantId") REFERENCES "BookAssistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryRecord" ADD CONSTRAINT "MemoryRecord_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
