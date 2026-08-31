const mongoose = require("mongoose");

// ============================================================
// RIDER MODEL -> "rider" collection
// ------------------------------------------------------------
// Delivery-partner profile. Linked back to its login account in
// the "users" collection (role: "rider") through userId.
// ============================================================
const riderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    vehicleType: {
      type: String,
      enum: ["bike", "bicycle", "scooter", "car"],
      default: "bike",
    },
    vehicleNumber: { type: String, trim: true },
    licenseNumber: { type: String, trim: true },
    isAvailable: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    currentLocation: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rider", riderSchema, "rider");
