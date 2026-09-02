
const express = require("express");
const mongoose = require("mongoose");
const Rider = require("../models/Rider");
const OrderBooking = require("../models/OrderBooking");

const router = express.Router();

/* ============================================================
   HELPER
============================================================ */

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ============================================================
   1. AVAILABLE ORDERS
   GET /api/riders/:id/orders/available
============================================================ */

router.get("/:id/orders/available", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid rider ID",
      });
    }

    const rider = await Rider.findById(id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    const orders = await OrderBooking.find({
      $or: [{ riderId: null }, { riderId: { $exists: false } }],
      status: {
        $in: ["confirmed", "preparing"],
      },
    })
      .populate("customerId", "name email phone")
      .populate("restaurantId", "restaurantName name address")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error("Available orders error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   2. GET RIDER DELIVERIES
   THIS IS IMPORTANT FOR YOUR DELIVERIES PAGE

   GET /api/riders/:id/deliveries
============================================================ */

router.get("/:id/deliveries", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid rider ID",
      });
    }

    const rider = await Rider.findById(id).populate(
      "userId",
      "name email role"
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    const orders = await OrderBooking.find({
      riderId: rider._id,
    })
      .populate("customerId", "name email phone")
      .populate("restaurantId", "restaurantName name address")
      .sort({ createdAt: -1 });

    /* ---------------------------------------------------------
       Convert database orders into delivery data
    --------------------------------------------------------- */

    const deliveries = orders.map((order) => {
      let status = "Accepted";

      if (order.status === "out_for_delivery") {
        status = "In Progress";
      }

      if (order.status === "delivered") {
        status = "Completed";
      }

      const customerName =
        order.customerId?.name ||
        order.customerName ||
        "Customer";

      const restaurantName =
        order.restaurantId?.restaurantName ||
        order.restaurantId?.name ||
        order.restaurantName ||
        "Restaurant";

      const deliveryAddress =
        order.deliveryAddress ||
        order.shippingAddress ||
        order.address ||
        "Delivery address";

      const distance = Number(order.deliveryDistance || 0);

      let time = "—";

      if (order.acceptedAt && order.deliveredAt) {
        const start = new Date(order.acceptedAt).getTime();
        const end = new Date(order.deliveredAt).getTime();

        const minutes = Math.max(
          0,
          Math.round((end - start) / (1000 * 60))
        );

        time = `${minutes} min`;
      } else if (order.estimatedDeliveryTime) {
        time = `${order.estimatedDeliveryTime} min`;
      }

      return {
        id: order._id,
        orderId: order._id,

        restaurant: restaurantName,
        customer: customerName,

        pickup:
          restaurantName,

        delivery:
          deliveryAddress,

        distance:
          distance > 0 ? `${distance} km` : "—",

        time,

        payout:
          Number(order.riderEarning || 0),

        status,

        rawStatus: order.status,

        acceptedAt: order.acceptedAt || null,
        pickedUpAt: order.pickedUpAt || null,
        deliveredAt: order.deliveredAt || null,

        totalAmount:
          Number(order.totalAmount || 0),

        customerPhone:
          order.customerId?.phone ||
          order.customerPhone ||
          "",

        restaurantAddress:
          order.restaurantId?.address ||
          "",
      };
    });

    /* ---------------------------------------------------------
       Statistics
    --------------------------------------------------------- */

    const activeDeliveries = deliveries.filter(
      (delivery) => delivery.status === "In Progress"
    );

    const acceptedDeliveries = deliveries.filter(
      (delivery) => delivery.status === "Accepted"
    );

    const completedDeliveries = deliveries.filter(
      (delivery) => delivery.status === "Completed"
    );

    const earnings = completedDeliveries.reduce(
      (total, delivery) =>
        total + Number(delivery.payout || 0),
      0
    );

    return res.status(200).json({
      success: true,

      count: deliveries.length,

      data: deliveries,

      stats: {
        active: activeDeliveries.length,
        accepted: acceptedDeliveries.length,
        completed: completedDeliveries.length,
        earnings,
      },
    });
  } catch (error) {
    console.error("Rider deliveries error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   3. ACCEPT ORDER

   PUT /api/riders/:id/orders/:orderId/accept
============================================================ */

router.put("/:id/orders/:orderId/accept", async (req, res) => {
  try {
    const { id, orderId } = req.params;

    if (!isValidId(id) || !isValidId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid rider or order ID",
      });
    }

    const rider = await Rider.findById(id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    if (rider.isAvailable === false) {
      return res.status(400).json({
        success: false,
        message: "Rider is currently offline",
      });
    }

    const order = await OrderBooking.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.riderId) {
      return res.status(400).json({
        success: false,
        message: "This order has already been assigned",
      });
    }

    if (!["confirmed", "preparing"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "This order is not available for delivery",
      });
    }

    order.riderId = rider._id;
    order.acceptedAt = new Date();

    /* Rider earning */

    if (!order.riderEarning || order.riderEarning === 0) {
      const distance = Number(
        order.deliveryDistance || 0
      );

      order.riderEarning =
        distance > 0
          ? Math.max(
              60,
              Math.round(40 + distance * 12)
            )
          : 60;
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Order accepted successfully",
      data: order,
    });
  } catch (error) {
    console.error("Accept order error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   4. START DELIVERY

   PUT /api/riders/:id/orders/:orderId/start
============================================================ */

router.put("/:id/orders/:orderId/start", async (req, res) => {
  try {
    const { id, orderId } = req.params;

    if (!isValidId(id) || !isValidId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid rider or order ID",
      });
    }

    const order = await OrderBooking.findOne({
      _id: orderId,
      riderId: id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Assigned order not found",
      });
    }

    order.status = "out_for_delivery";
    order.pickedUpAt = new Date();

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Delivery started",
      data: order,
    });
  } catch (error) {
    console.error("Start delivery error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   5. COMPLETE DELIVERY

   PUT /api/riders/:id/orders/:orderId/complete
============================================================ */

router.put("/:id/orders/:orderId/complete", async (req, res) => {
  try {
    const { id, orderId } = req.params;

    if (!isValidId(id) || !isValidId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid rider or order ID",
      });
    }

    const order = await OrderBooking.findOne({
      _id: orderId,
      riderId: id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Assigned order not found",
      });
    }

    order.status = "delivered";
    order.deliveredAt = new Date();

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Delivery completed successfully",
      data: order,
    });
  } catch (error) {
    console.error("Complete delivery error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   6. RIDER DASHBOARD

   GET /api/riders/:id/dashboard
============================================================ */

router.get("/:id/dashboard", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid rider ID",
      });
    }

    const rider = await Rider.findById(id).populate(
      "userId",
      "name email role"
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todayOrders = await OrderBooking.find({
      riderId: rider._id,
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .populate("customerId", "name email phone")
      .populate("restaurantId", "restaurantName name address")
      .sort({ createdAt: -1 });

    /* Completed */

    const completedToday = todayOrders.filter(
      (order) => order.status === "delivered"
    );

    /* Active */

    const activeOrder = todayOrders.find(
      (order) =>
        [
          "confirmed",
          "preparing",
          "out_for_delivery",
        ].includes(order.status)
    );

    /* Success rate */

    const finishedOrders = todayOrders.filter(
      (order) =>
        ["delivered", "cancelled"].includes(
          order.status
        )
    );

    const successRate =
      finishedOrders.length > 0
        ? Math.round(
            (completedToday.length /
              finishedOrders.length) *
              100
          )
        : 0;

    /* Earnings */

    const todayEarnings =
      completedToday.reduce(
        (total, order) =>
          total +
          Number(order.riderEarning || 0),
        0
      );

    /* Distance */

    const totalDistance =
      completedToday.reduce(
        (total, order) =>
          total +
          Number(
            order.deliveryDistance || 0
          ),
        0
      );

    /* Average time */

    const completedWithTime =
      completedToday.filter(
        (order) =>
          order.acceptedAt &&
          order.deliveredAt
      );

    let averageTime = null;

    if (completedWithTime.length > 0) {
      const totalMinutes =
        completedWithTime.reduce(
          (total, order) => {
            const start =
              new Date(
                order.acceptedAt
              ).getTime();

            const end =
              new Date(
                order.deliveredAt
              ).getTime();

            return (
              total +
              (end - start) /
                (1000 * 60)
            );
          },
          0
        );

      averageTime = Math.round(
        totalMinutes /
          completedWithTime.length
      );
    }

    /* Recent activity */

    const recentActivity =
      todayOrders
        .slice(0, 5)
        .map((order) => ({
          id: order._id,
          status: order.status,
          orderId: order._id,
          createdAt: order.createdAt,
          totalAmount:
            order.totalAmount || 0,
          riderEarning:
            order.riderEarning || 0,
        }));

    return res.status(200).json({
      success: true,

      data: {
        rider: {
          _id: rider._id,
          name: rider.name,
          email: rider.email,
          phone: rider.phone,
          vehicleType:
            rider.vehicleType,
          vehicleNumber:
            rider.vehicleNumber,
          isAvailable:
            rider.isAvailable,
          status: rider.status,
          rating:
            rider.rating || 4.9,
        },

        stats: {
          todayDeliveries:
            completedToday.length,

          todayEarnings,

          activeDelivery:
            activeOrder ? 1 : 0,

          deliverySuccess:
            successRate,
        },

        activeDelivery:
          activeOrder || null,

        performance: {
          completed:
            completedToday.length,

          averageTime,

          distance:
            Number(
              totalDistance.toFixed(1)
            ),

          rating:
            rider.rating || 4.9,
        },

        recentActivity,
      },
    });
  } catch (error) {
    console.error(
      "Rider dashboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   7. UPDATE AVAILABILITY

   PATCH /api/riders/:id/availability
============================================================ */

router.patch("/:id/availability", async (req, res) => {
  try {
    const { id } = req.params;
    const { isAvailable } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid rider ID",
      });
    }

    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        success: false,
        message:
          "isAvailable must be true or false",
      });
    }

    const rider =
      await Rider.findByIdAndUpdate(
        id,
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

    return res.status(200).json({
      success: true,

      message: isAvailable
        ? "Rider is now online"
        : "Rider is now offline",

      data: {
        isAvailable:
          rider.isAvailable,
      },
    });
  } catch (error) {
    console.error(
      "Availability error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   8. CREATE RIDER

   POST /api/riders
============================================================ */

router.post("/", async (req, res) => {
  try {
    const rider = await Rider.create(
      req.body
    );

    return res.status(201).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    console.error(
      "Create rider error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   9. GET ALL RIDERS

   GET /api/riders
============================================================ */

router.get("/", async (req, res) => {
  try {
    const riders = await Rider.find()
      .populate(
        "userId",
        "name email role"
      );

    return res.status(200).json({
      success: true,
      count: riders.length,
      data: riders,
    });
  } catch (error) {
    console.error(
      "Get riders error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   10. GET SINGLE RIDER

   GET /api/riders/:id
============================================================ */

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid rider ID",
      });
    }

    const rider =
      await Rider.findById(id).populate(
        "userId",
        "name email role"
      );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    console.error(
      "Get rider error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   11. UPDATE RIDER

   PUT /api/riders/:id
============================================================ */

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid rider ID",
      });
    }

    const rider =
      await Rider.findByIdAndUpdate(
        id,
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );

    if (!rider) {
      return res.status(404).json( {
        success: false,
        message: "Rider not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    console.error(
      "Update rider error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ============================================================
   12. DELETE RIDER

   DELETE /api/riders/:id
============================================================ */

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid rider ID",
      });
    }

    const rider =
      await Rider.findByIdAndDelete(id);

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Rider deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete rider error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;