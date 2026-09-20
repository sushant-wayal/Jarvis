import { execSync } from 'child_process';
import path from 'path';

export default async function globalSetup() {
  const brainDir = path.resolve(__dirname, '../../..');
  const schemaPath = path.resolve(brainDir, 'prisma/schema.test.prisma');

  // Push schema to SQLite test.db and generate the test client
  execSync(`npx prisma db push --schema="${schemaPath}" --accept-data-loss`, {
    stdio: 'inherit',
    cwd: brainDir,
  });
}
