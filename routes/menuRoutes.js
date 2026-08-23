const express = require("express");
const MenuItem = require("../models/MenuItem");
const Restaurant = require("../models/Restaurant");
const { protect } = require("../middleware/auth");

const router = express.Router();

// POST /api/menu
router.post("/", protect, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.body.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    if (restaurant.userId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: "Not authorized to modify this restaurant's menu" });
    }

    const menuItem = await MenuItem.create(req.body);
    res.status(201).json({ success: true, data: menuItem });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/menu/restaurant/:restaurantId
router.get("/restaurant/:restaurantId", async (req, res) => {
  try {
    const menuItems = await MenuItem.find({ restaurantId: req.params.restaurantId });
    res.status(200).json({ success: true, count: menuItems.length, data: menuItems });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/menu/:id
router.get("/:id", async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);
    if (!menuItem) {
      return res.status(404).json({ success: false, message: "Menu item not found" });
    }
    res.status(200).json({ success: true, data: menuItem });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/menu/:id
router.put("/:id", protect, async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);
    if (!menuItem) {
      return res.status(404).json({ success: false, message: "Menu item not found" });
    }

    const restaurant = await Restaurant.findById(menuItem.restaurantId);
    if (!restaurant || restaurant.userId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: "Not authorized to modify this item" });
    }

    const updatedItem = await MenuItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({ success: true, data: updatedItem });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/menu/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);
    if (!menuItem) {
      return res.status(404).json({ success: false, message: "Menu item not found" });
    }

    const restaurant = await Restaurant.findById(menuItem.restaurantId);
    if (!restaurant || restaurant.userId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: "Not authorized to modify this item" });
    }

    await MenuItem.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Menu item deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
