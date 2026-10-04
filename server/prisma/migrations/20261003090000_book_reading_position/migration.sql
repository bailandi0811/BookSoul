CREATE TABLE "BookReadingPosition" (
    "ownerId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "offset" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookReadingPosition_pkey" PRIMARY KEY ("ownerId", "bookId"),
    CONSTRAINT "BookReadingPosition_offset_check" CHECK ("offset" >= 0),
    CONSTRAINT "BookReadingPosition_revision_check" CHECK ("revision" > 0)
);

CREATE INDEX "BookReadingPosition_bookId_idx" ON "BookReadingPosition"("bookId");
CREATE INDEX "BookReadingPosition_sectionId_idx" ON "BookReadingPosition"("sectionId");

ALTER TABLE "BookReadingPosition" ADD CONSTRAINT "BookReadingPosition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookReadingPosition" ADD CONSTRAINT "BookReadingPosition_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookReadingPosition" ADD CONSTRAINT "BookReadingPosition_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "BookSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
