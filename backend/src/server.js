const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/database');

const startServer = async () => {
  try {
    // Establish database connection
    await connectDB();

    const server = app.listen(env.PORT, () => {
      console.log(`VoltSense Backend running in [${env.NODE_ENV}] mode on port ${env.PORT}`);
      console.log(`Health endpoint available at http://localhost:${env.PORT}/api/health`);
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        console.log('HTTP server closed.');
        await disconnectDB();
        console.log('Database disconnected. Process exiting.');
        process.exit(0);
      });

      // Force shutdown if taking too long
      setTimeout(() => {
        console.error('Forced shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Failed to start VoltSense Backend server:', error.message);
    process.exit(1);
  }
};

startServer();
