export const getDatabaseConfig = (environment = process.env) => {
  const mongoUri = environment.MONGODB_URI;
  
  if (!mongoUri || !mongoUri.trim()) {
    return { error: "MONGODB_URI is required" };
  }

  // Basic validation
  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    return { error: "MONGODB_URI must be a valid MongoDB connection string" };
  }

  return { uri: mongoUri };
};

export const getDatabaseConfigurationError = (environment = process.env) => {
  const config = getDatabaseConfig(environment);
  return config.error || null;
};
