const mongoose = require("mongoose");
const OrderBooking = require("../models/OrderBooking");
const Restaurant = require("../models/Restaurant");
const Rider = require("../models/Rider");

// ============================================================
// CHAT PARTICIPANT CHECK (shared by the REST route and sockets)
// ------------------------------------------------------------
// A chat only exists inside an order. Before anyone may read or
// send messages, we check that the logged-in user really is one of
// the two people in that order + channel:
//
//   customer_rider   -> order.customerId and order.riderId
//   restaurant_rider -> the restaurant's owner and order.riderId
//
// The JWT only carries the "users" account id (userId) and role, so
// rider/restaurant callers are matched by looking their profile up
// through its userId field. Rider stays the common thread in both
// channels.
// ============================================================

const CHAT_CHANNELS = ["customer_rider", "restaurant_rider"];

// Room name used by Socket.IO, e.g. "order_667f..._customer_rider".
function getChatRoomName(orderId, channel) {
  return `order_${orderId}_${channel}`;
}

// Returns either { ok: true, order, senderRole } or
// { ok: false, status, message } - plain object, no exceptions,
// so both the REST route and the socket handlers can use it.
async function getChatParticipant(orderId, channel, userId) {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    return { ok: false, status: 400, message: "Invalid orderId" };
  }

  if (!CHAT_CHANNELS.includes(channel)) {
    return { ok: false, status: 400, message: "Invalid channel" };
  }

  const order = await OrderBooking.findById(orderId);
  if (!order) {
    return { ok: false, status: 404, message: "Order not found" };
  }

  const callerId = userId.toString();

  // The customer talks to the rider on their own order.
  if (channel === "customer_rider") {
    if (order.customerId && order.customerId.toString() === callerId) {
      return { ok: true, order, senderRole: "customer" };
    }
  }

  // The restaurant owner talks to the rider delivering their order.
  if (channel === "restaurant_rider") {
    const restaurant = await Restaurant.findOne({ userId: callerId });
    if (restaurant && order.restaurantId.toString() === restaurant._id.toString()) {
      return { ok: true, order, senderRole: "restaurant" };
    }
  }

  // The rider is part of both channels - but only once assigned.
  if (order.riderId) {
    const rider = await Rider.findOne({ userId: callerId });
    if (rider && order.riderId.toString() === rider._id.toString()) {
      return { ok: true, order, senderRole: "rider" };
    }
  }

  return { ok: false, status: 403, message: "You are not a participant in this chat" };
}

module.exports = { CHAT_CHANNELS, getChatRoomName, getChatParticipant };
