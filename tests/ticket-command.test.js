const assert = require('node:assert/strict');
const path = require('node:path');

const command = require(path.join(__dirname, '..', 'src', 'commands', 'ticket.js'));
const payload = command.data.toJSON();

assert.equal(payload.name, 'ticket');
assert.equal(payload.description, 'Create and manage support tickets.');

const subcommandNames = payload.options.map((option) => option.name);
for (const name of ['create', 'close', 'reopen', 'claim', 'unclaim', 'add', 'remove', 'rename', 'setup', 'info']) {
  assert.ok(subcommandNames.includes(name), `Missing subcommand: ${name}`);
}

console.log('Ticket command test passed');
