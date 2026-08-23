require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const riderRoutes = require("./routes/riderRoutes");
const orderBookingRoutes = require("./routes/orderBookingRoutes");
const menuRoutes = require("./routes/menuRoutes");

// ============================================================
// APP ENTRY POINT
// ------------------------------------------------------------
// Sets up Express, connects to the shared "FoodBackend" MongoDB
// database, and mounts one CRUD router per collection so the
// frontend can call any of them over HTTP.
// ============================================================
const app = express();

app.use(cors()); // allow the Next.js frontend (any origin) to call this API
app.use(express.json()); // parse JSON request bodies

app.get("/", (req, res) => {
  res.send("FoodEgo backend API is running");
});

// One router per MongoDB collection shown in Atlas.
app.use("/api/users", userRoutes); // users collection (register/login + CRUD)
app.use("/api/admin", adminRoutes); // admin collection
app.use("/api/restaurants", restaurantRoutes); // restaurant collection
app.use("/api/riders", riderRoutes); // rider collection
app.use("/api/orders", orderBookingRoutes); // orderBooking collection
app.use("/api/menu", menuRoutes); // menu collection

// Catch-all for unknown routes.
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

const PORT = process.env.PORT || 8000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
