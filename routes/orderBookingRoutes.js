const express = require("express");
const mongoose = require("mongoose");
const OrderBooking = require("../models/OrderBooking");
const MenuItem = require("../models/MenuItem");
const Restaurant = require("../models/Restaurant");
const Rider = require("../models/Rider");
const Notification = require("../models/Notification");
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

// UPDATE (notification-system fix): fires a real notification at every
// order-lifecycle event that used to have none at all (see
// models/Notification.js). Failures here are logged, never thrown - a
// notification that didn't save must never fail the order action that
// triggered it.
async function notify(userId, type, title, message, link) {
  if (!userId) return;
  try {
    await Notification.create({ userId, type, title, message, link });
  } catch (error) {
    console.error("Failed to create notification:", error.message);
  }
}

// --- STEP 1: Create an order (a customer places a booking) --------
// POST /api/orders
//
// items[].menuItemId only gets validated against the MenuItem collection
// when it looks like a real Mongo id - the customer-facing catalog today is
// still a static demo list (ids like "food-1"), so those pass through as
// opaque identifiers instead of being rejected.
router.post("/", async (req, res) => {
  try {
    const { items, restaurantId, restaurantName } = req.body;
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (!item.menuItemId) {
          return res.status(400).json({ success: false, message: "Missing menuItemId in order item" });
        }
        if (mongoose.Types.ObjectId.isValid(item.menuItemId)) {
          const menuItem = await MenuItem.findById(item.menuItemId);
          if (menuItem && menuItem.isAvailable === false) {
            return res.status(400).json({ success: false, message: `Item is unavailable: ${menuItem.name}` });
          }
        }
      }
    }

    const payload = { ...req.body };

    // Resolve a real Restaurant document by name when no explicit id was
    // given, so the order links to it whenever one exists.
    let restaurant = null;
    if (!restaurantId && restaurantName) {
      restaurant = await Restaurant.findOne({
        restaurantName: new RegExp(`^${restaurantName.trim()}$`, "i"),
      });
      if (restaurant) payload.restaurantId = restaurant._id;
    } else if (restaurantId) {
      restaurant = await Restaurant.findById(restaurantId);
    }

    const order = await OrderBooking.create(payload);

    if (restaurant) {
      await notify(
        restaurant.userId,
        "order_placed",
        "New order received",
        `A new order for ৳${order.totalAmount} just came in.`,
        "/vendor?tab=orders"
      );
    }

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
      .populate("riderId", "fullName")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2.5: Get recent orders (Admin only) ----------------------
// GET /api/orders/recent
router.get("/recent", protect, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Not authorized as admin" });
    }
    const orders = await OrderBooking.find()
      .populate("restaurantId", "restaurantName")
      .sort({ createdAt: -1 })
      .limit(20);
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2.6: Get unclaimed deliveries a rider can accept ------------
// GET /api/orders/available-for-rider
//
// Registered before the "/:id" catch-all below so this literal path isn't
// swallowed as an :id value.
//
// UPDATE (order-lifecycle fix): this used to be a Next.js route
// (foodiego/src/app/api/v1/rider/available-deliveries/route.ts) reading
// Mongo directly, with two real bugs: it listed orders still at "pending"
// (before the vendor had even accepted them - a rider could show up to a
// kitchen that hadn't started cooking) and it never checked the rider's own
// isAvailable toggle (an "offline" rider still saw and could claim every
// order). Both are fixed here: only "preparing"/"ready" orders are shown,
// and the rider must be approved AND currently available.
router.get("/available-for-rider", protect, async (req, res) => {
  try {
    if (req.user.role !== "rider") {
      return res.status(403).json({ success: false, message: "Not authorized as a rider" });
    }

    const rider = await Rider.findOne({ userId: req.user.userId });
    if (!rider || rider.status !== "approved" || !rider.isAvailable || !rider.city) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const escapedCity = rider.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const orders = await OrderBooking.find({
      $or: [{ riderId: { $exists: false } }, { riderId: null }],
      status: { $in: ["preparing", "ready"] },
      city: { $regex: `^${escapedCity}$`, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .limit(20);

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
      .populate("riderId", "fullName");
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

// --- STEP 4.5: Live tracking info for one order --------------------------
// GET /api/orders/:id/tracking
//
// UPDATE (live-tracking fix): previously nothing existed anywhere for a
// customer to see their rider's real position - /client/track rendered a
// static decorative placeholder div. The rider's real GPS (pushed every 20s
// while online - see foodiego/src/app/api/v1/rider/location/route.ts) was
// only ever read by the vendor's own dispatch map. This route is scoped so
// only the order's own customer (or an admin) can read it.
router.get("/:id/tracking", protect, async (req, res) => {
  try {
    const order = await OrderBooking.findById(req.params.id).populate("riderId", "fullName phone currentLat currentLng locationUpdatedAt");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const isOwner = order.customerId.toString() === req.user.userId;
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Not authorized to view this order" });
    }

    const rider = order.riderId && typeof order.riderId === "object" ? order.riderId : null;

    res.status(200).json({
      success: true,
      data: {
        status: order.status,
        restaurantName: order.restaurantName,
        deliveryAddress: order.deliveryAddress,
        pickedUpAt: order.pickedUpAt || null,
        deliveredAt: order.deliveredAt || null,
        rider: rider
          ? {
              fullName: rider.fullName,
              phone: rider.phone,
              lat: rider.currentLat ?? null,
              lng: rider.currentLng ?? null,
              updatedAt: rider.locationUpdatedAt || null,
            }
          : null,
      },
    });
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
      .populate("riderId", "fullName")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 6.5: Get orders placed by a specific customer -------------
// GET /api/orders/customer/:customerId
router.get("/customer/:customerId", async (req, res) => {
  try {
    const orders = await OrderBooking.find({ customerId: req.params.customerId })
      .populate("restaurantId", "restaurantName logoUrl")
      .populate("riderId", "fullName phone")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 7: Update order status (generic, admin/legacy use) --------------
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

// --- STEP 8: Vendor moves an order through its own lifecycle --------------
// PATCH /api/orders/:id/vendor-action  body: { action: "accept"|"reject"|"ready" }
//
// UPDATE (order-lifecycle fix): replaces the ad-hoc "PUT /:id/status" call
// the vendor dashboard used to make with any raw status string. This
// validates that the requested move is actually legal from the order's
// current status, so a stale UI or a replayed request can't, say, un-cancel
// an order or jump straight from "pending" to "ready".
const VENDOR_TRANSITIONS = {
  accept: { from: ["pending"], to: "preparing" },
  reject: { from: ["pending"], to: "cancelled" },
  ready: { from: ["preparing"], to: "ready" },
};

router.patch("/:id/vendor-action", protect, async (req, res) => {
  try {
    if (req.user.role !== "restaurant") {
      return res.status(403).json({ success: false, message: "Not authorized as a restaurant" });
    }

    const transition = VENDOR_TRANSITIONS[req.body.action];
    if (!transition) {
      return res.status(400).json({ success: false, message: "Unknown action" });
    }

    const order = await OrderBooking.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const restaurant = await Restaurant.findById(order.restaurantId);
    if (!restaurant || restaurant.userId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: "Not authorized to update this order" });
    }

    if (!transition.from.includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: `Order is at "${order.status}" and can't be moved to "${transition.to}" from there.`,
      });
    }

    order.status = transition.to;
    await order.save();

    const CUSTOMER_MESSAGES = {
      accept: ["Order accepted", `${restaurant.restaurantName} has started preparing your order.`],
      reject: ["Order declined", `${restaurant.restaurantName} couldn't take your order this time. Any payment will be refunded.`],
      ready: ["Order ready", `Your order from ${restaurant.restaurantName} is ready and waiting for a rider.`],
    };
    const [title, message] = CUSTOMER_MESSAGES[req.body.action];
    await notify(order.customerId, `order_${transition.to}`, title, message, "/client/track");

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 9: Rider claims / picks up / completes a delivery ---------------
// PATCH /api/orders/:id/rider-action  body: { action: "accept"|"picked_up"|"delivered" }
//
// UPDATE (order-lifecycle fix): this is the missing piece the audit flagged
// as the most serious gap in the whole app - previously there was no rider
// action past the initial claim, so every accepted order dead-ended and
// only an admin manually editing the status could ever move it to
// out_for_delivery/delivered. "accept" no longer overwrites order.status at
// all (it used to force it to "confirmed", which could regress a kitchen
// that had already progressed to "preparing"/"ready") - claiming a delivery
// and the kitchen's own prep progress are independent facts about the same
// order, so only riderId changes here.
router.patch("/:id/rider-action", protect, async (req, res) => {
  try {
    if (req.user.role !== "rider") {
      return res.status(403).json({ success: false, message: "Not authorized as a rider" });
    }

    const rider = await Rider.findOne({ userId: req.user.userId });
    if (!rider || rider.status !== "approved") {
      return res.status(403).json({ success: false, message: "Your rider account isn't approved yet" });
    }

    const order = await OrderBooking.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const { action } = req.body;

    if (action === "accept") {
      if (order.riderId) {
        return res.status(409).json({ success: false, message: "Someone else already picked this up" });
      }
      if (!["preparing", "ready"].includes(order.status)) {
        return res.status(409).json({ success: false, message: "This order isn't ready to be claimed yet" });
      }
      const alreadyActive = await OrderBooking.exists({
        riderId: rider._id,
        status: { $nin: ["delivered", "cancelled"] },
      });
      if (alreadyActive) {
        return res.status(409).json({ success: false, message: "Finish your current delivery before accepting another" });
      }
      // Atomic claim: the filter only matches a still-unassigned order, so
      // two riders tapping Accept at the same moment can't both win it.
      const claimed = await OrderBooking.findOneAndUpdate(
        { _id: order._id, $or: [{ riderId: { $exists: false } }, { riderId: null }] },
        { riderId: rider._id },
        { new: true }
      );
      if (!claimed) {
        return res.status(409).json({ success: false, message: "Someone else already picked this up" });
      }
      await notify(
        claimed.customerId,
        "rider_assigned",
        "Rider assigned",
        `${rider.fullName} will deliver your order.`,
        "/client/track"
      );
      return res.status(200).json({ success: true, data: claimed });
    }

    if (!order.riderId || order.riderId.toString() !== rider._id.toString()) {
      return res.status(403).json({ success: false, message: "This delivery isn't assigned to you" });
    }

    if (action === "picked_up") {
      if (order.status !== "ready") {
        return res.status(409).json({ success: false, message: "The kitchen hasn't marked this order ready yet" });
      }
      order.status = "out_for_delivery";
      order.pickedUpAt = new Date();
    } else if (action === "delivered") {
      if (order.status !== "out_for_delivery") {
        return res.status(409).json({ success: false, message: "This order hasn't been picked up yet" });
      }
      order.status = "delivered";
      order.deliveredAt = new Date();
    } else {
      return res.status(400).json({ success: false, message: "Unknown action" });
    }

    await order.save();

    if (action === "picked_up") {
      await notify(order.customerId, "order_out_for_delivery", "Order picked up", `${rider.fullName} is on the way with your order.`, "/client/track");
    } else if (action === "delivered") {
      await notify(order.customerId, "order_delivered", "Order delivered", "Your order has been delivered. Enjoy your meal!", "/client/orders");
      if (order.restaurantId) {
        const restaurant = await Restaurant.findById(order.restaurantId);
        if (restaurant) {
          await notify(restaurant.userId, "order_delivered", "Order delivered", `Order #${String(order._id).slice(-6).toUpperCase()} was delivered successfully.`, "/vendor?tab=orders");
        }
      }
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 10: Customer rates the rider who delivered their order ---------
// PATCH /api/orders/:id/rider-rating  body: { rating: 1-5 }
//
// UPDATE (rider-rating fix): the only rider-facing counterpart to the real
// restaurant/food review system that already existed - Rider.rating always
// existed on the model but nothing ever wrote to it. One rating per
// delivered order (checked via order.riderRating already being set), then
// Rider.rating is recomputed as a plain average across every order that
// rider has ever been rated on.
router.patch("/:id/rider-rating", protect, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ success: false, message: "Not authorized as a customer" });
    }

    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be a whole number from 1 to 5" });
    }

    const order = await OrderBooking.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (order.customerId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: "This isn't your order" });
    }
    if (!order.riderId) {
      return res.status(409).json({ success: false, message: "This order has no rider to rate" });
    }
    if (order.status !== "delivered") {
      return res.status(409).json({ success: false, message: "You can only rate a rider after delivery" });
    }
    if (order.riderRating) {
      return res.status(409).json({ success: false, message: "You've already rated this delivery" });
    }

    order.riderRating = rating;
    await order.save();

    const ratedOrders = await OrderBooking.find({ riderId: order.riderId, riderRating: { $exists: true } });
    const average = ratedOrders.reduce((sum, o) => sum + o.riderRating, 0) / ratedOrders.length;
    await Rider.findByIdAndUpdate(order.riderId, { rating: Math.round(average * 10) / 10 });

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
