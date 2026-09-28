-- Additive, atomic upgrade. Existing rules, templates, agents and history are retained.
-- The same advisory transaction lock protects simultaneous rolling deployments.
DO $upgrade$
BEGIN
  PERFORM pg_advisory_xact_lock(609282601);
  IF to_regclass('"InstagramAgentSettings"') IS NOT NULL AND to_regclass('"AutomationConversation"') IS NULL THEN
    -- CreateEnum
    CREATE TYPE "AutomationPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'THREADS');

    -- CreateEnum
    CREATE TYPE "ConversationState" AS ENUM ('BOT', 'HUMAN', 'STOPPED');

    -- DropIndex
    DROP INDEX "InstagramAgentSettings_accountId_key";

    -- AlterTable
    ALTER TABLE "SocialAutomation" ADD COLUMN     "continueConversation" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "enabledAt" TIMESTAMP(3),
    ADD COLUMN     "platform" "AutomationPlatform" NOT NULL DEFAULT 'INSTAGRAM',
    ADD COLUMN     "threadsAccountId" TEXT,
    ALTER COLUMN "accountId" DROP NOT NULL;

    -- AlterTable
    ALTER TABLE "AutomationTemplate" ADD COLUMN     "platform" "AutomationPlatform" NOT NULL DEFAULT 'INSTAGRAM',
    ADD COLUMN     "threadsAccountId" TEXT,
    ALTER COLUMN "accountId" DROP NOT NULL;

    -- AlterTable
    ALTER TABLE "InstagramAgentSettings" ADD COLUMN     "maxRepliesPerHour" INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN     "memoryDays" INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN     "platform" "AutomationPlatform" NOT NULL DEFAULT 'INSTAGRAM',
    ADD COLUMN     "threadsAccountId" TEXT,
    ALTER COLUMN "accountId" DROP NOT NULL;

    -- AlterTable
    ALTER TABLE "AutomationExecution" ADD COLUMN     "conversationId" TEXT,
    ADD COLUMN     "humanReply" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "platform" "AutomationPlatform" NOT NULL DEFAULT 'INSTAGRAM',
    ADD COLUMN     "providerMessageId" VARCHAR(255),
    ADD COLUMN     "threadsAccountId" TEXT,
    ALTER COLUMN "accountId" DROP NOT NULL;

    -- AlterTable
    ALTER TABLE "ThreadsAccount" ADD COLUMN     "automationSyncAt" TIMESTAMP(3),
    ADD COLUMN     "automationSyncError" VARCHAR(500);

    -- CreateTable
    CREATE TABLE "AutomationConversation" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "accountId" TEXT,
        "threadsAccountId" TEXT,
        "platform" "AutomationPlatform" NOT NULL DEFAULT 'INSTAGRAM',
        "scopeKey" VARCHAR(255) NOT NULL,
        "senderId" VARCHAR(255) NOT NULL,
        "senderUsername" VARCHAR(100),
        "kind" VARCHAR(20) NOT NULL,
        "rootMediaId" VARCHAR(255),
        "state" "ConversationState" NOT NULL DEFAULT 'BOT',
        "stateReason" VARCHAR(500),
        "continuationRuleId" TEXT,
        "lastInboundAt" TIMESTAMP(3) NOT NULL,
        "memoryClearedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "AutomationConversation_pkey" PRIMARY KEY ("id")
    );

    -- CreateIndex
    CREATE UNIQUE INDEX "AutomationConversation_scopeKey_key" ON "AutomationConversation"("scopeKey");

    -- CreateIndex
    CREATE INDEX "AutomationConversation_userId_platform_updatedAt_idx" ON "AutomationConversation"("userId", "platform", "updatedAt");

    -- CreateIndex
    CREATE INDEX "AutomationConversation_accountId_platform_updatedAt_idx" ON "AutomationConversation"("accountId", "platform", "updatedAt");

    -- CreateIndex
    CREATE INDEX "AutomationConversation_threadsAccountId_updatedAt_idx" ON "AutomationConversation"("threadsAccountId", "updatedAt");

    -- CreateIndex
    CREATE INDEX "SocialAutomation_threadsAccountId_platform_enabled_idx" ON "SocialAutomation"("threadsAccountId", "platform", "enabled");

    -- CreateIndex
    CREATE UNIQUE INDEX "InstagramAgentSettings_accountId_platform_key" ON "InstagramAgentSettings"("accountId", "platform");

    -- CreateIndex
    CREATE UNIQUE INDEX "InstagramAgentSettings_threadsAccountId_platform_key" ON "InstagramAgentSettings"("threadsAccountId", "platform");

    -- CreateIndex
    CREATE INDEX "AutomationExecution_threadsAccountId_createdAt_idx" ON "AutomationExecution"("threadsAccountId", "createdAt");

    -- CreateIndex
    CREATE INDEX "AutomationExecution_conversationId_createdAt_idx" ON "AutomationExecution"("conversationId", "createdAt");

    -- AddForeignKey
    ALTER TABLE "SocialAutomation" ADD CONSTRAINT "SocialAutomation_threadsAccountId_fkey" FOREIGN KEY ("threadsAccountId") REFERENCES "ThreadsAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "AutomationTemplate" ADD CONSTRAINT "AutomationTemplate_threadsAccountId_fkey" FOREIGN KEY ("threadsAccountId") REFERENCES "ThreadsAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "InstagramAgentSettings" ADD CONSTRAINT "InstagramAgentSettings_threadsAccountId_fkey" FOREIGN KEY ("threadsAccountId") REFERENCES "ThreadsAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_threadsAccountId_fkey" FOREIGN KEY ("threadsAccountId") REFERENCES "ThreadsAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AutomationConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "AutomationConversation" ADD CONSTRAINT "AutomationConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "AutomationConversation" ADD CONSTRAINT "AutomationConversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- AddForeignKey
    ALTER TABLE "AutomationConversation" ADD CONSTRAINT "AutomationConversation_threadsAccountId_fkey" FOREIGN KEY ("threadsAccountId") REFERENCES "ThreadsAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $upgrade$;
