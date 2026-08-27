-- CreateTable
CREATE TABLE "ChatSessionRecord" (
    "sessionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSessionRecord_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "UserProfileRecord" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "preferences" JSONB NOT NULL,
    "facts" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfileRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryRecord" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatSessionRecord_ownerId_updatedAt_idx" ON "ChatSessionRecord"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfileRecord_ownerId_sessionId_key" ON "UserProfileRecord"("ownerId", "sessionId");

-- CreateIndex
CREATE INDEX "UserProfileRecord_ownerId_idx" ON "UserProfileRecord"("ownerId");

-- CreateIndex
CREATE INDEX "MemoryRecord_ownerId_sessionId_idx" ON "MemoryRecord"("ownerId", "sessionId");

-- CreateIndex
CREATE INDEX "MemoryRecord_ownerId_level_idx" ON "MemoryRecord"("ownerId", "level");
