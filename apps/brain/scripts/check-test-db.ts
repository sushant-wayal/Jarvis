// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('../src/lib/db/generated/test-client');

async function main() {
  const client = new PrismaClient();
  const users = await client.user.findMany();
  const memories = await client.memory.findMany();
  const convs = await client.conversation.findMany();
  const tasks = await client.task.findMany();
  const notifs = await client.notification.findMany();

  console.log(`[test.db check] Users: ${users.length}, Memories: ${memories.length}, Conversations: ${convs.length}, Tasks: ${tasks.length}, Notifications: ${notifs.length}`);
  await client.$disconnect();
}

main().catch(console.error);
