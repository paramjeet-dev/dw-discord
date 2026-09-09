const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  openerId: {
    type: String,
    required: true,
    index: true
  },
  createdBy: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  claimedBy: {
    type: String,
    default: null
  },
  claimedAt: {
    type: Date,
    default: null
  },
  closedBy: {
    type: String,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  reason: {
    type: String,
    default: 'No reason provided.'
  },
  summary: {
    type: String,
    default: ''
  },
  participants: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
