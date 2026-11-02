import app from './app.ts';
import { env } from './config/env.ts';

app.listen(env.PORT, (error) => {
  if (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
  console.log(`SlotBook API listening on http://localhost:${env.PORT}`);
});
