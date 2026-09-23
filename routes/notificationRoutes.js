const express = require("express");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");

// ============================================================
// NOTIFICATION API
// ------------------------------------------------------------
// Read/manage the current user's own notifications. Creation happens
// inline wherever the triggering event already occurs (see the
// notify() calls in orderBookingRoutes.js and, on the Next.js side,
// src/app/(main)/actions/admin.ts for vendor/rider approval) rather than
// through a dedicated POST route here - nothing outside this backend (or
// the Next.js admin actions that share this collection) should ever be
// creating a notification on another user's behalf.
// ============================================================
const router = express.Router();

// GET /api/notifications?limit=30 - this user's own notifications, newest first.
router.get("/", protect, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const notifications = await Notification.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    const unreadCount = await Notification.countDocuments({ userId: req.user.userId, read: false });
    // Nested under `data` (not a sibling) because the Next.js `backendFetch`
    // helper unwraps the response to `payload.data` - a sibling field here
    // would be silently discarded.
    res.status(200).json({ success: true, data: { notifications, unreadCount } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/notifications/:id/read - mark one notification read (ownership-checked).
router.patch("/:id/read", protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/notifications/read-all - mark every one of this user's notifications read.
router.patch("/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.userId, read: false }, { read: true });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/notifications/:id - ownership-checked delete.
router.delete("/:id", protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    res.status(200).json({ success: true, message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
