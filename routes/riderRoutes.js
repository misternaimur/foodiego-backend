const express = require("express");
const Rider = require("../models/Rider");
const OrderBooking = require("../models/OrderBooking");

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

    res.status(200).json({
      success: true,
      count: riders.length,
      data: riders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ============================================================
// RIDER DASHBOARD API
// ------------------------------------------------------------
// Get dashboard statistics for one rider.
// GET /api/riders/:id/dashboard
// ============================================================
router.get("/:id/dashboard", async (req, res) => {
  try {
    const rider = await Rider.findById(req.params.id).populate(
      "userId",
      "name email role"
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    // ----------------------------------------------------------
    // TODAY'S DATE RANGE
    // ----------------------------------------------------------
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // ----------------------------------------------------------
    // TODAY'S ORDERS
    // ----------------------------------------------------------
    const todayOrders = await OrderBooking.find({
      riderId: rider._id,
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .populate("customerId", "name email")
      .populate("restaurantId", "name")
      .sort({ createdAt: -1 });

    // ----------------------------------------------------------
    // COMPLETED DELIVERIES TODAY
    // ----------------------------------------------------------
    const completedToday = todayOrders.filter(
      (order) => order.status === "delivered"
    );

    // ----------------------------------------------------------
    // ACTIVE DELIVERY
    // ----------------------------------------------------------
    const activeOrder = todayOrders.find((order) =>
      ["confirmed", "preparing", "out_for_delivery"].includes(
        order.status
      )
    );

    // ----------------------------------------------------------
    // SUCCESS RATE
    // ----------------------------------------------------------
    const finishedOrders = todayOrders.filter((order) =>
      ["delivered", "cancelled"].includes(order.status)
    );

    const successRate =
      finishedOrders.length > 0
        ? Math.round(
            (completedToday.length / finishedOrders.length) * 100
          )
        : 0;

    // ----------------------------------------------------------
    // TODAY'S EARNINGS
    // ----------------------------------------------------------
    const todayEarnings = completedToday.reduce(
      (total, order) => total + Number(order.riderEarning || 0),
      0
    );

    // ----------------------------------------------------------
    // DISTANCE
    // ----------------------------------------------------------
    const totalDistance = completedToday.reduce(
      (total, order) =>
        total + Number(order.deliveryDistance || 0),
      0
    );

    // ----------------------------------------------------------
    // AVERAGE DELIVERY TIME
    // ----------------------------------------------------------
    const completedWithTime = completedToday.filter(
      (order) => order.acceptedAt && order.deliveredAt
    );

    let averageTime = null;

    if (completedWithTime.length > 0) {
      const totalMinutes = completedWithTime.reduce(
        (total, order) => {
          const start = new Date(order.acceptedAt).getTime();
          const end = new Date(order.deliveredAt).getTime();

          return total + (end - start) / (1000 * 60);
        },
        0
      );

      averageTime = Math.round(
        totalMinutes / completedWithTime.length
      );
    }

    // ----------------------------------------------------------
    // RECENT ACTIVITY
    // ----------------------------------------------------------
    const recentActivity = todayOrders.slice(0, 5).map((order) => ({
      id: order._id,
      status: order.status,
      orderId: order._id,
      createdAt: order.createdAt,
      totalAmount: order.totalAmount,
      riderEarning: order.riderEarning || 0,
    }));

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------
    res.status(200).json({
      success: true,

      data: {
        rider: {
          _id: rider._id,
          name: rider.name,
          email: rider.email,
          phone: rider.phone,
          vehicleType: rider.vehicleType,
          vehicleNumber: rider.vehicleNumber,
          isAvailable: rider.isAvailable,
          status: rider.status,
          rating: rider.rating || 0,
        },

        stats: {
          todayDeliveries: completedToday.length,
          todayEarnings,
          activeDelivery: activeOrder ? 1 : 0,
          deliverySuccess: successRate,
        },

        activeDelivery: activeOrder || null,

        performance: {
          completed: completedToday.length,
          averageTime,
          distance: Number(totalDistance.toFixed(1)),
          rating: rider.rating || 0,
        },

        recentActivity,
      },
    });
  } catch (error) {
    console.error("Rider dashboard error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ============================================================
// UPDATE RIDER ONLINE / OFFLINE STATUS
// ------------------------------------------------------------
// PATCH /api/riders/:id/availability
// ============================================================
router.patch("/:id/availability", async (req, res) => {
  try {
    const { isAvailable } = req.body;

    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isAvailable must be true or false",
      });
    }

    const rider = await Rider.findByIdAndUpdate(
      req.params.id,
      { isAvailable },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    res.status(200).json({
      success: true,
      message: isAvailable
        ? "Rider is now online"
        : "Rider is now offline",
      data: {
        isAvailable: rider.isAvailable,
      },
    });
  } catch (error) {
    console.error("Availability update error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// --- STEP 3: Get a single rider by id -------------------------------
// GET /api/riders/:id
router.get("/:id", async (req, res) => {
  try {
    const rider = await Rider.findById(req.params.id).populate(
      "userId",
      "name email role"
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    res.status(200).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// --- STEP 4: Update a rider profile -----------------------------------
// PUT /api/riders/:id
router.put("/:id", async (req, res) => {
  try {
    const rider = await Rider.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    res.status(200).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// --- STEP 5: Delete a rider profile --------------------------------------
// DELETE /api/riders/:id
router.delete("/:id", async (req, res) => {
  try {
    const rider = await Rider.findByIdAndDelete(req.params.id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Rider deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;