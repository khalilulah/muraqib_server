import { env } from "./config/env";
import { connectDB } from "./config/db";
import { startScheduler } from "./utils/scheduler";

async function main() {
  // Validate env vars and connect to DB first
  await connectDB();

  // Import app after env is confirmed valid
  const { default: app } = await import("./app");

  app.listen(env.port, () => {
    console.log(`🚀 Server running on port ${env.port} [${env.nodeEnv}]`);
  });
}

startScheduler();

main();
