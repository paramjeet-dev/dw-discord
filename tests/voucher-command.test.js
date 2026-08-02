const assert = require('node:assert/strict');
const path = require('node:path');

const command = require(path.join(__dirname, '..', 'src', 'commands', 'admin', 'voucher.js'));
const payload = command.data.toJSON();

assert.equal(payload.name, 'voucher');
assert.equal(payload.description, 'Manage server voucher codes.');

const subcommandNames = payload.options.map((option) => option.name);
for (const name of ['generate', 'use', 'list', 'delete']) {
  assert.ok(subcommandNames.includes(name), `Missing subcommand: ${name}`);
}

console.log('Voucher command test passed');
