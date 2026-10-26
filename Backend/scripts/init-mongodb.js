import "dotenv/config";
import { connectDatabase, closeDatabase } from "../config/db.js";

async function initializeMongoDB() {
  try {
    console.log("Connecting to MongoDB...");
    const db = await connectDatabase();

    console.log("Creating indexes...");

    // Users collection - unique email index
    await db.collection("users").createIndex(
      { email: 1 },
      { unique: true, name: "email_unique" }
    );
    console.log("✓ Created unique index on users.email");

    // Screening sessions - user_id and status for queries
    await db.collection("screening_sessions").createIndex(
      { user_id: 1, status: 1, started_at: -1 },
      { name: "user_status_started" }
    );
    console.log("✓ Created index on screening_sessions.user_id + status + started_at");

    // Task responses - screening_id and task_type for uniqueness
    await db.collection("task_responses").createIndex(
      { screening_id: 1, task_type: 1, created_at: -1 },
      { name: "screening_task_created" }
    );
    console.log("✓ Created index on task_responses.screening_id + task_type + created_at");

    // Patient profiles - screening_id for lookups
    await db.collection("screening_patient_profiles").createIndex(
      { screening_id: 1 },
      { unique: true, name: "screening_id_unique" }
    );
    console.log("✓ Created unique index on screening_patient_profiles.screening_id");

    // Screening results - screening_id for lookups
    await db.collection("screening_results").createIndex(
      { screening_id: 1 },
      { unique: true, name: "screening_id_unique" }
    );
    console.log("✓ Created unique index on screening_results.screening_id");

    // Screening results - created_at for history queries
    await db.collection("screening_results").createIndex(
      { created_at: -1 },
      { name: "created_at_desc" }
    );
    console.log("✓ Created index on screening_results.created_at");

    console.log("\nMongoDB initialization completed successfully!");
    console.log(`Database: ${db.databaseName}`);

  } catch (error) {
    console.error("MongoDB initialization failed:", error.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

initializeMongoDB();
