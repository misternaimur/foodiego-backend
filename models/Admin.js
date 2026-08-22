const mongoose = require("mongoose");

// ============================================================
// ADMIN MODEL -> "admin" collection
// ------------------------------------------------------------
// Extra profile data for a platform administrator. Every admin
// still has a login record in the "users" collection (role:
// "admin"); this document just links to it (userId) and stores
// admin-only details such as permissions.
// ============================================================
const adminSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    permissions: {
      type: [String],
      default: ["manage_users", "manage_restaurants", "manage_riders", "manage_orders"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema, "admin");
