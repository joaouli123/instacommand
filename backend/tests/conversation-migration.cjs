const assert = require('node:assert/strict');
if (process.env.AUTOMATION_INTEGRATION_TEST !== '1' || !process.env.DATABASE_URL?.includes('@test-db:5432/instacommand_test')) throw new Error('Dedicated isolated test database required.');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function run() {
  if (process.argv.includes('--seed')) {
    await db.user.create({ data: { id: 'migration-owner', name: 'Fixture migration', email: 'migration@fixture.invalid' } });
    await db.instagramAccount.create({ data: { id: 'migration-account', userId: 'migration-owner', igUserId: 'migration-ig', igUsername: 'migration', pageId: 'migration-page', pageAccessToken: 'not-a-real-token' } });
    for (const mode of ['TEMPLATE', 'AI']) await db.socialAutomation.create({ data: { id: `migration-${mode}`, userId: 'migration-owner', accountId: 'migration-account', name: `Existing ${mode}`, trigger: 'MESSAGE_KEYWORD', keywords: ['test-only'], replyMode: mode, enabled: true } });
    await db.instagramAgentSettings.create({ data: { id: 'migration-agent', userId: 'migration-owner', accountId: 'migration-account', enabled: true, autoSend: true, knowledgeBase: 'Preserve this fixture' } });
    await db.automationExecution.create({ data: { accountId: 'migration-account', eventKey: 'migration-received', eventType: 'MESSAGE_ANY', status: 'SENT', eventText: 'Preserve history', responseText: 'Preserve response', privateReplySent: true } });
  } else {
    const rules = await db.socialAutomation.findMany({ where: { accountId: 'migration-account' } });
    assert.equal(rules.length, 2);
    assert.ok(rules.every(rule => rule.enabled && rule.platform === 'INSTAGRAM' && !rule.continueConversation));
    const agent = await db.instagramAgentSettings.findUnique({ where: { accountId_platform: { accountId: 'migration-account', platform: 'INSTAGRAM' } } });
    assert.equal(agent.knowledgeBase, 'Preserve this fixture'); assert.equal(agent.autoSend, true);
    const old = await db.automationExecution.findUnique({ where: { eventKey: 'migration-received' } });
    assert.equal(old.eventText, 'Preserve history'); assert.equal(old.status, 'SENT');
    console.log('Legacy migration preserved both enabled rules, settings, and sent history; conversation continuation remains disabled.');
  }
}
run().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
