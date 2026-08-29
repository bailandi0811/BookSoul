-- Session identifiers are generated on the client and are only unique inside an
-- account.  Making the owner part of the primary key prevents one account from
-- reserving or probing another account's session id.
ALTER TABLE "ChatSessionRecord"
DROP CONSTRAINT "ChatSessionRecord_pkey";

ALTER TABLE "ChatSessionRecord"
ADD CONSTRAINT "ChatSessionRecord_pkey" PRIMARY KEY ("ownerId", "sessionId");
