const mongoose = require('mongoose');

const ticketPanelInstanceSchema = new mongoose.Schema({
  channelId: {
    type: String,
    required: true
  },
  messageId: {
    type: String,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false
});

const ticketPanelSchema = new mongoose.Schema({
  panelKey: {
    type: String,
    required: true
  },
  panelName: {
    type: String,
    required: true
  },
  panelHeader: {
    type: String,
    default: 'Open a support ticket'
  },
  panelMessage: {
    type: String,
    default: 'Need help? Use the panel below and a staff member will respond soon.'
  },
  panelMessageAbove: {
    type: String,
    default: ''
  },
  panelType: {
    type: String,
    default: 'buttons'
  },
  panelOptions: {
    type: [String],
    default: ['general', 'billing', 'bug', 'other']
  },
  instances: {
    type: [ticketPanelInstanceSchema],
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
  _id: false
});

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
  ticketCategories: {
    type: Map,
    of: String,
    default: {}
  },
  supportRoleId: {
    type: String,
    default: null
  },
  panelName: {
    type: String,
    default: 'Support tickets'
  },
  panelHeader: {
    type: String,
    default: 'Open a support ticket'
  },
  panelMessage: {
    type: String,
    default: 'Need help? Use the ticket panel below and a staff member will respond soon.'
  },
  panelMessageAbove: {
    type: String,
    default: ''
  },
  panels: {
    type: [ticketPanelSchema],
    default: []
  },
  ticketOpeningMessage: {
    type: String,
    default: ''
  },
  panelType: {
    type: String,
    default: 'buttons'
  },
  panelOptions: {
    type: [String],
    default: ['general', 'billing', 'bug', 'other']
  },
  pingUserIds: {
    type: [String],
    default: []
  },
  pingRoleIds: {
    type: [String],
    default: []
  },
  transcriptChannelId: {
    type: String,
    default: null
  },
  panelChannelId: {
    type: String,
    default: null
  },
  panelMessageId: {
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
  allowUserOpenTickets: {
    type: Boolean,
    default: true
  },
  defaultReason: {
    type: String,
    default: 'No reason provided.'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.TicketSettings || mongoose.model('TicketSettings', ticketSettingsSchema);
