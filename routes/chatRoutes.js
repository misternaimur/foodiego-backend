const express = require("express");
const ChatMessage = require("../models/ChatMessage");
const { protect } = require("../middleware/auth");
const { getChatParticipant } = require("../utils/chatParticipants");

// ============================================================
// THIS IS THE CHAT API
// ------------------------------------------------------------
// Chat is plain HTTP: POST to send, GET to read. The frontend polls
// the GET endpoint for new messages instead of holding a socket open,
// because the backend is deployed as a Vercel serverless function and
// serverless functions cannot keep a WebSocket connection alive.
//
// Polling cheaply: send back the createdAt of the newest message you
// already have as ?since=<ISO timestamp>, and only messages from that
// point on come back. On page load, call it without ?since to get the
// whole thread.
//
// Every request first passes the shared participant check, so someone
// who is not on the order can neither read nor write its chat.
// ============================================================
const router = express.Router();

// The longest message a chat will accept.
const MAX_MESSAGE_LENGTH = 2000;

// --- STEP 1: Read the message history for one order + channel -----------
// GET /api/chat/:orderId/:channel          (requires Authorization: Bearer <token>)
// GET /api/chat/:orderId/:channel?since=<ISO timestamp>
//
// channel is either "customer_rider" or "restaurant_rider".
// Always oldest first, so a chat screen can just append.
router.get("/:orderId/:channel", protect, async (req, res) => {
  try {
    const { orderId, channel } = req.params;

    const participant = await getChatParticipant(orderId, channel, req.user.userId);
    if (!participant.ok) {
      return res
        .status(participant.status)
        .json({ success: false, message: participant.message });
    }

    const query = { orderId, channel };

    // ?since= narrows the result to messages at/after that moment, which is
    // what a poll uses. $gte rather than $gt on purpose: the boundary message
    // may come back again, and the client drops it by _id, so a message sent
    // in the same millisecond as the last one can never be skipped.
    if (req.query.since !== undefined) {
      const since = new Date(req.query.since);
      if (Number.isNaN(since.getTime())) {
        return res.status(400).json({
          success: false,
          message: "since must be a valid date, e.g. 2026-09-17T10:15:00.000Z",
        });
      }
      query.createdAt = { $gte: since };
    }

    const messages = await ChatMessage.find(query).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- STEP 2: Send a message into one order + channel -------------------
// POST /api/chat/:orderId/:channel   body: { "message": "on my way" }
//
// The sender is taken from the JWT, never from the body, so nobody can
// post as somebody else.
router.post("/:orderId/:channel", protect, async (req, res) => {
  try {
    const { orderId, channel } = req.params;

    const participant = await getChatParticipant(orderId, channel, req.user.userId);
    if (!participant.ok) {
      return res
        .status(participant.status)
        .json({ success: false, message: participant.message });
    }

    const text = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!text) {
      return res.status(400).json({ success: false, message: "message is required" });
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
      });
    }

    const message = await ChatMessage.create({
      orderId: participant.order._id, // canonical id from the order document
      channel,
      senderId: req.user.userId,
      senderRole: participant.senderRole,
      message: text,
    });

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
