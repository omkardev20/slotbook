import app from './app.ts';
import { env } from './config/env.ts';
import { db } from './db/client.ts';

app.listen(env.PORT, (error) => {
  if (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
  console.log(`SlotBook API listening on http://localhost:${env.PORT}`);
  console.log(`Swagger docs at http://localhost:${env.PORT}/docs`);
  void confirmDatabase();
});

// The listen line only means the port is open. This asks the database a real
// question, the same one GET /ready uses.
async function confirmDatabase(): Promise<void> {
  try {
    await db.execute('SELECT 1');
    console.log(`Database connected (${databaseLabel()})`);
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

function databaseLabel(): string {
  if (env.TURSO_DATABASE_URL.startsWith('file:')) return 'local file';
  try {
    return new URL(env.TURSO_DATABASE_URL).host;
  } catch {
    return 'database';
  }
}
