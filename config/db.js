// ============================================================
// MongoDB connection
// ------------------------------------------------------------
// Connects this Express backend to the SAME Atlas cluster and
// the same "FoodBackend" database that the Next.js frontend
// uses (see foodiego/src/lib/dbConnect.ts). Both apps therefore
// read/write the same five collections: admin, orderBooking,
// restaurant, rider, users.
// ============================================================
const mongoose = require("mongoose");

async function connectDB() {
  const MONGODB_URL = process.env.MONGODB_URL;

  if (!MONGODB_URL) {
    throw new Error("Missing MONGODB_URL environment variable. Check your .env file.");
  }

  mongoose.connection.on("connected", () => {
    console.log(`MongoDB connected -> database: ${mongoose.connection.name}`);
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message);
  });

  await mongoose.connect(MONGODB_URL, {
    dbName: "FoodBackend",
  });
}

module.exports = connectDB;
