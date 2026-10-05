-- Raise confirmed reading progress to the furthest saved resume section.
-- Idempotent: never lowers an existing mark and never changes FINISHED.

INSERT INTO "ReadingProgress" (
    "ownerId",
    "bookId",
    "mode",
    "currentSectionOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    position."ownerId",
    position."bookId",
    'IN_PROGRESS'::"ReadingMode",
    section."order",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "BookReadingPosition" AS position
JOIN "BookSection" AS section
    ON section."id" = position."sectionId"
    AND section."bookId" = position."bookId"
WHERE NOT EXISTS (
    SELECT 1
    FROM "ReadingProgress" AS progress
    WHERE progress."ownerId" = position."ownerId"
        AND progress."bookId" = position."bookId"
);

UPDATE "ReadingProgress" AS progress
SET
    "mode" = 'IN_PROGRESS',
    "currentSectionOrder" = section."order",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "BookReadingPosition" AS position
JOIN "BookSection" AS section
    ON section."id" = position."sectionId"
    AND section."bookId" = position."bookId"
WHERE progress."ownerId" = position."ownerId"
    AND progress."bookId" = position."bookId"
    AND progress."mode" <> 'FINISHED'
    AND (
        progress."mode" = 'NOT_STARTED'
        OR progress."currentSectionOrder" IS NULL
        OR progress."currentSectionOrder" < section."order"
    );
