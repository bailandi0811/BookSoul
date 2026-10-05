-- CreateEnum
CREATE TYPE "CommunityRemovalKind" AS ENUM ('AUTHOR', 'MODERATOR');

-- CreateEnum
CREATE TYPE "CommunityEventKind" AS ENUM ('MESSAGE_CREATED', 'MESSAGE_REMOVED', 'MEMBER_MUTED');

-- CreateTable
CREATE TABLE "CommunityRoom" (
    "id" TEXT NOT NULL,
    "lastEventSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "lastReadSeq" BIGINT NOT NULL DEFAULT 0,
    "isModerator" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "sendWindowStartedAt" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "authorMemberId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "content" TEXT,
    "replyToId" TEXT,
    "createdSeq" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removalKind" "CommunityRemovalKind",

    CONSTRAINT "CommunityMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityEvent" (
    "roomId" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "kind" "CommunityEventKind" NOT NULL,
    "messageId" TEXT,
    "targetMemberId" TEXT,
    "actorMemberId" TEXT NOT NULL,
    "reason" TEXT,
    "clientActionId" TEXT,
    "requestHash" TEXT,
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityEvent_pkey" PRIMARY KEY ("roomId","seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMember_roomId_userId_key" ON "CommunityMember"("roomId", "userId");

-- CreateIndex
CREATE INDEX "CommunityMessage_roomId_replyToId_idx" ON "CommunityMessage"("roomId", "replyToId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMessage_roomId_authorMemberId_clientMessageId_key" ON "CommunityMessage"("roomId", "authorMemberId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMessage_roomId_createdSeq_key" ON "CommunityMessage"("roomId", "createdSeq");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityEvent_roomId_actorMemberId_clientActionId_key" ON "CommunityEvent"("roomId", "actorMemberId", "clientActionId");

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CommunityRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMessage" ADD CONSTRAINT "CommunityMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CommunityRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMessage" ADD CONSTRAINT "CommunityMessage_authorMemberId_fkey" FOREIGN KEY ("authorMemberId") REFERENCES "CommunityMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMessage" ADD CONSTRAINT "CommunityMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "CommunityMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityEvent" ADD CONSTRAINT "CommunityEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CommunityRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityEvent" ADD CONSTRAINT "CommunityEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CommunityMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

