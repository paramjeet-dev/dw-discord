const assert = require('node:assert/strict');
const path = require('node:path');

const command = require(path.join(__dirname, '..', 'src', 'commands', 'admin', 'giveaway.js'));
const payload = command.data.toJSON();

assert.equal(payload.name, 'giveaway');
assert.equal(payload.description, 'Manage giveaways in this server.');

const subcommandNames = payload.options.map((option) => option.name);
for (const name of ['create', 'list', 'edit', 'delete', 'info', 'reroll', 'end']) {
  assert.ok(subcommandNames.includes(name), `Missing subcommand: ${name}`);
}

console.log('Giveaway command test passed');
