# Discord Bot Boilerplate

This project sets up a Discord bot using discord.js with slash commands and a MongoDB connection via Mongoose.

## Quick start

1. Copy .env.example to .env and fill in your values.
2. Install dependencies with `npm install`.
3. Register slash commands with `npm run deploy:commands`.
4. Start the bot with `npm start`.

## Structure

- `src/index.js` starts the bot and loads commands/events.
- `src/commands/` contains slash commands.
- `src/events/` contains event handlers.
- `src/database/` contains the MongoDB connection setup.
