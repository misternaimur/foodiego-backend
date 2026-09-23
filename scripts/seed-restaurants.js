// ============================================================
// SEED DEMO RESTAURANTS, CATEGORIES AND MENU ITEMS
// ------------------------------------------------------------
// Creates restaurants with categories and menu items by POSTing to
// the running API - nothing is written to MongoDB directly, so every
// record goes through the same validation a real client would hit.
//
// One owner account per restaurant, so each restaurant is owned by a
// different login and the owner-scoped routes behave like real data:
//
//   owner user (role: restaurant)  -- one per restaurant
//     -> one restaurant profile (linked by userId)
//          -> 3-4 categories
//               -> 5-6 menu items each
//
// The users collection carries a unique, NON-sparse index on "uid"
// (uid_1), created by the frontend's User model which declares
// `uid: { unique: true, required: true }`, while POST /api/users/register
// never sets uid. MongoDB's unique index allows only one document with a
// missing/null uid, so a second registration fails with 500 E11000
// duplicate key on uid_1.
//
// To get past it this script assigns a unique uid straight to each newly
// registered owner (the API has no route for it). That frees the single
// null slot for the next registration. Everything else is created through
// the API. The proper fix is a sparse index in both models - see the note
// in the commit that added this file.
//
// Re-running is safe: an existing owner is logged into instead of
// registered again, an existing restaurant is reused (and moved to its own
// owner if it is still on someone else's), and a restaurant that already
// has categories is skipped.
//
// Start the backend first, then:
//   node scripts/seed-restaurants.js
//
// Environment overrides:
//   BASE_URL           API base, default http://127.0.0.1:8000
//   SEED_RESTAURANTS   how many restaurants, default 15 (10-20)
//   SEED_OWNER_PASSWORD  password for the owner accounts, default DemoPass123!
//   SEED_DRY=1         print the plan without posting anything
//   SEED_PURGE=1       delete the seeded demo data again (direct DB)
// ============================================================

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8000";
const HOW_MANY = Number(process.env.SEED_RESTAURANTS || 15);
const DRY_RUN = process.env.SEED_DRY === "1";

// Every seeded account and contact address uses this domain, so the demo
// data is easy to find and delete again.
const EMAIL_DOMAIN = "foodiego.test";
const PASSWORD = process.env.SEED_OWNER_PASSWORD || "DemoPass123!";

const AREAS = [
  "House 42, Road 7, Dhanmondi, Dhaka",
  "House 11, Road 2, Banani, Dhaka",
  "Apt 5B, Gulshan Avenue 12, Dhaka",
  "House 88, Road 13, Uttara Sector 4, Dhaka",
  "Shop 3, Mirpur Road 24, Dhaka",
  "House 19, Bashundhara Block C, Dhaka",
  "Holding 7, Agrabad, Chattogram",
  "House 25, Zindabazar, Sylhet",
  "Shop 14, Bailey Road, Dhaka",
  "House 63, Satmasjid Road, Dhaka",
];

const PHONES = [
  "+8801711223344",
  "+8801812345678",
  "+8801913456789",
  "+8801614567890",
  "+8801315678901",
];

const LOGOS = [
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4",
  "https://images.unsplash.com/photo-1552566626-52f8b828add9",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0",
  "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17",
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5",
];

// ------------------------------------------------------------
// The demo venues. Each category lists six items; the seeder takes a
// random five or six of them, and randomises the exact price a little.
// ------------------------------------------------------------
const VENUES = [
  {
    restaurantName: "Dhaka Biryani House",
    cuisineType: "Bangladeshi",
    categories: {
      Biryani: ["Kacchi Biryani", "Chicken Biryani", "Beef Tehari", "Mutton Biryani", "Morog Polao", "Vegetable Biryani"],
      "Rice & Curry": ["Beef Bhuna", "Chicken Rezala", "Rui Fish Curry", "Prawn Malai Curry", "Dal Tadka", "Mixed Vegetable Curry"],
      Bhorta: ["Aloo Bhorta", "Begun Bhorta", "Shutki Bhorta", "Tomato Bhorta", "Lau Bhorta", "Dried Fish Bhorta"],
      Drinks: ["Borhani", "Lemon Iced Tea", "Sweet Lassi", "Mango Juice", "Sugarcane Juice", "Bottled Water"],
    },
  },
  {
    restaurantName: "Spice Route Indian Kitchen",
    cuisineType: "Indian",
    categories: {
      Starters: ["Paneer Tikka", "Chicken Pakora", "Samosa", "Onion Bhaji", "Seekh Kebab", "Hara Bhara Kabab"],
      "Main Course": ["Butter Chicken", "Palak Paneer", "Rogan Josh", "Chana Masala", "Dal Makhani", "Fish Curry"],
      Breads: ["Butter Naan", "Garlic Naan", "Tandoori Roti", "Paratha", "Kulcha", "Puri"],
      Desserts: ["Gulab Jamun", "Ras Malai", "Kheer", "Jalebi", "Kulfi", "Gajar Halwa"],
    },
  },
  {
    restaurantName: "Golden Dragon Chinese",
    cuisineType: "Chinese",
    categories: {
      Soups: ["Hot & Sour Soup", "Sweet Corn Soup", "Chicken Noodle Soup", "Tom Yum Soup", "Wonton Soup", "Miso Soup"],
      Noodles: ["Chicken Chow Mein", "Beef Hakka Noodles", "Singapore Noodles", "Prawn Noodles", "Vegetable Chow Mein", "Garlic Noodles"],
      "Rice & Mains": ["Egg Fried Rice", "Chicken Manchurian", "Sweet & Sour Chicken", "Kung Pao Chicken", "Beef in Black Bean", "Chilli Prawns"],
      Sides: ["Chicken Spring Rolls", "Prawn Crackers", "Fried Wontons", "Chilli Garlic Potato", "Steamed Dumplings", "Sesame Prawn Toast"],
    },
  },
  {
    restaurantName: "Bangkok Street Thai",
    cuisineType: "Thai",
    categories: {
      "Street Food": ["Pad Thai", "Som Tam", "Moo Ping", "Khao Pad", "Satay Skewers", "Mango Sticky Rice"],
      "Curry & Soup": ["Green Curry", "Red Curry", "Massaman Curry", "Tom Yum Goong", "Tom Kha Gai", "Panang Curry"],
      "Wok & Grill": ["Pad See Ew", "Basil Chicken", "Grilled Prawns", "Crying Tiger Beef", "Cashew Chicken", "Pineapple Fried Rice"],
      Drinks: ["Thai Iced Tea", "Coconut Water", "Lemongrass Cooler", "Fresh Lime Soda", "Iced Coffee", "Tamarind Juice"],
    },
  },
  {
    restaurantName: "Little Italy Trattoria",
    cuisineType: "Italian",
    categories: {
      Pizza: ["Margherita", "Pepperoni", "Quattro Formaggi", "BBQ Chicken", "Vegetariana", "Diavola"],
      Pasta: ["Spaghetti Carbonara", "Penne Arrabbiata", "Fettuccine Alfredo", "Lasagne", "Ravioli Ricotta", "Seafood Linguine"],
      Antipasti: ["Bruschetta", "Garlic Bread", "Caprese Salad", "Arancini", "Garlic Prawns", "Olive Tapenade"],
      Desserts: ["Tiramisu", "Panna Cotta", "Gelato", "Cannoli", "Chocolate Fondant", "Affogato"],
    },
  },
  {
    restaurantName: "El Taco Loco",
    cuisineType: "Mexican",
    categories: {
      Tacos: ["Beef Taco", "Chicken Taco", "Fish Taco", "Al Pastor Taco", "Veggie Taco", "Birria Taco"],
      Burritos: ["Chicken Burrito", "Beef Burrito Bowl", "Carnitas Burrito", "Veggie Burrito", "Shrimp Burrito", "Breakfast Burrito"],
      Sides: ["Loaded Nachos", "Guacamole & Chips", "Quesadilla", "Elote", "Refried Beans", "Mexican Rice"],
      Drinks: ["Horchata", "Agua Fresca", "Mexican Coke", "Jarritos", "Lemonade", "Iced Tea"],
    },
  },
  {
    restaurantName: "Sakura Japanese Grill",
    cuisineType: "Japanese",
    categories: {
      Sushi: ["Salmon Nigiri", "Tuna Maki", "California Roll", "Dragon Roll", "Prawn Tempura Roll", "Avocado Roll"],
      Ramen: ["Tonkotsu Ramen", "Shoyu Ramen", "Miso Ramen", "Spicy Chicken Ramen", "Seafood Ramen", "Vegetable Ramen"],
      "Grill & Rice": ["Chicken Teriyaki", "Beef Yakiniku", "Salmon Teriyaki", "Katsudon", "Chicken Katsu Curry", "Unagi Don"],
      Starters: ["Edamame", "Gyoza", "Takoyaki", "Agedashi Tofu", "Seaweed Salad", "Miso Soup"],
    },
  },
  {
    restaurantName: "Seoul BBQ Garden",
    cuisineType: "Korean",
    categories: {
      BBQ: ["Bulgogi Beef", "Samgyeopsal", "Galbi Ribs", "Spicy Pork Bulgogi", "Chicken Dak Galbi", "Grilled Mackerel"],
      "Rice & Stew": ["Bibimbap", "Kimchi Fried Rice", "Kimchi Jjigae", "Doenjang Jjigae", "Tteokbokki", "Japchae"],
      Sides: ["Kimchi", "Pickled Radish", "Seasoned Spinach", "Korean Potato Salad", "Fish Cake Stir Fry", "Bean Sprout Salad"],
      Drinks: ["Korean Plum Tea", "Barley Tea", "Yuja Ade", "Milkis", "Iced Citron Tea", "Soju Mocktail"],
    },
  },
  {
    restaurantName: "Istanbul Kebab House",
    cuisineType: "Turkish",
    categories: {
      Kebabs: ["Chicken Shish", "Adana Kebab", "Lamb Kofta", "Mixed Grill", "Doner Kebab", "Iskender Kebab"],
      "Mezze & Sides": ["Hummus", "Baba Ganoush", "Tabbouleh", "Stuffed Vine Leaves", "Turkish Bread", "Grilled Halloumi"],
      "Pide & Rice": ["Cheese Pide", "Minced Meat Pide", "Spinach Pide", "Turkish Pilaf", "Bulgur Pilaf", "Lahmacun"],
      Desserts: ["Baklava", "Kunefe", "Turkish Delight", "Sutlac", "Revani", "Chocolate Baklava"],
    },
  },
  {
    restaurantName: "Liberty Diner",
    cuisineType: "American",
    categories: {
      Burgers: ["Classic Cheeseburger", "Bacon Burger", "Mushroom Swiss Burger", "Double Patty Burger", "Crispy Chicken Burger", "Veggie Burger"],
      "Wings & Sides": ["Buffalo Wings", "BBQ Wings", "Sweet Potato Fries", "Onion Rings", "Loaded Fries", "Coleslaw"],
      Mains: ["Grilled Chicken Steak", "Ribs & Fries", "Fish & Chips", "Mac & Cheese", "Club Sandwich", "Pulled Pork Sandwich"],
      Shakes: ["Vanilla Milkshake", "Chocolate Shake", "Oreo Shake", "Strawberry Shake", "Peanut Butter Shake", "Cold Brew"],
    },
  },
  {
    restaurantName: "Quick Bite Fast Food",
    cuisineType: "Fast Food",
    categories: {
      Burgers: ["Beef Burger", "Chicken Cheese Burger", "Zinger Burger", "Naga Burger", "Fish Burger", "Double Beef Burger"],
      "Fried Chicken": ["Fried Chicken 2pc", "Fried Chicken 4pc", "Chicken Strips", "Popcorn Chicken", "Hot Wings", "Chicken Sandwich"],
      Sides: ["French Fries", "Masala Fries", "Chicken Nuggets", "Chicken Popcorn", "Coleslaw", "Cheese Sticks"],
      Beverages: ["Cola", "Sprite", "Orange Soda", "Mango Drink", "Iced Lemon Tea", "Mineral Water"],
    },
  },
  {
    restaurantName: "Corner Cafe & Bakery",
    cuisineType: "Cafe",
    categories: {
      Coffee: ["Espresso", "Americano", "Cappuccino", "Caffe Latte", "Flat White", "Mocha"],
      "Cakes & Pastry": ["Chocolate Fudge Cake", "Red Velvet Slice", "Cheesecake", "Carrot Cake", "Butter Croissant", "Blueberry Muffin"],
      "Light Bites": ["Chicken Club Sandwich", "Tuna Melt", "Caesar Salad", "Quiche Lorraine", "Avocado Toast", "Tomato Soup"],
      "Cold Drinks": ["Cold Brew", "Iced Latte", "Fresh Orange Juice", "Berry Smoothie", "Sparkling Lemonade", "Iced Matcha"],
    },
  },
  {
    restaurantName: "Sweet Tooth Dessert Bar",
    cuisineType: "Dessert",
    categories: {
      IceCream: ["Vanilla Scoop", "Chocolate Scoop", "Strawberry Scoop", "Mango Sundae", "Brownie Sundae", "Caramel Swirl"],
      "Cakes & Waffles": ["Belgian Waffle", "Chocolate Lava Cake", "NY Cheesecake", "Red Velvet Cupcake", "Banoffee Pie", "Apple Crumble"],
      "Sweet Bites": ["Churros", "Macarons Box", "Crepe Suzette", "Fudge Brownie", "Cinnamon Roll", "Nutella Toast"],
      "Drinks": ["Hot Chocolate", "Milkshake", "Bubble Tea", "Thai Tea", "Cold Coffee", "Mango Lassi"],
    },
  },
  {
    restaurantName: "Bayview Seafood Shack",
    cuisineType: "Seafood",
    categories: {
      "Grilled Fish": ["Grilled Pomfret", "Grilled Rupchanda", "Baked Salmon", "Grilled Tilapia", "Sea Bass Fillet", "BBQ Prawns"],
      "Curry & Rice": ["Prawn Malai Curry", "Crab Masala", "Fish Kalia", "Squid Curry", "Seafood Fried Rice", "Prawn Biryani"],
      Starters: ["Fish Fingers", "Prawn Tempura", "Calamari Rings", "Garlic Mussels", "Crab Cakes", "Oyster Platter"],
      Sides: ["Lemon Butter Rice", "Fried Vegetables", "Green Salad", "Garlic Bread", "Mashed Potato", "Tartar Dip"],
    },
  },
  {
    restaurantName: "Olive & Thyme Mediterranean",
    cuisineType: "Mediterranean",
    categories: {
      "Grills & Wraps": ["Chicken Souvlaki", "Lamb Gyro", "Falafel Wrap", "Grilled Halloumi Wrap", "Shawarma Plate", "Mixed Grill Platter"],
      Mezze: ["Hummus Trio", "Tzatziki", "Muhammara", "Feta & Olives", "Greek Salad", "Dolma"],
      "Bowls & Pasta": ["Quinoa Bowl", "Mediterranean Pasta", "Fattoush Bowl", "Roasted Veg Couscous", "Lentil Soup", "Stuffed Peppers"],
      Desserts: ["Baklava", "Greek Yoghurt & Honey", "Loukoumades", "Semolina Cake", "Fig Tart", "Pistachio Ice Cream"],
    },
  },
];

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// "Quick Bite Fast Food" -> "quickbitefastfood", used in the owner email.
const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

const ADJECTIVES = ["Signature", "House", "Chef's Special", "Classic", "Traditional", "Freshly Made"];

function describeWith(name, cuisineType) {
  return `${pick(ADJECTIVES)} ${name}, prepared fresh in our ${cuisineType} kitchen.`;
}

// A flat random price across the whole menu looks wrong (water costing more
// than biryani), so each item is priced from the band its category falls in.
const PRICE_BANDS = [
  { pattern: /drink|beverage|shake|coffee|juice|tea|soda|water|lassi|cooler|smoothie|mocktail/i, min: 60, max: 220 },
  { pattern: /dessert|cake|icecream|ice cream|sweet|pastry|waffle|pudding/i, min: 120, max: 420 },
  { pattern: /starter|side|soup|mezze|antipasti|bhorta|bread|salad|snack|appetizer/i, min: 100, max: 400 },
  { pattern: /pizza|burger|biryani|curry|pasta|kebab|grill|bbq|main|noodle|rice|ramen|taco|burrito|steak|seafood|fish|wok|platter/i, min: 250, max: 900 },
];

function priceFor(categoryName) {
  const band = PRICE_BANDS.find((b) => b.pattern.test(categoryName)) || { min: 150, max: 700 };
  // Rounded to the nearest 10 so prices read like a real menu.
  return Math.round(randomInt(band.min, band.max) / 10) * 10;
}

let requestCount = 0;

// Direct database handle, used only for the two things the API cannot do:
// assigning a uid (no route exists for it) and purging. Everything else in
// this script goes through HTTP.
let mongoose = null;
let directDb = null;

async function openDb() {
  if (directDb) return directDb;
  mongoose = require("mongoose");
  require("dotenv").config();
  await mongoose.connect(process.env.MONGODB_URL, { dbName: "FoodBackend" });
  directDb = mongoose.connection.db;
  return directDb;
}

async function api(method, pathname, { token, body, tolerate = [] } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (DRY_RUN) {
    requestCount += 1;
    const isRead = method === "GET";
    return {
      status: isRead ? 200 : 201,
      // List endpoints return an array, writes return the created document,
      // so the callers below can follow the same code path either way.
      body: isRead
        ? { success: true, count: 0, data: [] }
        : { success: true, data: { _id: `dry-${requestCount}`, ...body } },
    };
  }

  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  requestCount += 1;

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`${method} ${pathname} returned ${res.status} with a non-JSON body`);
  }

  if (!res.ok && res.status !== 409 && !tolerate.includes(res.status)) {
    throw new Error(`${method} ${pathname} -> ${res.status} ${JSON.stringify(json)}`);
  }
  return { status: res.status, body: json };
}

// Registers the shared demo owner, or logs into it if it is already there,
// so the script can be run more than once. A 500 is tolerated on register
// because a still-taken "uid" slot makes it fail that way - see the note at
// the top of this file.
async function ensureOwner(venue) {
  const slug = slugify(venue.restaurantName);
  const email = `owner.${slug}@${EMAIL_DOMAIN}`;
  const name = `${venue.restaurantName} Manager`;

  const registered = await api("POST", "/api/users/register", {
    body: { name, email, password: PASSWORD, role: "restaurant" },
    tolerate: [500],
  });

  let token;
  let userId;
  let created;

  if (registered.status === 201) {
    token = registered.body.token;
    userId = registered.body.data._id;
    created = true;
  } else {
    const loggedIn = await api("POST", "/api/users/login", {
      body: { email, password: PASSWORD },
    });
    if (loggedIn.status !== 200) {
      throw new Error(
        `could not register or log in as ${email}. ` +
          `If this owner already exists under a different password, pass ` +
          `SEED_OWNER_PASSWORD. Response: ${JSON.stringify(loggedIn.body)}`
      );
    }
    token = loggedIn.body.token;
    userId = loggedIn.body.data._id;
    created = false;
  }

  // Free the single null-uid slot so the next owner can register.
  if (!DRY_RUN) {
    const db = await openDb();
    const user = await db
      .collection("users")
      .findOne({ _id: mongoose.Types.ObjectId.createFromHexString(String(userId)) }, { projection: { uid: 1 } });
    if (user && !user.uid) {
      await db.collection("users").updateOne(
        { _id: user._id },
        { $set: { uid: `demo-${slug}-${Math.random().toString(36).slice(2, 10)}` } }
      );
    }
  }

  return { token, userId, email, name, created };
}

// Reuses the restaurant if one with this name already exists. If it is still
// owned by somebody else (for example after switching from a single shared
// owner to one owner per restaurant), it is handed to this owner.
async function ensureRestaurant(owner, venue, index) {
  const all = await api("GET", "/api/restaurants");
  const existing = (all.body.data || []).find(
    (r) => r.restaurantName === venue.restaurantName
  );

  if (existing) {
    const currentOwnerId = String(existing.userId?._id || existing.userId);
    if (currentOwnerId === String(owner.userId)) {
      return { restaurant: existing, existed: true, reassigned: false };
    }
    const moved = await api("PUT", `/api/restaurants/${existing._id}`, {
      body: { userId: owner.userId, ownerName: owner.name },
    });
    return { restaurant: moved.body.data, existed: true, reassigned: true };
  }

  const opening = `${String(randomInt(8, 11)).padStart(2, "0")}:00`;
  const closing = `${String(randomInt(21, 23)).padStart(2, "0")}:30`;

  const created = await api("POST", "/api/restaurants", {
    body: {
      userId: owner.userId,
      restaurantName: venue.restaurantName,
      ownerName: owner.name,
      email: `contact.${slugify(venue.restaurantName)}@${EMAIL_DOMAIN}`,
      phone: pick(PHONES),
      address: AREAS[index % AREAS.length],
      description: `A ${venue.cuisineType} kitchen serving freshly prepared favourites.`,
      logoUrl: pick(LOGOS),
      cuisineType: venue.cuisineType,
      openingTime: opening,
      closingTime: closing,
      isOpen: true,
      status: "approved",
      rating: Number((randomInt(35, 50) / 10).toFixed(1)),
    },
  });
  return { restaurant: created.body.data, existed: false, reassigned: false };
}

async function ensureMenu(owner, restaurantId, venue) {
  const existing = await api("GET", `/api/categories/restaurant/${restaurantId}`);
  if ((existing.body.data || []).length > 0) {
    return { categories: existing.body.count, items: 0, skipped: true };
  }

  let categoryCount = 0;
  let itemCount = 0;

  for (const [categoryName, itemNames] of Object.entries(venue.categories)) {
    const category = await api("POST", "/api/categories", {
      token: owner.token,
      body: {
        restaurantId,
        name: categoryName,
        description: `${categoryName} from our ${venue.cuisineType} menu.`,
      },
    });
    categoryCount += 1;

    // Five or six items per category, in a random order.
    const wanted = shuffle(itemNames).slice(0, randomInt(5, 6));

    for (const itemName of wanted) {
      const price = priceFor(categoryName);
      await api("POST", "/api/menu", {
        token: owner.token,
        body: {
          restaurantId,
          category: category.body.data._id, // the model expects a Category id, not a name
          name: itemName,
          description: describeWith(itemName, venue.cuisineType),
          price,
          imageUrl: pick(LOGOS),
          isAvailable: true,
          isActive: true,
        },
      });
      itemCount += 1;
    }
  }

  return { categories: categoryCount, items: itemCount, skipped: false };
}

// ------------------------------------------------------------
// PURGE - SEED_PURGE=1 removes the demo data again
// ------------------------------------------------------------
// This is the one part that does not go through the API: there is no
// DELETE endpoint for categories at all, so removing a seeded restaurant
// cleanly needs direct database access. It only ever touches rows in this
// script's namespace - owner accounts on the demo email domain, the
// restaurants those owners hold, and their categories and menu items.
async function purge() {
  const db = await openDb();

  const owners = await db
    .collection("users")
    .find({ email: new RegExp(`@${EMAIL_DOMAIN.replace(/\./g, "\\.")}$`) })
    .project({ _id: 1, email: 1 })
    .toArray();

  if (owners.length === 0) {
    console.log(`Nothing to purge: no ${EMAIL_DOMAIN} accounts found.`);
    await mongoose.disconnect();
    return;
  }

  const ownerIds = owners.map((o) => o._id);
  const restaurants = await db
    .collection("restaurant")
    .find({ userId: { $in: ownerIds } })
    .project({ _id: 1, restaurantName: 1, userId: 1 })
    .toArray();
  const ids = restaurants.map((r) => r._id);

  const items = await db.collection("menuItem").deleteMany({ restaurantId: { $in: ids } });
  const categories = await db.collection("category").deleteMany({ restaurantId: { $in: ids } });
  const removed = await db.collection("restaurant").deleteMany({ _id: { $in: ids } });
  const users = await db.collection("users").deleteMany({ _id: { $in: ownerIds } });

  console.log(`Purged ${removed.deletedCount} demo restaurants and ${users.deletedCount} owner accounts:`);
  restaurants.forEach((r) => console.log(`  - ${r.restaurantName}`));
  console.log(`  ${categories.deletedCount} categories, ${items.deletedCount} menu items`);
  if (owners.length !== restaurants.length) {
    console.log(`  (${owners.length - restaurants.length} demo accounts owned no restaurant)`);
  }
  console.log("\nNote: this frees the single uid-less slot, so one more");
  console.log("POST /api/users/register will work until it is taken again.");
  await mongoose.disconnect();
}

async function main() {
  if (process.env.SEED_PURGE === "1") {
    await purge();
    return;
  }

  console.log(`Seeding ${HOW_MANY} restaurants${DRY_RUN ? " (DRY RUN - nothing will be posted)" : ""}`);
  console.log(`API: ${BASE_URL}\n`);

  // Fail fast with a clear message if the server is not reachable.
  if (!DRY_RUN) {
    try {
      const health = await fetch(`${BASE_URL}/`);
      if (!health.ok) throw new Error(`status ${health.status}`);
    } catch (error) {
      console.error(`Cannot reach ${BASE_URL} - is the backend running? (${error.message})`);
      process.exit(1);
    }
  }

  const venues = [];
  for (let i = 0; i < HOW_MANY; i += 1) venues.push(VENUES[i % VENUES.length]);

  let totals = {
    owners: 0,
    existingOwners: 0,
    restaurants: 0,
    existingRestaurants: 0,
    reassigned: 0,
    categories: 0,
    items: 0,
    skippedMenus: 0,
  };

  for (let i = 0; i < venues.length; i += 1) {
    const venue = venues[i];
    const label = HOW_MANY > VENUES.length ? `${venue.restaurantName} #${i + 1}` : venue.restaurantName;

    const owner = await ensureOwner(venue);
    const { restaurant, existed, reassigned } = await ensureRestaurant(owner, venue, i);
    const menu = await ensureMenu(owner, restaurant._id, venue);

    if (owner.created) totals.owners += 1;
    else totals.existingOwners += 1;
    if (existed) totals.existingRestaurants += 1;
    else totals.restaurants += 1;
    if (reassigned) totals.reassigned += 1;
    if (menu.skipped) totals.skippedMenus += 1;
    totals.categories += menu.categories;
    totals.items += menu.items;

    const menuNote = menu.skipped
      ? "menu already seeded"
      : `${menu.categories} categories, ${menu.items} items`;

    console.log(
      `${String(i + 1).padStart(2)}. ${label.padEnd(34)} ${venue.cuisineType.padEnd(14)} ` +
        `${menuNote}${reassigned ? "  [moved to its own owner]" : ""}`
    );
  }

  console.log(`\n${"-".repeat(72)}`);
  console.log(`owners created      : ${totals.owners}${totals.existingOwners ? ` (${totals.existingOwners} already existed)` : ""}`);
  console.log(`restaurants created : ${totals.restaurants}`);
  console.log(`restaurants reused  : ${totals.existingRestaurants}${totals.reassigned ? ` (${totals.reassigned} moved to their own owner)` : ""}`);
  console.log(`categories created  : ${totals.categories}`);
  console.log(`menu items created  : ${totals.items}`);
  if (totals.skippedMenus) console.log(`menus skipped       : ${totals.skippedMenus}`);
  console.log(`API requests made   : ${requestCount}`);
  console.log(`\nEach restaurant has its own owner account on the ${EMAIL_DOMAIN} domain:`);
  console.log(`  owner.<restaurant>@${EMAIL_DOMAIN}   password: ${PASSWORD}`);

  // openDb() is lazy and only used when assigning uids; its mongoose
  // connection would otherwise keep this process alive after the work is done.
  if (directDb) await mongoose.disconnect();
}

main().catch((error) => {
  console.error("\nSeeding failed:", error.message);
  process.exit(1);
});
