const mongoose = require("mongoose");

// ============================================================
// ORDER BOOKING MODEL -> "orderBooking" collection
// ------------------------------------------------------------
// One food order placed by a customer against a restaurant, and
// (once assigned) a rider who delivers it.
// ============================================================
const orderItemSchema = new mongoose.Schema(
  {
    // A real MenuItem id when the item came from a vendor's DB-backed menu,
    // or any catalog id (e.g. from the demo food list) otherwise - so this
    // is a plain string rather than a strict ObjectId reference.
    menuItemId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    specialInstructions: { type: String, trim: true },
  },
  { _id: false }
);

const orderBookingSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Optional: set when the order matches a real Restaurant document.
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },
    // Always set, even when restaurantId couldn't be resolved (demo catalog).
    restaurantName: { type: String, trim: true },
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "Rider" }, // assigned after booking
    items: {
      type: [orderItemSchema],
      required: true,
      validate: (items) => Array.isArray(items) && items.length > 0,
    },
    totalAmount: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    deliveryAddress: { type: String, required: true, trim: true },
    // Free-text delivery instructions from the customer at checkout (gate
    // code, floor number, "leave with security" etc.) - separate from any
    // per-item specialInstructions above.
    deliveryNote: { type: String, trim: true },
    // Used to match this order against riders registered in the same city
    // for the "available deliveries near you" list.
    city: { type: String, trim: true },
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
      enum: ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"],
      default: "pending",
    },
    refundStatus: { type: String, enum: ["pending", "approved", "rejected"] },
    // Real timestamps for the two rider-triggered handoffs, so delivery
    // duration can be reported honestly instead of guessed from updatedAt.
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },
    // UPDATE (rider-rating fix): one rating per delivered order, used to
    // recompute Rider.rating as a simple average - see the
    // PATCH /:id/rider-rating route below.
    riderRating: { type: Number, min: 1, max: 5 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OrderBooking", orderBookingSchema, "orderBooking");
