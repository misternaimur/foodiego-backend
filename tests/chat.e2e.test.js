// ============================================================
// END-TO-END TEST FOR THE CHAT FEATURE
// ------------------------------------------------------------
// Starts a throwaway in-memory MongoDB, seeds a customer, a rider,
// a restaurant owner, an outsider and two orders (one with a rider
// assigned, one without), then boots the real server (index.js) as
// a child process and exercises it over real HTTP and real sockets.
//
// Run with:  node tests/chat.e2e.test.js
// ============================================================
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { io } = require("socket.io-client");

const JWT_SECRET = "test-secret-for-chat-e2e";
const PORT = 8991;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_NAME = "FoodBackend"; // config/db.js pins this name

const User = require("../models/User");
const Rider = require("../models/Rider");
const Restaurant = require("../models/Restaurant");
const OrderBooking = require("../models/OrderBooking");

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function api(pathname, token) {
  return fetch(`${BASE_URL}${pathname}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    const timer = setTimeout(() => reject(new Error("socket connect timed out")), 5000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

// Resolves with the next payload of `event`, or rejects after `ms`.
function nextEvent(socket, event, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// Waits `ms` and returns true if `event` fired in that window.
function expectSilence(socket, event, ms = 600) {
  return new Promise((resolve) => {
    const onEvent = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve(true);
    }, ms);
    socket.once(event, onEvent);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error("server did not start");
}

async function main() {
  console.log("Starting in-memory MongoDB...");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  await mongoose.connect(uri, { dbName: DB_NAME });

  // ---------- seed data ----------
  const customer = await User.create({
    name: "Casey Customer",
    email: "customer@test.com",
    password: "password123",
    role: "customer",
  });
  const riderUser = await User.create({
    name: "Riley Rider",
    email: "rider@test.com",
    password: "password123",
    role: "rider",
  });
  const restaurantUser = await User.create({
    name: "Rita Restaurant",
    email: "restaurant@test.com",
    password: "password123",
    role: "restaurant",
  });
  const outsider = await User.create({
    name: "Oscar Outsider",
    email: "outsider@test.com",
    password: "password123",
    role: "customer",
  });

  const riderProfile = await Rider.create({
    userId: riderUser._id,
    name: "Riley Rider",
    email: "rider@test.com",
  });
  const restaurantProfile = await Restaurant.create({
    userId: restaurantUser._id,
    restaurantName: "Test Kitchen",
    ownerName: "Rita Restaurant",
    email: "restaurant@test.com",
    address: "1 Test Street",
  });

  const order = await OrderBooking.create({
    customerId: customer._id,
    restaurantId: restaurantProfile._id,
    riderId: riderProfile._id,
    items: [{ menuItemId: new mongoose.Types.ObjectId(), name: "Burger", price: 9.5, quantity: 1 }],
    totalAmount: 9.5,
    deliveryAddress: "42 Customer Lane",
  });

  // Same customer, but no rider assigned yet.
  const orderNoRider = await OrderBooking.create({
    customerId: customer._id,
    restaurantId: restaurantProfile._id,
    items: [{ menuItemId: new mongoose.Types.ObjectId(), name: "Fries", price: 3, quantity: 1 }],
    totalAmount: 3,
    deliveryAddress: "42 Customer Lane",
  });

  const tokenFor = (user) =>
    jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: "1h" });

  const tokens = {
    customer: tokenFor(customer),
    rider: tokenFor(riderUser),
    restaurant: tokenFor(restaurantUser),
    outsider: tokenFor(outsider),
  };

  await mongoose.disconnect();

  // ---------- boot the real server ----------
  console.log("Starting server (index.js)...");
  const server = spawn(process.execPath, [path.join(__dirname, "..", "index.js")], {
    env: {
      ...process.env,
      MONGODB_URL: uri,
      JWT_SECRET,
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.stdout.write(`    [server] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`    [server:err] ${d}`));
  await waitForServer();

  const orderId = order._id.toString();

  try {
    // ================= EXISTING BEHAVIOUR IS UNCHANGED =================
    console.log("\n[1] Existing HTTP behaviour after the index.js change");
    const loginRes = await fetch(`${BASE_URL}/api/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "customer@test.com", password: "password123" }),
    });
    const loginBody = await loginRes.json();
    tokens.customerFromLogin = loginBody.token;

    const rootRes = await fetch(`${BASE_URL}/`);
    await check("GET / still serves the plain status string", async () => {
      assert.equal(rootRes.status, 200);
    });
    await check("GET / body unchanged", async () => {
      assert.equal(await rootRes.text(), "FoodEgo backend API is running");
    });
    await check("GET /api/orders still returns { success, count, data }", async () => {
      const res = await api("/api/orders");
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.count, 2);
      assert.ok(Array.isArray(body.data));
    });
    await check("GET /api/users still works", async () => {
      const body = await (await api("/api/users")).json();
      assert.equal(body.success, true);
      assert.equal(body.count, 4);
    });
    await check("GET /api/restaurants still works", async () => {
      const body = await (await api("/api/restaurants")).json();
      assert.equal(body.success, true);
      assert.equal(body.count, 1);
    });
    await check("GET /api/riders still works", async () => {
      const body = await (await api("/api/riders")).json();
      assert.equal(body.success, true);
      assert.equal(body.count, 1);
    });
    await check("unknown route still returns the 404 JSON", async () => {
      const res = await api("/api/does-not-exist");
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), { success: false, message: "Route not found" });
    });
    await check("POST /api/users/login still issues a token", () => {
      assert.ok(loginBody.token);
      assert.equal(loginBody.data.role, "customer");
    });

    // ================= SOCKET HANDSHAKE AUTH =================
    console.log("\n[2] Socket.IO handshake authentication");
    let rejectedNoToken = false;
    try {
      await connectSocket(undefined);
    } catch (error) {
      rejectedNoToken = true;
    }
    await check("connection without a token is rejected", () => assert.equal(rejectedNoToken, true));

    let rejectedBadToken = false;
    try {
      await connectSocket("not-a-real-token");
    } catch (error) {
      rejectedBadToken = true;
    }
    await check("connection with an invalid token is rejected", () =>
      assert.equal(rejectedBadToken, true)
    );

    const customerSocket = await connectSocket(tokens.customer);
    await check("connection with a valid token succeeds", () =>
      assert.equal(customerSocket.connected, true)
    );
    await check("a token from POST /api/users/login also works over sockets", async () => {
      const s = await connectSocket(tokens.customerFromLogin);
      assert.equal(s.connected, true);
      s.disconnect();
    });

    const riderSocket = await connectSocket(tokens.rider);
    const restaurantSocket = await connectSocket(tokens.restaurant);
    const outsiderSocket = await connectSocket(tokens.outsider);

    // ================= CUSTOMER <-> RIDER =================
    console.log("\n[3] customer_rider channel");
    customerSocket.emit("join_chat", { orderId, channel: "customer_rider" });
    riderSocket.emit("join_chat", { orderId, channel: "customer_rider" });
    await sleep(400);

    const riderReceives = nextEvent(riderSocket, "receive_message");
    customerSocket.emit("send_message", {
      orderId,
      channel: "customer_rider",
      message: "I am outside the building",
    });
    const msg1 = await riderReceives;
    await check("rider receives the customer's message", () =>
      assert.equal(msg1.message, "I am outside the building")
    );
    await check("broadcast carries orderId, channel, senderRole and createdAt", () => {
      assert.equal(msg1.orderId, orderId);
      assert.equal(msg1.channel, "customer_rider");
      assert.equal(msg1.senderRole, "customer");
      assert.equal(msg1.senderId, customer._id.toString());
      assert.ok(msg1.createdAt);
    });

    await sleep(30);
    const customerReceives = nextEvent(customerSocket, "receive_message");
    const riderReceivesOwn = nextEvent(riderSocket, "receive_message");
    riderSocket.emit("send_message", {
      orderId,
      channel: "customer_rider",
      message: "On my way",
    });
    const msg2 = await customerReceives;
    await riderReceivesOwn;
    await check("customer receives the rider's reply", () => assert.equal(msg2.message, "On my way"));
    await check("rider is recognised inside the customer channel", () =>
      assert.equal(msg2.senderRole, "rider")
    );
    await check("sender also receives the broadcast", () => assert.equal(msg2.senderRole, "rider"));

    // ================= RESTAURANT <-> RIDER =================
    console.log("\n[4] restaurant_rider channel");
    restaurantSocket.emit("join_chat", { orderId, channel: "restaurant_rider" });
    riderSocket.emit("join_chat", { orderId, channel: "restaurant_rider" });
    await sleep(400);

    await sleep(30);
    const riderGetsRestaurantMsg = nextEvent(riderSocket, "receive_message");
    restaurantSocket.emit("send_message", {
      orderId,
      channel: "restaurant_rider",
      message: "Order is packed and ready",
    });
    const msg3 = await riderGetsRestaurantMsg;
    await check("rider receives the restaurant's message", () =>
      assert.equal(msg3.message, "Order is packed and ready")
    );
    await check("restaurant role is recorded correctly", () =>
      assert.equal(msg3.senderRole, "restaurant")
    );
    await check("restaurant's senderId is its login account", () =>
      assert.equal(msg3.senderId, restaurantUser._id.toString())
    );

    // ================= CHANNEL ISOLATION =================
    console.log("\n[5] The two channels stay separate");
    // riderSocket is in both rooms; customer is only in customer_rider and
    // restaurant is only in restaurant_rider, so a customer_rider message
    // must not reach the restaurant. The copies the in-room sockets receive
    // are drained here so they cannot confuse the later checks.
    const noLeakToRestaurant = expectSilence(restaurantSocket, "receive_message", 800);
    const customerOwnCopy = nextEvent(customerSocket, "receive_message");
    const riderOwnCopy = nextEvent(riderSocket, "receive_message");
    customerSocket.emit("send_message", {
      orderId,
      channel: "customer_rider",
      message: "Just for the rider",
    });
    await check("a customer_rider message does not reach the restaurant thread", async () => {
      assert.equal(await noLeakToRestaurant, true);
    });
    await customerOwnCopy;
    await riderOwnCopy;

    const noLeakToCustomer = expectSilence(customerSocket, "receive_message", 800);
    const restaurantOwnCopy = nextEvent(restaurantSocket, "receive_message");
    const riderOwnCopy2 = nextEvent(riderSocket, "receive_message");
    restaurantSocket.emit("send_message", {
      orderId,
      channel: "restaurant_rider",
      message: "Just for the rider from the kitchen",
    });
    await check("a restaurant_rider message does not reach the customer thread", async () => {
      assert.equal(await noLeakToCustomer, true);
    });
    await restaurantOwnCopy;
    await riderOwnCopy2;

    // ================= NON-PARTICIPANTS ARE BLOCKED =================
    console.log("\n[6] Non-participants are rejected");
    const outsiderJoinError = nextEvent(outsiderSocket, "chat_error");
    outsiderSocket.emit("join_chat", { orderId, channel: "customer_rider" });
    const joinErr = await outsiderJoinError;
    await check("outsider cannot join over the socket", () =>
      assert.equal(joinErr.message, "You are not a participant in this chat")
    );

    const outsiderSendError = nextEvent(outsiderSocket, "chat_error");
    outsiderSocket.emit("send_message", {
      orderId,
      channel: "customer_rider",
      message: "let me in",
    });
    const sendErr = await outsiderSendError;
    await check("outsider cannot send over the socket", () =>
      assert.equal(sendErr.message, "You are not a participant in this chat")
    );

    const canOutsiderHear = expectSilence(outsiderSocket, "receive_message", 700);
    customerSocket.emit("send_message", {
      orderId,
      channel: "customer_rider",
      message: "private message",
    });
    await check("outsider never receives room broadcasts", async () => {
      assert.equal(await canOutsiderHear, true);
    });

    // The customer is not part of the restaurant thread.
    const customerWrongChannel = nextEvent(customerSocket, "chat_error");
    customerSocket.emit("join_chat", { orderId, channel: "restaurant_rider" });
    const wrongChannelErr = await customerWrongChannel;
    await check("customer cannot join the restaurant_rider channel", () =>
      assert.equal(wrongChannelErr.message, "You are not a participant in this chat")
    );

    // An order with no rider assigned has a closed customer_rider chat.
    const noRiderErr = nextEvent(riderSocket, "chat_error");
    riderSocket.emit("join_chat", {
      orderId: orderNoRider._id.toString(),
      channel: "customer_rider",
    });
    const noRiderBody = await noRiderErr;
    await check("a rider not assigned to the order cannot join", () =>
      assert.equal(noRiderBody.message, "You are not a participant in this chat")
    );

    const invalidChannelErr = nextEvent(customerSocket, "chat_error");
    customerSocket.emit("join_chat", { orderId, channel: "customer_restaurant" });
    await check("an unknown channel is refused", async () => {
      assert.equal((await invalidChannelErr).message, "Invalid channel");
    });

    const emptyMessageErr = nextEvent(customerSocket, "chat_error");
    customerSocket.emit("send_message", { orderId, channel: "customer_rider", message: "   " });
    await check("an empty message is refused", async () => {
      assert.equal((await emptyMessageErr).message, "message is required");
    });

    const badOrderErr = nextEvent(customerSocket, "chat_error");
    customerSocket.emit("join_chat", { orderId: "not-an-id", channel: "customer_rider" });
    await check("a malformed orderId is refused", async () => {
      assert.equal((await badOrderErr).message, "Invalid orderId");
    });

    const missingOrderErr = nextEvent(customerSocket, "chat_error");
    customerSocket.emit("join_chat", {
      orderId: new mongoose.Types.ObjectId().toString(),
      channel: "customer_rider",
    });
    await check("an order that does not exist is refused", async () => {
      assert.equal((await missingOrderErr).message, "Order not found");
    });

    // ================= REST HISTORY =================
    console.log("\n[7] REST history endpoint");
    const historyRes = await api(`/api/chat/${orderId}/customer_rider`, tokens.customer);
    const history = await historyRes.json();
    await check("customer can fetch customer_rider history", () => {
      assert.equal(historyRes.status, 200);
      assert.equal(history.success, true);
    });
    await check("history contains every message sent over the socket", () => {
      const texts = history.data.map((m) => m.message);
      assert.ok(texts.includes("I am outside the building"));
      assert.ok(texts.includes("On my way"));
      assert.ok(texts.includes("Just for the rider"));
      assert.ok(texts.includes("private message"));
    });
    await check("history is oldest first", () => {
      const times = history.data.map((m) => new Date(m.createdAt).getTime());
      const sorted = [...times].sort((a, b) => a - b);
      assert.deepEqual(times, sorted);
    });
    await check("history only contains its own channel", () =>
      assert.ok(history.data.every((m) => m.channel === "customer_rider"))
    );
    await check("history entries carry senderRole and senderId", () =>
      assert.ok(history.data.every((m) => m.senderRole && m.senderId))
    );

    const restaurantHistory = await (
      await api(`/api/chat/${orderId}/restaurant_rider`, tokens.restaurant)
    ).json();
    await check("restaurant can fetch restaurant_rider history", () => {
      const texts = restaurantHistory.data.map((m) => m.message);
      assert.ok(texts.includes("Order is packed and ready"));
      assert.ok(!texts.includes("I am outside the building"));
    });

    const riderHistory = await (
      await api(`/api/chat/${orderId}/customer_rider`, tokens.rider)
    ).json();
    await check("rider can fetch customer_rider history", () =>
      assert.equal(riderHistory.count, history.count)
    );

    await check("outsider gets 403 on history", async () => {
      const res = await api(`/api/chat/${orderId}/customer_rider`, tokens.outsider);
      assert.equal(res.status, 403);
      assert.equal((await res.json()).success, false);
    });
    await check("customer gets 403 on the restaurant_rider history", async () => {
      const res = await api(`/api/chat/${orderId}/restaurant_rider`, tokens.customer);
      assert.equal(res.status, 403);
    });
    await check("history without a token gets 401", async () => {
      const res = await api(`/api/chat/${orderId}/customer_rider`);
      assert.equal(res.status, 401);
    });
    await check("history for an unknown order gets 404", async () => {
      const res = await api(
        `/api/chat/${new mongoose.Types.ObjectId()}/customer_rider`,
        tokens.customer
      );
      assert.equal(res.status, 404);
    });
    await check("history for an invalid channel gets 400", async () => {
      const res = await api(`/api/chat/${orderId}/customer_restaurant`, tokens.customer);
      assert.equal(res.status, 400);
    });

    // ================= PERSISTENCE SHAPE =================
    console.log("\n[8] Persisted message shape");
    const ChatMessage = require("../models/ChatMessage");
    await mongoose.connect(uri, { dbName: DB_NAME });
    const stored = await ChatMessage.find({ orderId }).sort({ createdAt: 1 });
    await check("messages were actually written to the chatMessage collection", () =>
      assert.ok(stored.length >= 6)
    );
    await check("stored messages have every required field", () =>
      assert.ok(
        stored.every(
          (m) => m.orderId && m.channel && m.senderId && m.senderRole && m.message && m.createdAt
        )
      )
    );
    await check("stored channels are only the two allowed values", () =>
      assert.ok(stored.every((m) => ["customer_rider", "restaurant_rider"].includes(m.channel)))
    );
    await mongoose.disconnect();

    [customerSocket, riderSocket, restaurantSocket, outsiderSocket].forEach((s) => s.disconnect());
  } finally {
    server.kill();
    await sleep(300);
    await mongod.stop();
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failures.length}`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f.name}: ${f.error.message}`));
    process.exit(1);
  }
  console.log("All chat checks passed.");
  process.exit(0);
}

main().catch((error) => {
  console.error("\nTest run crashed:", error);
  process.exit(1);
});
