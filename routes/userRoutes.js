const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

// ============================================================
// THIS IS THE USERS CRUD + LOGIN API
// ------------------------------------------------------------
// Handles creating an account, logging in, and the usual CRUD
// operations on the "users" collection. Registering here saves
// a real, password-protected record to MongoDB, so the "users"
// collection is actually populated and that same account can log
// in again later through this API.
// ============================================================
const router = express.Router();

function signToken(user) {
  return jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

// --- STEP 1: Register a new account -------------------------
// POST /api/users/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, phone, address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "name, email and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: "An account with this email already exists" });
    }

    // Password is hashed automatically by the User model's pre-save hook.
    const user = await User.create({ name, email, password, role, phone, address });

    const token = signToken(user);
    const { password: _omit, ...safeUser } = user.toObject();

    res.status(201).json({ success: true, data: safeUser, token });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2: Log in with email + password ---------------------
// POST /api/users/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "email and password are required" });
    }

    // .select("+password") because the schema hides password by default.
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const token = signToken(user);
    const { password: _omit, ...safeUser } = user.toObject();

    res.status(200).json({ success: true, data: safeUser, token });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 3: Get the currently logged-in user's profile -------
// GET /api/users/me  (requires Authorization: Bearer <token>)
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 4: Get every user (e.g. for an admin dashboard) ------
// GET /api/users
router.get("/", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 5: Get a single user by id ---------------------------
// GET /api/users/:id
router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 6: Update a user's profile ----------------------------
// PUT /api/users/:id
router.put("/:id", async (req, res) => {
  try {
    const { name, phone, address, role } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, phone, address, role },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 7: Delete a user ----------------------------------------
// DELETE /api/users/:id
router.delete("/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, message: "User deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
