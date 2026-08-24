const express = require("express");
const OrderBooking = require("../models/OrderBooking");
const MenuItem = require("../models/MenuItem");
const Restaurant = require("../models/Restaurant");
const { protect } = require("../middleware/auth");

// ============================================================
// THIS IS THE ORDER BOOKING CRUD API
// ------------------------------------------------------------
// Create / read / update / delete food orders that live in the
// "orderBooking" collection. Each order links a customer (User),
// a restaurant (Restaurant), and optionally a rider (Rider) once
// one has been assigned to deliver it.
// ============================================================
const router = express.Router();

// --- STEP 1: Create an order (a customer places a booking) --------
// POST /api/orders
router.post("/", async (req, res) => {
  try {
    const { items } = req.body;
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (!item.menuItemId) {
          return res.status(400).json({ success: false, message: "Missing menuItemId in order item" });
        }
        const menuItem = await MenuItem.findById(item.menuItemId);
        if (!menuItem) {
          return res.status(400).json({ success: false, message: `Invalid menuItemId: ${item.menuItemId}` });
        }
        if (menuItem.isAvailable === false) {
          return res.status(400).json({ success: false, message: `Item is unavailable: ${menuItem.name}` });
        }
      }
    }

    const order = await OrderBooking.create(req.body);
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2: Get every order -----------------------------------------
// GET /api/orders
router.get("/", async (req, res) => {
  try {
    const orders = await OrderBooking.find()
      .populate("customerId", "name email")
      .populate("restaurantId", "restaurantName")
      .populate("riderId", "name")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 3: Get a single order by id -----------------------------------
// GET /api/orders/:id
router.get("/:id", async (req, res) => {
  try {
    const order = await OrderBooking.findById(req.params.id)
      .populate("customerId", "name email")
      .populate("restaurantId", "restaurantName")
      .populate("riderId", "name");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 4: Update an order (e.g. change status, assign a rider) ---------
// PUT /api/orders/:id
router.put("/:id", async (req, res) => {
  try {
    const order = await OrderBooking.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 5: Delete/cancel an order ----------------------------------------
// DELETE /api/orders/:id
router.delete("/:id", async (req, res) => {
  try {
    const order = await OrderBooking.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.status(200).json({ success: true, message: "Order deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 6: Get orders for a specific restaurant -------------------
// GET /api/orders/restaurant/:restaurantId
router.get("/restaurant/:restaurantId", protect, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    if (restaurant.userId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: "Not authorized to view this restaurant's orders" });
    }

    const orders = await OrderBooking.find({ restaurantId: req.params.restaurantId })
      .populate("customerId", "name email")
      .populate("riderId", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 7: Update order status --------------------------------------
// PUT /api/orders/:id/status
router.put("/:id/status", protect, async (req, res) => {
  try {
    const order = await OrderBooking.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const restaurant = await Restaurant.findById(order.restaurantId);
    if (!restaurant || restaurant.userId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: "Not authorized to update this order's status" });
    }

    if (req.body.status) {
      order.status = req.body.status;
      await order.save();
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
