const mongoose = require('mongoose');

const ticketSettingsSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  categoryId: {
    type: String,
    default: null
  },
  supportRoleId: {
    type: String,
    default: null
  },
  transcriptChannelId: {
    type: String,
    default: null
  },
  ticketPrefix: {
    type: String,
    default: 'ticket'
  },
  enabled: {
    type: Boolean,
    default: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.TicketSettings || mongoose.model('TicketSettings', ticketSettingsSchema);
