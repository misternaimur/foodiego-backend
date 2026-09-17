// ============================================================
// SEED DEMO RESTAURANTS, CATEGORIES AND MENU ITEMS
// ------------------------------------------------------------
// Creates restaurants with categories and menu items by POSTing to
// the running API - nothing is written to MongoDB directly, so every
// record goes through the same validation a real client would hit.
//
// Each restaurant needs an owner account because POST /api/categories and
// POST /api/menu are owner-protected on the server side.
//
// They all share ONE demo owner account, and that is deliberate rather than
// an oversight. The shared "users" collection carries a unique, non-sparse
// index on "uid" (created by the frontend's User model, which declares
// `uid: { unique: true, required: true }`). This backend's register endpoint
// never sets uid, so only one account without a uid can exist at a time -
// a second register returns 500 with E11000 duplicate key on uid_1.
// Reusing one owner keeps the seed working without touching that index.
// Override the account with SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD.
//
//   owner user (role: restaurant, shared)
//     -> restaurant profile (linked by userId)
//          -> 3-4 categories
//               -> 5-6 menu items each
//
// Re-running is safe: the owner is logged into if it already exists,
// an existing restaurant is reused, and a restaurant that already has
// categories is skipped.
//
// Start the backend first, then:
//   node scripts/seed-restaurants.js
//
// Environment overrides:
//   BASE_URL           API base, default http://127.0.0.1:8000
//   SEED_RESTAURANTS   how many restaurants, default 15 (10-20)
//   SEED_DRY=1         print the plan without posting anything
//   SEED_PURGE=1       delete the seeded demo data again (direct DB)
// ============================================================

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8000";
const HOW_MANY = Number(process.env.SEED_RESTAURANTS || 15);
const DRY_RUN = process.env.SEED_DRY === "1";

// Every seeded account uses this domain, so the demo data is easy to
// find and delete later.
const EMAIL_DOMAIN = "foodiego.test";
const PASSWORD = process.env.SEED_OWNER_PASSWORD || "DemoPass123!";
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL || `owner.demo@${EMAIL_DOMAIN}`;
const OWNER_NAME = "Foodiego Demo Owner";

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
// so the script can be run more than once. The 500 is tolerated because a
// taken "uid" slot makes registering an existing owner fail that way - see
// the note at the top of this file.
async function ensureSharedOwner() {
  const registered = await api("POST", "/api/users/register", {
    body: { name: OWNER_NAME, email: OWNER_EMAIL, password: PASSWORD, role: "restaurant" },
    tolerate: [500],
  });

  if (registered.status === 201) {
    return { token: registered.body.token, userId: registered.body.data._id, created: true };
  }

  const loggedIn = await api("POST", "/api/users/login", {
    body: { email: OWNER_EMAIL, password: PASSWORD },
  });
  if (loggedIn.status !== 200) {
    throw new Error(
      `could not register or log in as ${OWNER_EMAIL}. ` +
        `If the shared demo owner already exists under a different password, ` +
        `pass SEED_OWNER_PASSWORD. Response: ${JSON.stringify(loggedIn.body)}`
    );
  }
  return { token: loggedIn.body.token, userId: loggedIn.body.data._id, created: false };
}

// Reuses the restaurant if one with this name already exists. Matching is by
// name rather than by userId because every seeded restaurant shares one owner.
async function ensureRestaurant(owner, venue, index) {
  const all = await api("GET", "/api/restaurants");
  const existing = (all.body.data || []).find(
    (r) => r.restaurantName === venue.restaurantName
  );
  if (existing) return { restaurant: existing, existed: true };

  const opening = `${String(randomInt(8, 11)).padStart(2, "0")}:00`;
  const closing = `${String(randomInt(21, 23)).padStart(2, "0")}:30`;

  const created = await api("POST", "/api/restaurants", {
    body: {
      userId: owner.userId,
      restaurantName: venue.restaurantName,
      ownerName: OWNER_NAME,
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
  return { restaurant: created.body.data, existed: false };
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
// cleanly needs direct database access. It only ever touches rows that
// this script creates - restaurants whose owner is the shared demo owner,
// plus their categories, menu items and the owner account itself.
async function purge() {
  const mongoose = require("mongoose");
  require("dotenv").config();
  await mongoose.connect(process.env.MONGODB_URL, { dbName: "FoodBackend" });
  const db = mongoose.connection.db;

  const owner = await db.collection("users").findOne({ email: OWNER_EMAIL });
  if (!owner) {
    console.log(`Nothing to purge: no ${EMAIL_DOMAIN} owner account found.`);
    process.exit(0);
  }

  const restaurants = await db
    .collection("restaurant")
    .find({ userId: owner._id })
    .project({ _id: 1, restaurantName: 1 })
    .toArray();
  const ids = restaurants.map((r) => r._id);

  const items = await db.collection("menuItem").deleteMany({ restaurantId: { $in: ids } });
  const categories = await db.collection("category").deleteMany({ restaurantId: { $in: ids } });
  const removed = await db.collection("restaurant").deleteMany({ _id: { $in: ids } });
  await db.collection("users").deleteOne({ _id: owner._id });

  console.log(`Purged ${removed.deletedCount} demo restaurants:`);
  restaurants.forEach((r) => console.log(`  - ${r.restaurantName}`));
  console.log(`  ${categories.deletedCount} categories, ${items.deletedCount} menu items, 1 owner account`);
  console.log("\nNote: deleting this owner also frees the single uid-less slot,");
  console.log("so POST /api/users/register works once more until it is taken again.");
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

  const owner = await ensureSharedOwner();
  console.log(
    `Owner: ${OWNER_EMAIL} (${owner.created ? "registered now" : "already existed, logged in"})\n`
  );

  let totals = { restaurants: 0, existingRestaurants: 0, categories: 0, items: 0, skippedMenus: 0 };

  for (let i = 0; i < venues.length; i += 1) {
    const venue = venues[i];
    const label = HOW_MANY > VENUES.length ? `${venue.restaurantName} #${i + 1}` : venue.restaurantName;

    const { restaurant, existed } = await ensureRestaurant(owner, venue, i);
    const menu = await ensureMenu(owner, restaurant._id, venue);

    if (existed) totals.existingRestaurants += 1;
    else totals.restaurants += 1;
    if (menu.skipped) totals.skippedMenus += 1;
    totals.categories += menu.categories;
    totals.items += menu.items;

    console.log(
      `${String(i + 1).padStart(2)}. ${label.padEnd(34)} ${venue.cuisineType.padEnd(14)} ` +
        `${menu.skipped ? "already had categories, skipped" : `${menu.categories} categories, ${menu.items} items`}`
    );
  }

  console.log(`\n${"-".repeat(72)}`);
  console.log(`restaurants created : ${totals.restaurants}`);
  console.log(`restaurants reused  : ${totals.existingRestaurants}`);
  console.log(`categories created  : ${totals.categories}`);
  console.log(`menu items created  : ${totals.items}`);
  if (totals.skippedMenus) console.log(`menus skipped       : ${totals.skippedMenus}`);
  console.log(`API requests made   : ${requestCount}`);
  console.log(`\nAll owner accounts use the ${EMAIL_DOMAIN} domain, e.g. ${OWNER_EMAIL}`);
}

main().catch((error) => {
  console.error("\nSeeding failed:", error.message);
  process.exit(1);
});
