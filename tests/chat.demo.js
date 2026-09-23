// ============================================================
// LIVE CHAT DEMO (readable transcript, not assertions)
// ------------------------------------------------------------
// Unlike chat.e2e.test.js, this does not seed the database directly.
// It uses only the public API - register, login, create restaurant /
// rider / menu item / order - so the tokens and ids below are exactly
// what the frontend would get, and every request/response is printed.
//
// Handy for the frontend developer: the printed JSON is the real
// shape of each chat call.
//
// Run with:  npm run demo:chat
// ============================================================
const { spawn } = require("node:child_process");
const path = require("node:path");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const PORT = 8994;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function show(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const clipped = text.length > 300 ? `${text.slice(0, 300)}...` : text;
  console.log(`      ${label} ${clipped}`);
}

async function call(method, pathname, { token, body, label } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  console.log(`\n  --> ${method} ${pathname}${label ? `   (${label})` : ""}`);
  if (body !== undefined) show("body:", body);

  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();

  console.log(`  <-- ${res.status} ${res.statusText}`);
  show("", json);
  return { status: res.status, body: json };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${BASE_URL}/`)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error("server did not start");
}

function heading(text) {
  console.log(`\n${"=".repeat(72)}\n${text}\n${"=".repeat(72)}`);
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  console.log("Starting a throwaway in-memory MongoDB and the real server...");
  const server = spawn(process.execPath, [path.join(__dirname, "..", "index.js")], {
    env: { ...process.env, MONGODB_URL: uri, JWT_SECRET: "demo-secret", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.stdout.write(`    [server] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`    [server:err] ${d}`));
  await waitForServer();

  try {
    // ---------------------------------------------------------
    heading("STEP 1 - Set up accounts and an order, all through the public API");

    const register = async (name, email, role) => {
      const res = await call("POST", "/api/users/register", {
        body: { name, email, password: "password123", role },
      });
      return res.body;
    };

    const customer = await register("Casey Customer", "casey@demo.com", "customer");
    const rider = await register("Riley Rider", "riley@demo.com", "rider");
    const restaurantOwner = await register("Rita Owner", "rita@demo.com", "restaurant");
    const outsider = await register("Oscar Outsider", "oscar@demo.com", "customer");

    // A real login, to show the token the frontend would actually use.
    const login = await call("POST", "/api/users/login", {
      body: { email: "casey@demo.com", password: "password123" },
      label: "customer logs in",
    });
    customer.token = login.body.token;

    // Rider and restaurant profiles must point at their login account
    // through userId, or the participant check will not recognise them.
    const riderProfile = await call("POST", "/api/riders", {
      body: {
        userId: rider.data._id,
        name: "Riley Rider",
        email: "riley@demo.com",
        vehicleType: "bike",
        status: "approved",
      },
      label: "rider profile, linked via userId",
    });

    const restaurantProfile = await call("POST", "/api/restaurants", {
      body: {
        userId: restaurantOwner.data._id,
        restaurantName: "Demo Kitchen",
        ownerName: "Rita Owner",
        email: "rita@demo.com",
        address: "1 Demo Street",
        status: "approved",
      },
      label: "restaurant profile, linked via userId",
    });

    const menuItem = await call("POST", "/api/menu", {
      token: restaurantOwner.token,
      body: {
        restaurantId: restaurantProfile.body.data._id,
        name: "Demo Burger",
        price: 9.5,
      },
      label: "menu item (needs the restaurant's own token)",
    });

    const order = await call("POST", "/api/orders", {
      body: {
        customerId: customer.data._id,
        restaurantId: restaurantProfile.body.data._id,
        riderId: riderProfile.body.data._id,
        items: [
          {
            menuItemId: menuItem.body.data._id,
            name: "Demo Burger",
            price: 9.5,
            quantity: 1,
          },
        ],
        totalAmount: 9.5,
        deliveryAddress: "42 Customer Lane",
      },
      label: "the order that the chat hangs off",
    });

    const orderId = order.body.data._id;
    const cr = `/api/chat/${orderId}/customer_rider`;
    const rr = `/api/chat/${orderId}/restaurant_rider`;

    // ---------------------------------------------------------
    heading("STEP 2 - The customer and rider talk (customer_rider)");

    await call("GET", cr, { token: customer.token, label: "thread on page load" });

    await call("POST", cr, {
      token: customer.token,
      body: { message: "I am outside the building" },
      label: "customer sends",
    });

    await sleep(20);

    await call("POST", cr, {
      token: rider.token,
      body: { message: "On my way, 2 minutes" },
      label: "rider replies",
    });

    const history = await call("GET", cr, {
      token: rider.token,
      label: "rider reads the thread",
    });

    // ---------------------------------------------------------
    heading("STEP 3 - Polling for new messages with ?since=");

    const lastSeen = history.body.data.at(-1).createdAt;
    console.log(`\n  The client remembers the newest createdAt: ${lastSeen}`);

    await call("GET", `${cr}?since=${encodeURIComponent(lastSeen)}`, {
      token: rider.token,
      label: "poll with nothing new - returns only the boundary message",
    });

    await sleep(20);

    await call("POST", cr, {
      token: customer.token,
      body: { message: "I can see you now" },
      label: "customer sends while the rider is polling",
    });

    await call("GET", `${cr}?since=${encodeURIComponent(lastSeen)}`, {
      token: rider.token,
      label: "the next poll picks the new message up",
    });

    // ---------------------------------------------------------
    heading("STEP 4 - The restaurant and rider talk (restaurant_rider)");

    await call("POST", rr, {
      token: restaurantOwner.token,
      body: { message: "Order is packed and ready" },
      label: "restaurant sends",
    });

    await call("POST", rr, {
      token: rider.token,
      body: { message: "Picking it up now" },
      label: "rider replies",
    });

    await call("GET", rr, { token: restaurantOwner.token, label: "restaurant reads its thread" });

    await call("GET", cr, {
      token: customer.token,
      label: "customer's thread is untouched by the other channel",
    });

    // ---------------------------------------------------------
    heading("STEP 5 - Who is refused");

    await call("GET", cr, { token: outsider.token, label: "outsider reading" });
    await call("POST", cr, {
      token: outsider.token,
      body: { message: "let me in" },
      label: "outsider sending",
    });
    await call("GET", rr, { token: customer.token, label: "customer reaching into the other channel" });
    await call("GET", cr, { token: restaurantOwner.token, label: "restaurant reaching into the other channel" });
    await call("GET", cr, { label: "no token at all" });
    await call("GET", `${cr}?since=not-a-date`, { token: customer.token, label: "bad since value" });
    await call("POST", cr, {
      token: customer.token,
      body: { message: "   " },
      label: "empty message",
    });
    await call("POST", cr, {
      token: customer.token,
      body: { message: "z".repeat(2001) },
      label: "message over the 2000 character limit (body clipped above)",
    });

    // ---------------------------------------------------------
    heading("STEP 6 - What actually landed in the database");

    await mongoose.connect(uri, { dbName: "FoodBackend" });
    const ChatMessage = require("../models/ChatMessage");
    const stored = await ChatMessage.find({ orderId }).sort({ createdAt: 1 }).lean();

    console.log(`\n  ${stored.length} rows in the "chatMessage" collection:\n`);
    console.table(
      stored.map((m) => ({
        channel: m.channel,
        senderRole: m.senderRole,
        message: m.message.length > 40 ? `${m.message.slice(0, 40)}...` : m.message,
        createdAt: new Date(m.createdAt).toISOString(),
      }))
    );
    await mongoose.disconnect();
  } finally {
    server.kill();
    await sleep(300);
    await mongod.stop();
  }

  console.log("\nDemo complete.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("\nDemo crashed:", error);
  process.exit(1);
});
