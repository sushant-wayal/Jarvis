import 'dotenv/config';
import { dataRetentionService } from '../src/modules/brain/data-retention-service';

async function main() {
  console.log('--- Triggering Data Retention Cleanup ---');
  const result = await dataRetentionService.cleanupAllExpired();
  console.log('Cleanup Result:', JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Cleanup execution error:', err);
    process.exit(1);
  });
