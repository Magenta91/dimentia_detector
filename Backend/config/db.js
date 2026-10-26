import { MongoClient } from "mongodb";
import "dotenv/config";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is required in environment variables");
}

const client = new MongoClient(uri, {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

let isConnected = false;

export const connectDatabase = async () => {
  if (!isConnected) {
    try {
      await client.connect();
      await client.db().admin().ping();
      isConnected = true;
      console.log("Connected to MongoDB Atlas");
    } catch (error) {
      console.error("MongoDB connection failed:", error.message);
      throw error;
    }
  }
  return client.db();
};

export const getDatabase = () => {
  if (!isConnected) {
    throw new Error("Database not connected. Call connectDatabase() first.");
  }
  return client.db();
};

export const checkDatabaseConnection = async () => {
  try {
    const db = await connectDatabase();
    await db.admin().ping();
    return {
      ok: 1,
      database: db.databaseName,
      timestamp: new Date()
    };
  } catch (error) {
    throw new Error(`Database connection check failed: ${error.message}`);
  }
};

export const closeDatabase = async () => {
  if (isConnected) {
    await client.close();
    isConnected = false;
    console.log("MongoDB connection closed");
  }
};

export default { connectDatabase, getDatabase, checkDatabaseConnection, closeDatabase };
