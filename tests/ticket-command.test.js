const assert = require('node:assert/strict');
const path = require('node:path');

const command = require(path.join(__dirname, '..', 'src', 'commands', 'ticket.js'));
const ticketHelper = require(path.join(__dirname, '..', 'src', 'utils', 'ticketHelper.js'));
const payload = command.data.toJSON();

assert.equal(payload.name, 'ticket');
assert.equal(payload.description, 'Create and manage support tickets.');

const subcommandNames = payload.options.map((option) => option.name);
for (const name of ['create', 'close', 'reopen', 'claim', 'unclaim', 'add', 'remove', 'rename', 'setup', 'info', 'panel', 'list']) {
  assert.ok(subcommandNames.includes(name), `Missing subcommand: ${name}`);
}

assert.equal(typeof ticketHelper.buildTicketModal, 'function', 'Ticket modal builder should exist');
assert.equal(typeof ticketHelper.buildTicketFormResponse, 'function', 'Ticket form response helper should exist');
assert.equal(typeof ticketHelper.resolveTicketCategory, 'function', 'Ticket category resolver should exist');

console.log('Ticket command test passed');
