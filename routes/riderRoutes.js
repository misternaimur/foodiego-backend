const express = require("express");
const Rider = require("../models/Rider");

// ============================================================
// THIS IS THE RIDER CRUD API
// ------------------------------------------------------------
// Create / read / update / delete delivery-rider profiles that
// live in the "rider" collection. Each profile is linked to its
// login account in the "users" collection via userId.
// ============================================================
const router = express.Router();

// --- STEP 1: Create a rider profile ------------------------------
// POST /api/riders
router.post("/", async (req, res) => {
  try {
    const rider = await Rider.create(req.body);
    res.status(201).json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2: Get every rider ---------------------------------------
// GET /api/riders
router.get("/", async (req, res) => {
  try {
    const riders = await Rider.find().populate("userId", "name email role");
    res.status(200).json({ success: true, count: riders.length, data: riders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 3: Get a single rider by id -------------------------------
// GET /api/riders/:id
router.get("/:id", async (req, res) => {
  try {
    const rider = await Rider.findById(req.params.id).populate("userId", "name email role");
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }
    res.status(200).json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 4: Update a rider profile -----------------------------------
// PUT /api/riders/:id
router.put("/:id", async (req, res) => {
  try {
    const rider = await Rider.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }
    res.status(200).json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 5: Delete a rider profile --------------------------------------
// DELETE /api/riders/:id
router.delete("/:id", async (req, res) => {
  try {
    const rider = await Rider.findByIdAndDelete(req.params.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }
    res.status(200).json({ success: true, message: "Rider deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
