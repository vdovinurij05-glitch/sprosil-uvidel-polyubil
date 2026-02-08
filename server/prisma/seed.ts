import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create test users for development
  const users = [
    { telegramId: BigInt(100001), firstName: 'Алексей', username: 'alex_test', gender: 'male' as const },
    { telegramId: BigInt(100002), firstName: 'Дмитрий', username: 'dima_test', gender: 'male' as const },
    { telegramId: BigInt(100003), firstName: 'Иван', username: 'ivan_test', gender: 'male' as const },
    { telegramId: BigInt(100004), firstName: 'Анна', username: 'anna_test', gender: 'female' as const },
    { telegramId: BigInt(100005), firstName: 'Мария', username: 'maria_test', gender: 'female' as const },
    { telegramId: BigInt(100006), firstName: 'Елена', username: 'elena_test', gender: 'female' as const },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { telegramId: user.telegramId },
      update: {},
      create: user,
    });
  }

  console.log(`Created ${users.length} test users`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
