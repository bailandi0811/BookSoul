ALTER TABLE "CommunityMessage" ADD COLUMN "mentions" JSONB NOT NULL DEFAULT '[]';
CREATE TABLE "CommunityMessageRead" (
    "memberId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityMessageRead_pkey" PRIMARY KEY ("memberId", "messageId")
);
CREATE INDEX "CommunityMessageRead_messageId_idx" ON "CommunityMessageRead"("messageId");
ALTER TABLE "CommunityMessageRead" ADD CONSTRAINT "CommunityMessageRead_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CommunityMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMessageRead" ADD CONSTRAINT "CommunityMessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CommunityMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
