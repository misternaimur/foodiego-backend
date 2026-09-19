const mongoose = require("mongoose");

// ============================================================
// RIDER MODEL -> "rider" collection
// ------------------------------------------------------------
// Delivery-partner profile. Linked back to its login account in
// the "users" collection (role: "rider") through userId.
// ============================================================
// UPDATE (order-lifecycle fix): this schema had drifted badly from the real
// documents in the "rider" collection, which are actually written by the
// frontend's own registration flow (foodiego/src/models/Rider.ts). Real
// documents use `fullName`, `address`, `city`, `photoUrl`, `rating` -
// none of which this schema declared - so any Express route reading a
// Rider through this model silently got `undefined` for all of them
// (Mongoose strips fields a schema doesn't declare). This broke the new
// GET /api/orders/available-for-rider route's city match. `name` is kept
// as a deprecated alias so nothing that still writes to it (if anything
// does) throws a validation error, but it's no longer required and nothing
// here reads it - `fullName` is the real field.
const riderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fullName: { type: String, required: true, trim: true },
    name: { type: String, trim: true }, // deprecated alias, see note above
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    vehicleType: {
      type: String,
      enum: ["bike", "bicycle", "scooter", "car", "motorcycle"],
      default: "bike",
    },
    vehicleNumber: { type: String, trim: true },
    licenseNumber: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
    isAvailable: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    currentLocation: {
      lat: { type: Number },
      lng: { type: Number },
    },
    // The frontend's rider GPS push (foodiego/src/app/api/v1/rider/location/
    // route.ts) writes these flat fields, not the nested currentLocation
    // above - kept both since currentLocation predates this fix and nothing
    // has migrated off it yet.
    currentLat: { type: Number },
    currentLng: { type: Number },
    locationUpdatedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rider", riderSchema, "rider");
