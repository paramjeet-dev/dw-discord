require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { connectDatabase } = require('./database/mongoose');
const path = require('node:path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.commands = new Collection();

async function loadCommands(dirPath = path.join(__dirname, 'commands')) {
  const { default: fs } = await import('node:fs/promises');
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await loadCommands(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const command = require(entryPath);
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`);
      }
    }
  }
}

async function loadEvents() {
  const { default: fs } = await import('node:fs/promises');
  const path = require('node:path');
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = (await fs.readdir(eventsPath)).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}

(async () => {
  await connectDatabase();
  await loadCommands();
  await loadEvents();
  client.login(process.env.DISCORD_TOKEN);
})();
