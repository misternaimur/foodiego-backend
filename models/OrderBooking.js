const mongoose = require("mongoose");

// ============================================================
// ORDER BOOKING MODEL -> "orderBooking" collection
// ------------------------------------------------------------
// One food order placed by a customer against a restaurant, and
// (once assigned) a rider who delivers it.
// ============================================================
const orderItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false }
);

const orderBookingSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "Rider" }, // assigned after booking
    items: {
      type: [orderItemSchema],
      required: true,
      validate: (items) => Array.isArray(items) && items.length > 0,
    },
    totalAmount: { type: Number, required: true, min: 0 },
    deliveryAddress: { type: String, required: true, trim: true },
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
      enum: ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OrderBooking", orderBookingSchema, "orderBooking");
