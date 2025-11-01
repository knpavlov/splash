import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { registerAppRoutes } from './setupRoutes.js';
import { runMigrations } from '../shared/database/migrations.js';

const bootstrap = async () => {
  // Ensure the database is ready before serving requests
  await runMigrations();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  registerAppRoutes(app);

  const port = process.env.PORT || 4000;

  app.listen(port, () => {
    // Log server startup
    console.log(`API server is running on port ${port}`);
  });
};

bootstrap().catch((error) => {
  console.error('Failed to start the server:', error);
  process.exit(1);
});
