
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getDatabase } from "../config/db.js";

export const Login = async (email, password) => {
  const normalizedEmail = String(email).trim().toLowerCase();
  const db = getDatabase();
  
  const user = await db.collection("users").findOne({
    email: normalizedEmail
  });

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new Error("Invalid email or password");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  const token = jwt.sign(
    { userId: user._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  return {
    message: "Login successful",
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email
    }
  };
};


export const Register = async (name, email, password, refer_by) => {
  const normalizedName = String(name).trim();
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!normalizedName || !normalizedEmail || String(password).length < 8) {
    throw new Error("Name, email, and a password of at least 8 characters are required");
  }

  const db = getDatabase();
  
  // Check if user already exists
  const existing = await db.collection("users").findOne({
    email: normalizedEmail
  });
  
  if (existing) {
    const error = new Error("An account with this email already exists");
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  
  const result = await db.collection("users").insertOne({
    name: normalizedName,
    email: normalizedEmail,
    password_hash: hashedPassword,
    refer_by: refer_by || null,
    created_at: new Date()
  });

  return {
    message: "Account creation successful",
    user: {
      id: result.insertedId.toString(),
      name: normalizedName,
      email: normalizedEmail
    }
  };
};
