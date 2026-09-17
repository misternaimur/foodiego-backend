const mongoose = require("mongoose");

// ============================================================
// CHAT MESSAGE MODEL -> "chatMessage" collection
// ------------------------------------------------------------
// One plain-text message inside a chat thread that belongs to a
// specific order. There are two threads per order (channels):
//
//   customer_rider   -> the customer and the assigned rider
//   restaurant_rider -> the restaurant owner and the assigned rider
//
// senderRole is stored on the message itself so a chat screen can
// show who was speaking without joining back to users/restaurant/
// rider every time the history is loaded.
// ============================================================
const chatMessageSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "OrderBooking", required: true },
    channel: {
      type: String,
      enum: ["customer_rider", "restaurant_rider"],
      required: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: {
      type: String,
      enum: ["customer", "rider", "restaurant"],
      required: true,
    },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// History is always read as "one order + one channel, oldest first",
// so this index matches exactly how the messages are queried.
chatMessageSchema.index({ orderId: 1, channel: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema, "chatMessage");
