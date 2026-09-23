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

// ============================================================
// UPDATE (security-hardening fix): every route below this point used to
// have NO auth check at all — anyone who guessed or enumerated a Mongo
// ObjectId could read/overwrite/delete ANY user's profile, favorites, or
// saved addresses on this publicly-deployed API, not just the customer
// who owns them. They now require a valid `protect` JWT AND that the
// caller's own userId matches the `:id` in the URL (or the caller is an
// admin). Callers on the Next.js side (src/app/api/v1/client/*) were
// updated to mint and send that token via `backendFetchAsUser` instead of
// calling in as an anonymous "trusted server" — see that repo's
// src/lib/backend.ts for the token-minting helper.
// ============================================================
function isSelfOrAdmin(req, res, targetId) {
  if (req.user.role === "admin" || req.user.userId === targetId) return true;
  res.status(403).json({ success: false, message: "You may only access your own account" });
  return false;
}

// --- STEP 4: Get every user (admin only) ------------------------
// GET /api/users
router.get("/", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admins only" });
    }
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 5: Get a single user by id ---------------------------
// GET /api/users/:id
router.get("/:id", protect, async (req, res) => {
  try {
    if (!isSelfOrAdmin(req, res, req.params.id)) return;
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
router.put("/:id", protect, async (req, res) => {
  try {
    if (!isSelfOrAdmin(req, res, req.params.id)) return;
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
router.delete("/:id", protect, async (req, res) => {
  try {
    if (!isSelfOrAdmin(req, res, req.params.id)) return;
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, message: "User deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 8: Get a user's favorites -----------------------------------
// GET /api/users/:id/favorites
router.get("/:id/favorites", protect, async (req, res) => {
  try {
    if (!isSelfOrAdmin(req, res, req.params.id)) return;
    const user = await User.findById(req.params.id).select("favorites");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, data: user.favorites || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 9: Toggle a favorite on/off ------------------------------------
// POST /api/users/:id/favorites   body: { "foodId": "food-1" }
router.post("/:id/favorites", protect, async (req, res) => {
  try {
    if (!isSelfOrAdmin(req, res, req.params.id)) return;
    const { foodId } = req.body;
    if (!foodId) {
      return res.status(400).json({ success: false, message: "foodId is required" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const favorites = user.favorites || [];
    const index = favorites.indexOf(foodId);
    if (index >= 0) {
      favorites.splice(index, 1);
    } else {
      favorites.push(foodId);
    }
    user.favorites = favorites;
    await user.save();

    res.status(200).json({ success: true, data: user.favorites });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 10: Get a user's saved addresses --------------------------------
// GET /api/users/:id/addresses
router.get("/:id/addresses", protect, async (req, res) => {
  try {
    if (!isSelfOrAdmin(req, res, req.params.id)) return;
    const user = await User.findById(req.params.id).select("addresses");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, data: user.addresses || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 11: Add a new address -------------------------------------------
// POST /api/users/:id/addresses
router.post("/:id/addresses", protect, async (req, res) => {
  try {
    if (!isSelfOrAdmin(req, res, req.params.id)) return;
    const { label, fullName, phone, addressLine, city } = req.body;
    if (!fullName || !addressLine || !city) {
      return res.status(400).json({ success: false, message: "fullName, addressLine and city are required" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isDefault = (user.addresses || []).length === 0;
    user.addresses.push({ label: label || "Home", fullName, phone, addressLine, city, isDefault });
    await user.save();

    res.status(201).json({ success: true, data: user.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 12: Update an existing address -----------------------------------
// PUT /api/users/:id/addresses/:addressId
router.put("/:id/addresses/:addressId", protect, async (req, res) => {
  try {
    if (!isSelfOrAdmin(req, res, req.params.id)) return;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    const { label, fullName, phone, addressLine, city } = req.body;
    if (label !== undefined) address.label = label;
    if (fullName !== undefined) address.fullName = fullName;
    if (phone !== undefined) address.phone = phone;
    if (addressLine !== undefined) address.addressLine = addressLine;
    if (city !== undefined) address.city = city;

    await user.save();
    res.status(200).json({ success: true, data: user.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 13: Set an address as the default one -----------------------------
// PATCH /api/users/:id/addresses/:addressId/default
router.patch("/:id/addresses/:addressId/default", protect, async (req, res) => {
  try {
    if (!isSelfOrAdmin(req, res, req.params.id)) return;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let found = false;
    user.addresses.forEach((address) => {
      const isMatch = address._id.toString() === req.params.addressId;
      address.isDefault = isMatch;
      if (isMatch) found = true;
    });

    if (!found) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    await user.save();
    res.status(200).json({ success: true, data: user.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 14: Delete an address --------------------------------------------
// DELETE /api/users/:id/addresses/:addressId
router.delete("/:id/addresses/:addressId", protect, async (req, res) => {
  try {
    if (!isSelfOrAdmin(req, res, req.params.id)) return;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }
    const wasDefault = address.isDefault;
    address.deleteOne();

    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
    res.status(200).json({ success: true, data: user.addresses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
