const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true, unique: true, index: true },
  openerId: { type: String, required: true },
  optionValue: { type: String, required: true },
  optionLabel: { type: String, required: true },
  status: { type: String, required: true, enum: ['open', 'closed'], default: 'open' },
  createdAt: { type: Date, required: true, default: Date.now },
  closedAt: { type: Date, default: null },
  claimedBy: { type: String, default: null }
});

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
