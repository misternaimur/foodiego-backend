// ============================================================
// END-TO-END TEST FOR THE CHAT FEATURE (HTTP / polling)
// ------------------------------------------------------------
// Starts a throwaway in-memory MongoDB, seeds a customer, a rider,
// a restaurant owner, an outsider and two orders (one with a rider
// assigned, one without), then boots the real server (index.js) as
// a child process and exercises it over real HTTP requests.
//
// The frontend flow being tested here is:
//   1. GET  /api/chat/:orderId/:channel              -> load the thread
//   2. POST /api/chat/:orderId/:channel              -> send a message
//   3. GET  /api/chat/:orderId/:channel?since=<date> -> poll for new ones
//
// Run with:  npm run test:chat
// ============================================================
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const JWT_SECRET = "test-secret-for-chat-e2e";
const PORT = 8991;
const ENTRY_PORT = 8992; // the "Vercel" entry path runs on its own port
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_NAME = "FoodBackend"; // config/db.js pins this name

const User = require("../models/User");
const Rider = require("../models/Rider");
const Restaurant = require("../models/Restaurant");
const OrderBooking = require("../models/OrderBooking");
const ChatMessage = require("../models/ChatMessage");

let passed = 0;
const failures = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Small HTTP helper so the checks stay readable.
async function request(method, pathname, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return { status: res.status, body: await res.json() };
}

const get = (pathname, token) => request("GET", pathname, { token });
const post = (pathname, token, body) => request("POST", pathname, { token, body });

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

  const orderId = order._id.toString();
  const noRiderOrderId = orderNoRider._id.toString();
  const customerRider = `/api/chat/${orderId}/customer_rider`;
  const restaurantRider = `/api/chat/${orderId}/restaurant_rider`;

  await mongoose.disconnect();

  // ---------- boot the real server ----------
  console.log("Starting server (index.js)...");
  const server = spawn(process.execPath, [path.join(__dirname, "..", "index.js")], {
    env: { ...process.env, MONGODB_URL: uri, JWT_SECRET, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.stdout.write(`    [server] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`    [server:err] ${d}`));
  await waitForServer();

  try {
    // ================= EXISTING BEHAVIOUR IS UNCHANGED =================
    console.log("\n[1] Existing HTTP behaviour is unchanged");
    const rootRes = await fetch(`${BASE_URL}/`);
    await check("GET / still serves the plain status string", async () => {
      assert.equal(rootRes.status, 200);
      assert.equal(await rootRes.text(), "FoodEgo backend API is running");
    });

    const loginRes = await fetch(`${BASE_URL}/api/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "customer@test.com", password: "password123" }),
    });
    const loginBody = await loginRes.json();
    tokens.customerFromLogin = loginBody.token;
    await check("POST /api/users/login still issues a token", () => {
      assert.ok(loginBody.token);
      assert.equal(loginBody.data.role, "customer");
    });

    await check("GET /api/orders still returns { success, count, data }", async () => {
      const res = await get("/api/orders");
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 2);
      assert.ok(Array.isArray(res.body.data));
    });
    await check("GET /api/users still works", async () => {
      const res = await get("/api/users");
      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 4);
    });
    await check("GET /api/restaurants still works", async () => {
      const res = await get("/api/restaurants");
      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 1);
    });
    await check("GET /api/riders still works", async () => {
      const res = await get("/api/riders");
      assert.equal(res.body.success, true);
      assert.equal(res.body.count, 1);
    });
    await check("unknown route still returns the 404 JSON", async () => {
      const res = await get("/api/does-not-exist");
      assert.equal(res.status, 404);
      assert.deepEqual(res.body, { success: false, message: "Route not found" });
    });

    // ================= SENDING =================
    console.log("\n[2] Sending messages (POST)");
    const emptyRes = await get(customerRider, tokens.customer);
    await check("a brand new thread starts empty", () => {
      assert.equal(emptyRes.status, 200);
      assert.equal(emptyRes.body.count, 0);
      assert.deepEqual(emptyRes.body.data, []);
    });

    const customerSend = await post(customerRider, tokens.customer, {
      message: "I am outside the building",
    });
    await check("customer can send into customer_rider", () => {
      assert.equal(customerSend.status, 201);
      assert.equal(customerSend.body.success, true);
    });
    await check("the created message carries the right sender and role", () => {
      assert.equal(customerSend.body.data.senderRole, "customer");
      assert.equal(customerSend.body.data.senderId, customer._id.toString());
      assert.equal(customerSend.body.data.message, "I am outside the building");
      assert.equal(customerSend.body.data.channel, "customer_rider");
      assert.equal(customerSend.body.data.orderId, orderId);
      assert.ok(customerSend.body.data.createdAt);
    });

    await check("a token from POST /api/users/login can send too", async () => {
      const res = await post(customerRider, tokens.customerFromLogin, {
        message: "sent with a freshly logged-in token",
      });
      assert.equal(res.status, 201);
    });

    await sleep(20);
    const riderSend = await post(customerRider, tokens.rider, { message: "On my way" });
    await check("rider can reply in customer_rider", () => {
      assert.equal(riderSend.status, 201);
      assert.equal(riderSend.body.data.senderRole, "rider");
    });

    await sleep(20);
    const restaurantSend = await post(restaurantRider, tokens.restaurant, {
      message: "Order is packed and ready",
    });
    await check("restaurant can send into restaurant_rider", () => {
      assert.equal(restaurantSend.status, 201);
      assert.equal(restaurantSend.body.data.senderRole, "restaurant");
    });
    await check("restaurant messages record the login account as sender", () =>
      assert.equal(restaurantSend.body.data.senderId, restaurantUser._id.toString())
    );

    await sleep(20);
    const riderRestaurantSend = await post(restaurantRider, tokens.rider, {
      message: "Picking it up now",
    });
    await check("rider can reply in restaurant_rider", () =>
      assert.equal(riderRestaurantSend.body.data.senderRole, "rider")
    );

    await check("the sender is taken from the token, not the request body", async () => {
      const res = await post(customerRider, tokens.customer, {
        message: "trying to impersonate the rider",
        senderId: riderUser._id.toString(),
        senderRole: "rider",
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.senderRole, "customer");
      assert.equal(res.body.data.senderId, customer._id.toString());
    });

    await check("surrounding whitespace is trimmed", async () => {
      const res = await post(customerRider, tokens.customer, { message: "   padded   " });
      assert.equal(res.body.data.message, "padded");
    });

    // ================= READING =================
    console.log("\n[3] Reading history");
    const history = await get(customerRider, tokens.customer);
    await check("customer reads the customer_rider thread", () => {
      assert.equal(history.status, 200);
      assert.equal(history.body.success, true);
      assert.ok(history.body.count >= 5);
    });
    await check("history is oldest first", () => {
      const times = history.body.data.map((m) => new Date(m.createdAt).getTime());
      assert.deepEqual(times, [...times].sort((a, b) => a - b));
    });
    await check("the first message is still the first one sent", () =>
      assert.equal(history.body.data[0].message, "I am outside the building")
    );
    await check("history never mixes in the other channel", () =>
      assert.ok(history.body.data.every((m) => m.channel === "customer_rider"))
    );
    await check("history never leaks the restaurant thread's messages", () => {
      const texts = history.body.data.map((m) => m.message);
      assert.ok(!texts.includes("Order is packed and ready"));
      assert.ok(!texts.includes("Picking it up now"));
    });

    const restaurantHistory = await get(restaurantRider, tokens.restaurant);
    await check("restaurant reads the restaurant_rider thread", () => {
      assert.ok(restaurantHistory.body.count >= 2);
      assert.ok(
        restaurantHistory.body.data.every((m) => m.channel === "restaurant_rider")
      );
    });
    await check("rider sees both threads, each with its own messages", async () => {
      const cr = await get(customerRider, tokens.rider);
      const rr = await get(restaurantRider, tokens.rider);
      assert.ok(cr.body.data.every((m) => m.channel === "customer_rider"));
      assert.ok(rr.body.data.every((m) => m.channel === "restaurant_rider"));
    });

    // ================= POLLING =================
    console.log("\n[4] Polling with ?since=");
    const beforePoll = await get(customerRider, tokens.customer);
    const lastSeen = beforePoll.body.data.at(-1).createdAt;

    const emptyPoll = await get(
      `${customerRider}?since=${encodeURIComponent(lastSeen)}`,
      tokens.customer
    );
    await check("polling with the newest message's timestamp returns nothing new", () => {
      // $gte may re-include the boundary message itself, but nothing after it.
      assert.ok(emptyPoll.body.count <= 1);
      assert.ok(emptyPoll.body.data.every((m) => m.createdAt === lastSeen));
    });

    await sleep(20);
    const newMessage = await post(customerRider, tokens.customer, {
      message: "are you close?",
    });
    const polled = await get(
      `${customerRider}?since=${encodeURIComponent(lastSeen)}`,
      tokens.customer
    );
    await check("a poll picks up exactly the message sent since the last poll", () => {
      const ids = polled.body.data.map((m) => m._id);
      assert.ok(ids.includes(newMessage.body.data._id));
      assert.equal(polled.body.count <= 2, true); // the new one, maybe the boundary one
    });
    await check("the polled message is the only new content", () => {
      const fresh = polled.body.data.filter((m) => m.createdAt !== lastSeen);
      assert.equal(fresh.length, 1);
      assert.equal(fresh[0].message, "are you close?");
    });
    await check("polling never returns old messages", () => {
      const texts = polled.body.data.map((m) => m.message);
      assert.ok(!texts.includes("I am outside the building"));
      assert.ok(!texts.includes("On my way"));
    });
    await check("polling respects the participant check", async () => {
      const res = await get(
        `${customerRider}?since=${encodeURIComponent(lastSeen)}`,
        tokens.outsider
      );
      assert.equal(res.status, 403);
    });
    await check("a malformed since value is rejected", async () => {
      const res = await get(`${customerRider}?since=not-a-date`, tokens.customer);
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    // Simulate what a polling loop sees across two polls: nothing is missed.
    await check("polling repeatedly never misses a message", async () => {
      const seen = new Map();
      let cursor = null;

      const collect = async () => {
        const url = cursor ? `${customerRider}?since=${encodeURIComponent(cursor)}` : customerRider;
        const res = await get(url, tokens.customer);
        for (const m of res.body.data) seen.set(m._id, m.message);
        cursor = res.body.data.at(-1)?.createdAt ?? cursor;
      };

      await collect(); // initial page load

      const sent = [];
      for (const text of ["poll one", "poll two", "poll three"]) {
        await post(customerRider, tokens.customer, { message: text });
        sent.push(text);
        await collect(); // a poll between each send, like a real interval
      }

      for (const text of sent) {
        assert.ok(
          [...seen.values()].includes(text),
          `missed "${text}" while polling`
        );
      }
    });

    // ================= PARTICIPANT ENFORCEMENT =================
    console.log("\n[5] Non-participants are rejected");
    await check("outsider cannot read a thread", async () => {
      const res = await get(customerRider, tokens.outsider);
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });
    await check("outsider cannot send into a thread", async () => {
      const res = await post(customerRider, tokens.outsider, { message: "let me in" });
      assert.equal(res.status, 403);
    });
    await check("customer cannot read the restaurant_rider thread", async () => {
      const res = await get(restaurantRider, tokens.customer);
      assert.equal(res.status, 403);
    });
    await check("customer cannot send into the restaurant_rider thread", async () => {
      const res = await post(restaurantRider, tokens.customer, { message: "nope" });
      assert.equal(res.status, 403);
    });
    await check("restaurant cannot read the customer_rider thread", async () => {
      const res = await get(customerRider, tokens.restaurant);
      assert.equal(res.status, 403);
    });
    await check("a rider not assigned to the order cannot read", async () => {
      const res = await get(`/api/chat/${noRiderOrderId}/customer_rider`, tokens.rider);
      assert.equal(res.status, 403);
    });
    await check("a rider not assigned to the order cannot send", async () => {
      const res = await post(`/api/chat/${noRiderOrderId}/customer_rider`, tokens.rider, {
        message: "hello?",
      });
      assert.equal(res.status, 403);
    });
    await check("the customer of that order can still read it", async () => {
      const res = await get(`/api/chat/${noRiderOrderId}/customer_rider`, tokens.customer);
      assert.equal(res.status, 200);
      assert.equal(res.body.count, 0);
    });

    // ================= BAD INPUT =================
    console.log("\n[6] Bad input is rejected");
    await check("an unknown channel is refused (read)", async () => {
      const res = await get(`/api/chat/${orderId}/customer_restaurant`, tokens.customer);
      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Invalid channel");
    });
    await check("an unknown channel is refused (send)", async () => {
      const res = await post(`/api/chat/${orderId}/customer_restaurant`, tokens.customer, {
        message: "hi",
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Invalid channel");
    });
    await check("a missing message is refused", async () => {
      const res = await post(customerRider, tokens.customer, {});
      assert.equal(res.status, 400);
      assert.equal(res.body.message, "message is required");
    });
    await check("a whitespace-only message is refused", async () => {
      const res = await post(customerRider, tokens.customer, { message: "    " });
      assert.equal(res.status, 400);
      assert.equal(res.body.message, "message is required");
    });
    await check("a non-string message is refused", async () => {
      const res = await post(customerRider, tokens.customer, { message: 12345 });
      assert.equal(res.status, 400);
    });
    await check("an over-long message is refused", async () => {
      const res = await post(customerRider, tokens.customer, { message: "x".repeat(2001) });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /2000 characters or fewer/);
    });
    await check("a message of exactly the limit is accepted", async () => {
      const res = await post(customerRider, tokens.customer, { message: "y".repeat(2000) });
      assert.equal(res.status, 201);
    });
    await check("a malformed orderId is refused", async () => {
      const res = await get("/api/chat/not-an-id/customer_rider", tokens.customer);
      assert.equal(res.status, 400);
      assert.equal(res.body.message, "Invalid orderId");
    });
    await check("an order that does not exist is refused", async () => {
      const res = await get(
        `/api/chat/${new mongoose.Types.ObjectId()}/customer_rider`,
        tokens.customer
      );
      assert.equal(res.status, 404);
      assert.equal(res.body.message, "Order not found");
    });
    await check("reading without a token gets 401", async () => {
      const res = await get(customerRider);
      assert.equal(res.status, 401);
    });
    await check("sending without a token gets 401", async () => {
      const res = await post(customerRider, undefined, { message: "hi" });
      assert.equal(res.status, 401);
    });
    await check("sending with a bad token gets 401", async () => {
      const res = await post(customerRider, "not-a-real-token", { message: "hi" });
      assert.equal(res.status, 401);
    });

    // ================= PERSISTENCE =================
    console.log("\n[7] Persisted message shape");
    await mongoose.connect(uri, { dbName: DB_NAME });
    const stored = await ChatMessage.find({ orderId }).sort({ createdAt: 1 });
    await check("messages were written to the chatMessage collection", () =>
      assert.ok(stored.length >= 9)
    );
    await check("stored messages have every required field", () =>
      assert.ok(
        stored.every(
          (m) => m.orderId && m.channel && m.senderId && m.senderRole && m.message && m.createdAt
        )
      )
    );
    await check("only the two allowed channels were ever stored", () =>
      assert.ok(stored.every((m) => ["customer_rider", "restaurant_rider"].includes(m.channel)))
    );
    await check("only the three allowed roles were ever stored", () =>
      assert.ok(stored.every((m) => ["customer", "rider", "restaurant"].includes(m.senderRole)))
    );
    await check("orderId is stored as a real ObjectId reference", () =>
      assert.ok(stored.every((m) => m.orderId instanceof mongoose.Types.ObjectId))
    );
    await mongoose.disconnect();

    // ================= THE VERCEL ENTRY PATH =================
    // On Vercel this file is required as a serverless module, so
    // `require.main === module` is false and the app is served from the
    // exported `app`. Chat must work in exactly that shape - this section
    // requiring the file the same way Vercel does, on its own port.
    console.log("\n[8] Chat works when index.js is required as a module (the Vercel path)");
    process.env.MONGODB_URL = uri;
    process.env.JWT_SECRET = JWT_SECRET;

    // eslint-disable-next-line global-require
    const exportedApp = require("../index.js");
    await check("requiring index.js returns the Express app without listening", () =>
      assert.equal(typeof exportedApp, "function")
    );

    // index.js kicks off connectDB() at module load and does not await it, so
    // wait for the connection to be established before asserting on responses.
    for (let attempt = 0; attempt < 40 && mongoose.connection.readyState !== 1; attempt += 1) {
      await sleep(100);
    }
    await check("index.js opened the MongoDB connection on its own", () =>
      assert.equal(mongoose.connection.readyState, 1)
    );

    const entryServer = http.createServer(exportedApp);
    await new Promise((resolve) => entryServer.listen(ENTRY_PORT, resolve));
    const onEntry = async (method, pathname, { token, body } = {}) => {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(`http://127.0.0.1:${ENTRY_PORT}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    };

    try {
      await check("a normal HTTP route is served from the exported app", async () => {
        const res = await onEntry("GET", "/api/orders");
        assert.equal(res.status, 200, `unexpected body: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.success, true);
      });
      await check("the participant check still rejects strangers", async () => {
        const res = await onEntry("GET", customerRider, { token: tokens.outsider });
        assert.equal(res.status, 403);
      });
      await check("sending over the exported app persists a message", async () => {
        const res = await onEntry("POST", customerRider, {
          token: tokens.customer,
          body: { message: "sent through the Vercel entry path" },
        });
        assert.equal(res.status, 201);
        assert.equal(res.body.data.senderRole, "customer");
      });
      await check("reading over the exported app returns it", async () => {
        const res = await onEntry("GET", customerRider, { token: tokens.customer });
        assert.equal(res.status, 200);
        assert.ok(
          res.body.data.some((m) => m.message === "sent through the Vercel entry path")
        );
      });
    } finally {
      await new Promise((resolve) => entryServer.close(resolve));
      await mongoose.disconnect();
    }
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
