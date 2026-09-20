import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to database...');
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          conversations: true,
          memories: true,
          tasks: true,
          notifications: true,
          events: true,
          eventReminders: true,
          knownPlaces: true,
        },
      },
    },
  });

  console.log(`Found ${users.length} total users in DB:`);
  for (const user of users) {
    console.log(`- User ID: ${user.id} | Name: ${user.name} | Created: ${user.createdAt.toISOString()}`);
    console.log(`  Counts:`, user._count);
  }

  // Identify test users
  const testUserPatterns = [
    'test',
    'user-confirm-test',
  ];

  const testUsers = users.filter((u) => {
    const lowerId = u.id.toLowerCase();
    const lowerName = u.name.toLowerCase();
    return testUserPatterns.some((pattern) => lowerId.includes(pattern)) || lowerName === 'test user';
  });

  console.log(`\nIdentified ${testUsers.length} test users to delete.`);

  if (testUsers.length > 0) {
    for (const testUser of testUsers) {
      console.log(`Deleting test user ${testUser.id} (${testUser.name})...`);
      // Delete child records explicitly first to ensure nothing is missed if cascade is app-level
      await prisma.eventReminder.deleteMany({ where: { userId: testUser.id } });
      await prisma.userEvent.deleteMany({ where: { userId: testUser.id } });
      await prisma.knownPlace.deleteMany({ where: { userId: testUser.id } });
      await prisma.userLocationState.deleteMany({ where: { userId: testUser.id } });
      await prisma.notification.deleteMany({ where: { userId: testUser.id } });
      await prisma.taskExecution.deleteMany({ where: { task: { userId: testUser.id } } });
      await prisma.task.deleteMany({ where: { userId: testUser.id } });
      await prisma.agentStep.deleteMany({ where: { agentRun: { userId: testUser.id } } });
      await prisma.agentRun.deleteMany({ where: { userId: testUser.id } });
      await prisma.toolExecution.deleteMany({ where: { conversation: { userId: testUser.id } } });
      await prisma.message.deleteMany({ where: { conversation: { userId: testUser.id } } });
      await prisma.conversation.deleteMany({ where: { userId: testUser.id } });
      await prisma.memory.deleteMany({ where: { userId: testUser.id } });
      await prisma.device.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } });
      console.log(`Deleted test user ${testUser.id}.`);
    }
  }

  // Also check for orphaned test records if any
  const orphanedMemories = await prisma.memory.findMany({
    where: {
      OR: [
        { content: { contains: 'Darshan' } },
        { content: { contains: 'shellfish' } },
        { content: { contains: 'black coffee' } },
        { content: { contains: 'oat milk' } },
        { content: { contains: 'gym routine' } },
        { content: { contains: 'bullet points' } },
      ],
    },
  });
  if (orphanedMemories.length > 0) {
    console.log(`Found ${orphanedMemories.length} orphaned test memories, deleting...`);
    await prisma.memory.deleteMany({
      where: { id: { in: orphanedMemories.map((m) => m.id) } },
    });
  }

  // Orphaned events
  const testEvents = await prisma.userEvent.findMany({
    where: {
      OR: [
        { title: { contains: 'Goa Trip' } },
      ],
    },
  });
  if (testEvents.length > 0) {
    console.log(`Found ${testEvents.length} test events, deleting...`);
    await prisma.eventReminder.deleteMany({
      where: { eventId: { in: testEvents.map((e) => e.id) } },
    });
    await prisma.userEvent.deleteMany({
      where: { id: { in: testEvents.map((e) => e.id) } },
    });
  }

  console.log('\nDatabase cleanup complete!');
}

main()
  .catch((e) => {
    console.error('Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
