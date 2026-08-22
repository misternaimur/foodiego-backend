const express = require("express");
const Admin = require("../models/Admin");

// ============================================================
// THIS IS THE ADMIN CRUD API
// ------------------------------------------------------------
// Create / read / update / delete admin profiles that live in
// the "admin" collection. Each admin profile is linked to its
// login account in the "users" collection via userId.
// ============================================================
const router = express.Router();

// --- STEP 1: Create an admin profile ---------------------------
// POST /api/admin
router.post("/", async (req, res) => {
  try {
    const admin = await Admin.create(req.body);
    res.status(201).json({ success: true, data: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2: Get every admin ------------------------------------
// GET /api/admin
router.get("/", async (req, res) => {
  try {
    const admins = await Admin.find().populate("userId", "name email role");
    res.status(200).json({ success: true, count: admins.length, data: admins });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 3: Get a single admin by id -----------------------------
// GET /api/admin/:id
router.get("/:id", async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).populate("userId", "name email role");
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    res.status(200).json({ success: true, data: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 4: Update an admin profile --------------------------------
// PUT /api/admin/:id
router.put("/:id", async (req, res) => {
  try {
    const admin = await Admin.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    res.status(200).json({ success: true, data: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 5: Delete an admin profile -----------------------------------
// DELETE /api/admin/:id
router.delete("/:id", async (req, res) => {
  try {
    const admin = await Admin.findByIdAndDelete(req.params.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    res.status(200).json({ success: true, message: "Admin deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
