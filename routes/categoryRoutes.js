const express = require("express");
const Category = require("../models/Category");
const Restaurant = require("../models/Restaurant");
const { protect } = require("../middleware/auth");

const router = express.Router();

// POST /api/categories
router.post("/", protect, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.body.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    if (restaurant.userId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: "Not authorized to create categories for this restaurant" });
    }

    const category = await Category.create(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/categories/restaurant/:restaurantId
router.get("/restaurant/:restaurantId", async (req, res) => {
  try {
    const categories = await Category.find({ restaurantId: req.params.restaurantId });
    res.status(200).json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
