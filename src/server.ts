import app from './app.ts';

const port = Number(process.env.PORT ?? 3000);

app.listen(port, (error) => {
  if (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
  console.log(`SlotBook API listening on http://localhost:${port}`);
});
