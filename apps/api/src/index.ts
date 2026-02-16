import { createApp } from './app.js';
import { logger } from './lib/logger.js';

const app = createApp();
const PORT = parseInt(process.env.API_PORT || '4000', 10);

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'DXER API server started');
});

export default app;
