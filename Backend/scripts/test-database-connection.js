import "dotenv/config";
import { connectDatabase, checkDatabaseConnection, closeDatabase } from "../config/db.js";

try {
  await connectDatabase();
  const status = await checkDatabaseConnection();
  
  console.log("Database connection: SUCCESS");
  console.log(`Database: ${status.database || "unknown"}`);
  console.log("MongoDB Atlas: connected");
  console.log("Ping: passed");
} catch (error) {
  console.error("Database connection: FAILED");
  console.error("Message:", error.message || "connection failed");
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
