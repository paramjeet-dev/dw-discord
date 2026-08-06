const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    unique: true
  },
  guildId: {
    type: String,
    required: true,
    index: true
  },
  description: {
    type: String,
    default: 'No description provided.'
  },
  createdBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  usedBy: {
    type: String,
    default: null
  },
  usedAt: {
    type: Date,
    default: null
  },
  uses: {
    type: [
      {
        userId: {
          type: String,
          required: true
        },
        usedAt: {
          type: Date,
          required: true
        }
      }
    ],
    default: []
  }
});

module.exports = mongoose.models.Voucher || mongoose.model('Voucher', voucherSchema);
