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

const setupOptions = payload.options.find((option) => option.name === 'setup')?.options?.map((option) => option.name) || [];
for (const name of ['default_reason', 'allow_user_open_tickets', 'panel_channel']) {
  assert.ok(setupOptions.includes(name), `Missing setup option: ${name}`);
}

assert.equal(typeof ticketHelper.buildTicketModal, 'function', 'Ticket modal builder should exist');
assert.equal(typeof ticketHelper.buildTicketFormResponse, 'function', 'Ticket form response helper should exist');
assert.equal(typeof ticketHelper.resolveTicketCategory, 'function', 'Ticket category resolver should exist');
assert.equal(typeof ticketHelper.buildTicketTranscript, 'function', 'Ticket transcript builder should exist');
assert.equal(typeof ticketHelper.buildTicketCategorySelect, 'function', 'Ticket category select builder should exist');
assert.equal(typeof ticketHelper.normalizeTicketCategories, 'function', 'Ticket category normalizer should exist');
assert.equal(typeof ticketHelper.buildTicketListEmbed, 'function', 'Ticket list embed builder should exist');
assert.equal(typeof ticketHelper.getTicketStatsForGuild, 'function', 'Ticket stats helper should exist');
assert.equal(typeof ticketHelper.buildTicketUserModal, 'function', 'Ticket user modal should exist');
assert.equal(typeof ticketHelper.buildTicketConfirmationRow, 'function', 'Ticket confirmation row should exist');
assert.equal(typeof ticketHelper.buildTicketSetupModal, 'function', 'Ticket setup modal should exist');
assert.equal(typeof ticketHelper.parseTicketSetupDraft, 'function', 'Ticket setup draft parser should exist');

const normalizedCategories = ticketHelper.normalizeTicketCategories(new Map([
  ['general', 'general-category'],
  ['billing', 'billing-category']
]));
assert.deepEqual(normalizedCategories, { general: 'general-category', billing: 'billing-category' });
assert.equal(ticketHelper.resolveTicketCategory({ ticketCategories: new Map([['general', 'general-category'], ['billing', 'billing-category']]) }, 'billing'), 'billing-category');

console.log('Ticket command test passed');
