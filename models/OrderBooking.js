const mongoose = require("mongoose");

// ============================================================
// ORDER BOOKING MODEL -> "orderBooking" collection
// ------------------------------------------------------------
// One food order placed by a customer against a restaurant, and
// (once assigned) a rider who delivers it.
// ============================================================

const orderItemSchema = new mongoose.Schema(
  {
    menuItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  { _id: false }
);

const orderBookingSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },

    // Rider assigned after the order is accepted
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      default: null,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: (items) => Array.isArray(items) && items.length > 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    deliveryAddress: {
      type: String,
      required: true,
      trim: true,
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "card", "online"],
      default: "cash",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },

    // ============================================================
    // RIDER DELIVERY DATA
    // ------------------------------------------------------------
    // These fields are used by the rider/delivery side.
    // They are optional, so existing orders will continue working.
    // ============================================================

    // Rider's earning for this delivery
    riderEarning: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Delivery distance in kilometers
    deliveryDistance: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Time when rider accepted the order
    acceptedAt: {
      type: Date,
      default: null,
    },

    // Time when rider picked up the food
    pickedUpAt: {
      type: Date,
      default: null,
    },

    // Time when rider completed the delivery
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "OrderBooking",
  orderBookingSchema,
  "orderBooking"
);