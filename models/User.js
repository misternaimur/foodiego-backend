const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ============================================================
// USER MODEL -> "users" collection
// ------------------------------------------------------------
// This is what was missing before: a real account record with a
// hashed password, saved into MongoDB so a user can register and
// log in straight through this API. Previously only Firebase
// held the login/auth data on the frontend side, so the "users"
// collection in MongoDB stayed empty.
//
// "uid" is kept optional so accounts created by the Next.js/
// Firebase flow (which store uid + no password) can still live
// in the same physical "users" collection without conflicts.
// ============================================================
const userSchema = new mongoose.Schema(
  {
    uid: { type: String, trim: true }, // set only for Firebase-created accounts
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false, // never comes back in a normal query
    },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    role: {
      type: String,
      enum: ["customer", "restaurant", "rider", "admin"],
      default: "customer",
    },
  },
  { timestamps: true }
);

// Hash the password automatically before saving, but only when it changed.
// Async pre-hooks in Mongoose must not take a `next` callback param -
// returning the promise (via async/await) is how completion is signaled.
userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Used by the login route to check a plain-text password against the hash.
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Third argument pins the collection name to "users" exactly as shown in Atlas.
module.exports = mongoose.model("User", userSchema, "users");
