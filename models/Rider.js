const mongoose = require("mongoose");

// ============================================================
// RIDER MODEL -> "rider" collection
// ------------------------------------------------------------
// Delivery-partner profile. Linked to its login account through
// userId. Rider-specific information is stored here.
// ============================================================
const riderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    vehicleType: {
      type: String,
      enum: ["bike", "bicycle", "scooter", "car"],
      default: "bike",
    },

    vehicleNumber: {
      type: String,
      trim: true,
    },

    licenseNumber: {
      type: String,
      trim: true,
    },

    // Rider online/offline availability
    isAvailable: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // Rider rating used in dashboard
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 4.8,
    },

    currentLocation: {
      lat: {
        type: Number,
      },
      lng: {
        type: Number,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rider", riderSchema, "rider");