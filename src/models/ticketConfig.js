const mongoose = require('mongoose');

const ticketOptionSchema = new mongoose.Schema({
  label: { type: String, required: true },
  description: { type: String, required: true },
  value: { type: String, required: true, unique: true }
}, { _id: false });

const ticketConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  panelChannelId: { type: String, required: true },
  panelMessageId: { type: String, default: null },
  ticketCategoryId: { type: String, required: true },
  panelMessage: { type: String, required: true },
  openingMessage: { type: String, required: true },
  options: { type: [ticketOptionSchema], required: true },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now }
});

module.exports = mongoose.models.TicketConfig || mongoose.model('TicketConfig', ticketConfigSchema);
