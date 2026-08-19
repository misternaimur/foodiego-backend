# Foodiego Backend

Backend server for Foodiego, built with Express.js.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository

   ```bash
   git clone https://github.com/misternaimur/foodiego-backend.git
   cd foodiego-backend
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Run the server

   ```bash
   npm start
   ```

   This runs the server with `nodemon`, which automatically restarts on file changes.

4. The server will be running at:

   ```
   http://localhost:8000
   ```

## Available Scripts

| Command       | Description                                    |
| ------------- | ----------------------------------------------- |
| `npm start`   | Start the server with nodemon (auto-restart)     |
| `npm run dev` | Same as `npm start`, for development             |

## Tech Stack

- [Express](https://expressjs.com/) — web framework
- [cors](https://www.npmjs.com/package/cors) — enable Cross-Origin Resource Sharing
- [dotenv](https://www.npmjs.com/package/dotenv) — load environment variables from `.env`
- [nodemon](https://www.npmjs.com/package/nodemon) — auto-restart server during development

## Project Structure

```
foodiego-backend/
├── index.js         # App entry point
├── package.json
└── README.md
```
