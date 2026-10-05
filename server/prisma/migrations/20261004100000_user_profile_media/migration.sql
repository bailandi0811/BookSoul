CREATE TYPE "WallpaperMode" AS ENUM ('RANDOM', 'FIXED');
CREATE TYPE "WallpaperKind" AS ENUM ('SYSTEM', 'USER');
CREATE TYPE "MediaPurpose" AS ENUM ('AVATAR', 'WALLPAPER');
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING', 'READY', 'RETIRED', 'REJECTED', 'DELETED');

ALTER TABLE "User"
  ADD COLUMN "avatarAssetId" TEXT,
  ADD COLUMN "wallpaperMode" "WallpaperMode" NOT NULL DEFAULT 'RANDOM',
  ADD COLUMN "fixedWallpaperKind" "WallpaperKind",
  ADD COLUMN "fixedWallpaperId" TEXT,
  ADD COLUMN "profileRevision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "User_profileRevision_check" CHECK ("profileRevision" >= 0),
  ADD CONSTRAINT "User_wallpaper_selection_check" CHECK (
    ("wallpaperMode" = 'RANDOM' AND "fixedWallpaperKind" IS NULL AND "fixedWallpaperId" IS NULL)
    OR ("wallpaperMode" = 'FIXED' AND "fixedWallpaperKind" IS NOT NULL AND "fixedWallpaperId" IS NOT NULL)
  );

CREATE TABLE "UserMediaAsset" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "purpose" "MediaPurpose" NOT NULL,
  "status" "MediaAssetStatus" NOT NULL DEFAULT 'PENDING',
  "uploadKey" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "declaredMime" TEXT NOT NULL,
  "declaredBytes" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "storedBytes" INTEGER,
  "uploadExpiresAt" TIMESTAMP(3) NOT NULL,
  "commitExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "retiredAt" TIMESTAMP(3),
  "stagingCleanedAt" TIMESTAMP(3),
  CONSTRAINT "UserMediaAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserMediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserMediaAsset_ready_metadata_check" CHECK (
    "status" <> 'READY' OR ("width" > 0 AND "height" > 0 AND "storedBytes" > 0 AND "width" IS NOT NULL AND "height" IS NOT NULL AND "storedBytes" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "UserMediaAsset_uploadKey_key" ON "UserMediaAsset"("uploadKey");
CREATE UNIQUE INDEX "UserMediaAsset_objectKey_key" ON "UserMediaAsset"("objectKey");
CREATE INDEX "UserMediaAsset_ownerId_purpose_status_idx" ON "UserMediaAsset"("ownerId", "purpose", "status");
CREATE INDEX "UserMediaAsset_ownerId_createdAt_idx" ON "UserMediaAsset"("ownerId", "createdAt");
CREATE INDEX "UserMediaAsset_status_commitExpiresAt_idx" ON "UserMediaAsset"("status", "commitExpiresAt");
ALTER TABLE "User" ADD CONSTRAINT "User_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "UserMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
