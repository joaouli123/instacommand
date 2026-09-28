#!/bin/sh
set -eu
cd /app
npx prisma db push --schema /checks/legacy-conversations-schema.prisma --skip-generate
node tests/conversation-migration.cjs --seed
npx prisma db execute --file prisma/upgrades/20260928_conversations.sql --schema prisma/schema.prisma
npx prisma generate
npx prisma db push --skip-generate
node tests/conversation-migration.cjs
npx prisma db execute --file prisma/upgrades/20260928_conversations.sql --schema prisma/schema.prisma
node tests/conversation-migration.cjs
node --test tests/conversation-integration.cjs
