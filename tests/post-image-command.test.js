const assert = require('node:assert/strict');
const path = require('node:path');

const command = require(path.join(__dirname, '..', 'src', 'commands', 'admin', 'postimage.js'));
const payload = command.data.toJSON();

assert.equal(payload.name, 'postimage');
assert.equal(payload.description, 'Post an uploaded image to the configured target channel.');
assert.ok(payload.options.some((option) => option.name === 'image' && option.type === 11));

console.log('Post-image command test passed');
