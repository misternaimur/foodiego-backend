const mongoose = require("mongoose");

// ============================================================
// RESTAURANT MODEL -> "restaurant" collection
// ------------------------------------------------------------
// Business profile for a restaurant partner. Linked back to its
// login account in the "users" collection (role: "restaurant")
// through userId.
// ============================================================
const restaurantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    restaurantName: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    cuisineType: { type: String, trim: true },
    openingTime: { type: String, trim: true }, // e.g. "09:00"
    closingTime: { type: String, trim: true }, // e.g. "22:00"
    isOpen: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    logoUrl: { type: String },
    coverImageUrl: { type: String },
    description: { type: String },
    businessHours: [
      {
        day: { type: String },
        openTime: { type: String },
        closeTime: { type: String }
      }
    ],
    operatingDays: [{ type: String }],
    vendorStatus: {
      type: String,
      enum: ["open", "closed", "temporarily_closed"],
      default: "open"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Restaurant", restaurantSchema, "restaurant");
