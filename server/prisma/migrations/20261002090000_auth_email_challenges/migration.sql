-- Additive migration: existing identity, password and business rows stay intact.
ALTER TABLE "User"
    ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
    ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_authVersion_nonnegative"
    CHECK ("authVersion" >= 0);

CREATE TYPE "AuthChallengePurpose" AS ENUM ('REGISTRATION', 'EMAIL_VERIFICATION', 'PASSWORD_RESET');
CREATE TYPE "AuthChallengeDeliveryState" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');

CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "AuthChallengePurpose" NOT NULL,
    "userId" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "secretHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "deliveryState" "AuthChallengeDeliveryState" NOT NULL DEFAULT 'PENDING',
    "resendAllowedAt" TIMESTAMP(3) NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthChallenge_generation_nonnegative" CHECK ("generation" >= 0),
    CONSTRAINT "AuthChallenge_attempts_nonnegative" CHECK ("attempts" >= 0),
    CONSTRAINT "AuthChallenge_sendCount_nonnegative" CHECK ("sendCount" >= 0),
    CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AuthChallenge_verificationId_key" ON "AuthChallenge"("verificationId");
CREATE UNIQUE INDEX "AuthChallenge_secretHash_key" ON "AuthChallenge"("secretHash");
CREATE UNIQUE INDEX "AuthChallenge_email_purpose_key" ON "AuthChallenge"("email", "purpose");
CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");
