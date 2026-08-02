const mongoose = require('mongoose');

const giveawaySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  guildId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true
  },
  messageId: {
    type: String,
    required: false,
    index: true
  },
  prize: {
    type: String,
    required: true
  },
  winners: {
    type: Number,
    required: true,
    min: 1
  },
  durationMs: {
    type: Number,
    required: true
  },
  endAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'ended'],
    default: 'active'
  },
  hostedBy: {
    type: String,
    required: true
  },
  participantCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  winnersList: {
    type: [String],
    default: []
  }
});

module.exports = mongoose.models.Giveaway || mongoose.model('Giveaway', giveawaySchema);
