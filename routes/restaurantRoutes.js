const express = require("express");
const Restaurant = require("../models/Restaurant");
const { protect } = require("../middleware/auth");

// ============================================================
// THIS IS THE RESTAURANT CRUD API
// ------------------------------------------------------------
// Create / read / update / delete restaurant business profiles
// that live in the "restaurant" collection. Each profile is
// linked to its login account in the "users" collection via
// userId.
// ============================================================
const router = express.Router();

// --- STEP 1: Create a restaurant profile -------------------------
// POST /api/restaurants
router.post("/", async (req, res) => {
  try {
    const restaurant = await Restaurant.create(req.body);
    res.status(201).json({ success: true, data: restaurant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2: Get every restaurant -----------------------------------
// GET /api/restaurants
router.get("/", async (req, res) => {
  try {
    const restaurants = await Restaurant.find().populate("userId", "name email role");
    res.status(200).json({ success: true, count: restaurants.length, data: restaurants });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2.5: Get own restaurant profile -----------------------
// GET /api/restaurants/me
router.get("/me", protect, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ userId: req.user.userId }).populate("userId", "name email role");
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    res.status(200).json({ success: true, data: restaurant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2.6: Update own restaurant profile --------------------
// PUT /api/restaurants/me
router.put("/me", protect, async (req, res) => {
  try {
    const restaurant = await Restaurant.findOneAndUpdate(
      { userId: req.user.userId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    res.status(200).json({ success: true, data: restaurant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2.7: Update vendor status -----------------------------
// PATCH /api/restaurants/me/status
router.patch("/me/status", protect, async (req, res) => {
  try {
    const { vendorStatus } = req.body;
    const restaurant = await Restaurant.findOneAndUpdate(
      { userId: req.user.userId },
      { vendorStatus },
      { new: true, runValidators: true }
    );
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    res.status(200).json({ success: true, data: restaurant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 3: Get a single restaurant by id --------------------------
// GET /api/restaurants/:id
router.get("/:id", async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id).populate("userId", "name email role");
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    res.status(200).json({ success: true, data: restaurant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 4: Update a restaurant profile ------------------------------
// PUT /api/restaurants/:id
router.put("/:id", async (req, res) => {
  try {
    const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    res.status(200).json({ success: true, data: restaurant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 5: Delete a restaurant profile ---------------------------------
// DELETE /api/restaurants/:id
router.delete("/:id", async (req, res) => {
  try {
    const restaurant = await Restaurant.findByIdAndDelete(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    res.status(200).json({ success: true, message: "Restaurant deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
