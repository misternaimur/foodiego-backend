const express = require("express");
const ChatMessage = require("../models/ChatMessage");
const { protect } = require("../middleware/auth");
const { getChatParticipant } = require("../utils/chatParticipants");

// ============================================================
// THIS IS THE CHAT API
// ------------------------------------------------------------
// Reading chat history happens over HTTP; sending a message
// happens over Socket.IO (see socket/chatSocket.js). That split is
// deliberate - a page load wants "give me this thread's messages",
// which a normal request handles better than a socket round-trip.
//
// Every request first passes the shared participant check, so
// someone who is not on the order can never read its chat.
// ============================================================
const router = express.Router();

// --- Get the message history for one order + channel ------------------
// GET /api/chat/:orderId/:channel   (requires Authorization: Bearer <token>)
// channel is either "customer_rider" or "restaurant_rider".
router.get("/:orderId/:channel", protect, async (req, res) => {
  try {
    const { orderId, channel } = req.params;

    const participant = await getChatParticipant(orderId, channel, req.user.userId);
    if (!participant.ok) {
      return res
        .status(participant.status)
        .json({ success: false, message: participant.message });
    }

    // Oldest first, so a chat screen can just append new messages.
    const messages = await ChatMessage.find({ orderId, channel }).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
