import { beforeEach, afterEach } from 'vitest';
import { prisma } from './prisma';

export async function clearDatabase() {
  try {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');
    await prisma.$executeRawUnsafe('DELETE FROM "Message";');
    await prisma.$executeRawUnsafe('DELETE FROM "ToolExecution";');
    await prisma.$executeRawUnsafe('DELETE FROM "AgentStep";');
    await prisma.$executeRawUnsafe('DELETE FROM "AgentRun";');
    await prisma.$executeRawUnsafe('DELETE FROM "Conversation";');
    await prisma.$executeRawUnsafe('DELETE FROM "Memory";');
    await prisma.$executeRawUnsafe('DELETE FROM "TaskExecution";');
    await prisma.$executeRawUnsafe('DELETE FROM "Notification";');
    await prisma.$executeRawUnsafe('DELETE FROM "Task";');
    await prisma.$executeRawUnsafe('DELETE FROM "Device";');
    await prisma.$executeRawUnsafe('DELETE FROM "UserLocationState";');
    await prisma.$executeRawUnsafe('DELETE FROM "KnownPlace";');
    await prisma.$executeRawUnsafe('DELETE FROM "EventReminder";');
    await prisma.$executeRawUnsafe('DELETE FROM "UserEvent";');
    await prisma.$executeRawUnsafe('DELETE FROM "User";');
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  } catch {
    // Non-DB tests or uninitialized DB gracefully skip
  }
}

beforeEach(async () => {
  await clearDatabase();
});

afterEach(async () => {
  await clearDatabase();
});
