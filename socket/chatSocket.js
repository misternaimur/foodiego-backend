const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const ChatMessage = require("../models/ChatMessage");
const { getChatRoomName, getChatParticipant } = require("../utils/chatParticipants");

// ============================================================
// REAL-TIME CHAT OVER SOCKET.IO
// ------------------------------------------------------------
// Two events come in from the client:
//   join_chat    { orderId, channel }           -> join that thread's room
//   send_message { orderId, channel, message }  -> save to DB + broadcast
// One event goes out to everyone in the room:
//   receive_message { orderId, channel, senderId, senderRole, message, createdAt }
// One event goes back to the sender only, when a check fails:
//   chat_error { message }
//
// Someone who is not a participant on the order can neither join the
// room nor send into it: both handlers run the same participant check
// the REST history route uses.
// ============================================================

const MAX_MESSAGE_LENGTH = 2000;

// Rejects anything that isn't a usable { orderId, channel } payload.
function validateChatPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Payload must be an object with orderId and channel";
  }
  if (typeof payload.orderId !== "string" || !payload.orderId.trim()) {
    return "orderId is required";
  }
  if (typeof payload.channel !== "string" || !payload.channel.trim()) {
    return "channel is required";
  }
  return null;
}

// join_chat: puts this socket into the room for one order + channel.
async function handleJoinChat(socket, payload) {
  try {
    const invalid = validateChatPayload(payload);
    if (invalid) {
      return socket.emit("chat_error", { message: invalid });
    }

    const { channel } = payload;

    const participant = await getChatParticipant(payload.orderId, channel, socket.user.userId);
    if (!participant.ok) {
      return socket.emit("chat_error", { message: participant.message });
    }

    // The canonical id from the order document, so both sides always land in
    // the same room even if they sent the id in a different letter case.
    socket.join(getChatRoomName(participant.order._id.toString(), channel));
  } catch (error) {
    socket.emit("chat_error", { message: error.message });
  }
}

// send_message: stores the message, then pushes it to the whole room.
async function handleSendMessage(io, socket, payload) {
  try {
    const invalid = validateChatPayload(payload);
    if (invalid) {
      return socket.emit("chat_error", { message: invalid });
    }

    const { channel } = payload;
    const text = typeof payload.message === "string" ? payload.message.trim() : "";

    if (!text) {
      return socket.emit("chat_error", { message: "message is required" });
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      return socket.emit("chat_error", {
        message: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
      });
    }

    // Checked again on send, not only on join, so a socket that never
    // joined the room still cannot write into that chat.
    const participant = await getChatParticipant(payload.orderId, channel, socket.user.userId);
    if (!participant.ok) {
      return socket.emit("chat_error", { message: participant.message });
    }

    const orderId = participant.order._id.toString();

    const saved = await ChatMessage.create({
      orderId,
      channel,
      senderId: socket.user.userId,
      senderRole: participant.senderRole,
      message: text,
    });

    // io.to(...) reaches the sender too, so both sides render the message
    // from this single event.
    io.to(getChatRoomName(orderId, channel)).emit("receive_message", {
      _id: saved._id,
      orderId,
      channel,
      senderId: saved.senderId,
      senderRole: saved.senderRole,
      message: saved.message,
      createdAt: saved.createdAt,
    });
  } catch (error) {
    socket.emit("chat_error", { message: error.message });
  }
}

// Called once from index.js with the shared HTTP server.
function attachChatSocket(server) {
  const io = new Server(server, {
    // Same policy as app.use(cors()): the frontend may connect from any origin.
    cors: { origin: "*" },
  });

  // Handshake auth - the token is the one POST /api/users/login returns,
  // verified with the same JWT_SECRET used by middleware/auth.js.
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error("No token provided"));
    }
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET); // { userId, role }
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`Chat socket connected: ${socket.id} (user ${socket.user.userId})`);

    socket.on("join_chat", (payload) => handleJoinChat(socket, payload));
    socket.on("send_message", (payload) => handleSendMessage(io, socket, payload));

    socket.on("disconnect", () => {
      console.log(`Chat socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

module.exports = attachChatSocket;
