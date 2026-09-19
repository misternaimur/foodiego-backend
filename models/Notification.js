const mongoose = require("mongoose");

// ============================================================
// NOTIFICATION MODEL -> "notification" collection
// ------------------------------------------------------------
// UPDATE (notification-system fix): before this model existed, every
// notification screen in the app (vendor, admin) rendered a hardcoded local
// array with inert "mark read"/"delete" buttons - nothing was ever actually
// stored or delivered. This is the real collection those screens (and the
// customer/rider ones added alongside it) now read from. One document per
// recipient per event, so "mark as read" is a per-user, per-notification
// flag rather than something shared across everyone who could see an event.
// ============================================================
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    // Where clicking the notification should take the recipient, e.g. "/vendor?tab=orders".
    link: { type: String, trim: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema, "notification");
