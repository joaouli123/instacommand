-- X automations: new nullable columns and the per-account agent unique key, created
-- ahead of `prisma db push` so it never stops on the unique-constraint warning.
ALTER TYPE "AutomationPlatform" ADD VALUE IF NOT EXISTS 'X';
ALTER TABLE "SocialAutomation" ADD COLUMN IF NOT EXISTS "xAccountId" TEXT;
ALTER TABLE "AutomationTemplate" ADD COLUMN IF NOT EXISTS "xAccountId" TEXT;
ALTER TABLE "InstagramAgentSettings" ADD COLUMN IF NOT EXISTS "xAccountId" TEXT;
ALTER TABLE "AutomationExecution" ADD COLUMN IF NOT EXISTS "xAccountId" TEXT;
ALTER TABLE "AutomationConversation" ADD COLUMN IF NOT EXISTS "xAccountId" TEXT;
ALTER TABLE "XAccount" ADD COLUMN IF NOT EXISTS "automationSinceId" TEXT;
ALTER TABLE "XAccount" ADD COLUMN IF NOT EXISTS "automationSyncAt" TIMESTAMP(3);
ALTER TABLE "XAccount" ADD COLUMN IF NOT EXISTS "automationSyncError" VARCHAR(500);
ALTER TABLE "XAccount" ADD COLUMN IF NOT EXISTS "metricsSyncError" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "InstagramAgentSettings_xAccountId_platform_key" ON "InstagramAgentSettings"("xAccountId", "platform");
