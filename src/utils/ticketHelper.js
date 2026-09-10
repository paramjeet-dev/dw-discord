const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const Ticket = require('../models/ticket');
const TicketSettings = require('../models/ticketSettings');

const TICKET_BUTTONS = {
  close: { label: 'Close ticket', style: ButtonStyle.Danger, emoji: '🔒' },
  reopen: { label: 'Reopen ticket', style: ButtonStyle.Success, emoji: '🔓' },
  claim: { label: 'Claim ticket', style: ButtonStyle.Primary, emoji: '✅' },
  unclaim: { label: 'Unclaim ticket', style: ButtonStyle.Secondary, emoji: '↩️' },
  open: { label: 'Open ticket', style: ButtonStyle.Primary, emoji: '🎫' }
};

function toSafeChannelName(value) {
  return (value || 'ticket')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'ticket';
}

async function getTicketSettings(guildId) {
  if (!guildId) return null;
  return TicketSettings.findOne({ guildId }).lean();
}

function normalizeTicketCategories(categories) {
  if (!categories) return {};

  if (categories instanceof Map) {
    return Object.fromEntries(
      [...categories.entries()]
        .filter(([key, value]) => key && value != null)
        .map(([key, value]) => [String(key).toLowerCase(), String(value)])
    );
  }

  if (typeof categories === 'object') {
    return Object.fromEntries(
      Object.entries(categories)
        .filter(([key, value]) => key && value != null)
        .map(([key, value]) => [String(key).toLowerCase(), String(value)])
    );
  }

  return {};
}

function resolveTicketCategory(settings, type = 'general') {
  const safeType = String(type || 'general').toLowerCase();
  const categories = normalizeTicketCategories(settings?.ticketCategories || {});
  const mappedCategoryId = categories[safeType] || categories[`${safeType}Id`] || null;
  return mappedCategoryId || settings?.categoryId || null;
}

async function getTicketByChannel(guildId, channelId) {
  if (!guildId || !channelId) return null;
  return Ticket.findOne({ guildId, channelId }).lean();
}

async function ensureTicketSettings(guildId, overrides = {}) {
  if (!guildId) return null;

  const existing = await TicketSettings.findOne({ guildId });
  if (existing) {
    Object.assign(existing, overrides);
    existing.updatedAt = new Date();
    await existing.save();
    return existing.toObject();
  }

  const created = await TicketSettings.create({ guildId, ...overrides });
  return created.toObject();
}

function buildTicketFooter(guild) {
  const serverName = guild?.name || 'Server';
  const iconUrl = guild?.iconURL?.() || null;
  const localTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  return {
    text: `${serverName} • ${localTime}`,
    iconURL: iconUrl || undefined
  };
}

function buildTicketEmbed(ticket, guild) {
  const status = ticket.status === 'closed' ? 'Closed' : ticket.status === 'open' ? 'Open' : 'Unknown';
  const claimedBy = ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed';
  const channel = guild?.channels?.cache?.get(ticket.channelId) || null;
  const guildIcon = guild?.iconURL?.({ dynamic: true, size: 256 }) || guild?.iconURL?.() || null;
  const participants = (ticket.participants || []).length ? ticket.participants.map((id) => `<@${id}>`).join(', ') : 'No extra participants';

  const embed = new EmbedBuilder()
    .setColor(ticket.status === 'closed' ? 0xED4245 : 0x5865F2)
    .setTitle(`Ticket ${channel ? channel.name : 'Details'}`)
    .setDescription(ticket.reason || 'No reason provided.')
    .setFooter(buildTicketFooter(guild))
    .addFields(
      { name: 'Opened by', value: `<@${ticket.openerId}>`, inline: true },
      { name: 'Status', value: status, inline: true },
      { name: 'Claimed by', value: claimedBy, inline: true },
      { name: 'Participants', value: participants, inline: false },
      { name: 'Summary', value: ticket.summary || 'No summary provided.', inline: false }
    );

  if (guildIcon) {
    embed.setThumbnail(guildIcon);
  }

  return embed;
}

function buildTicketConfirmationRow(action = 'close') {
  const confirmLabel = action === 'delete' ? 'Delete ticket' : 'Confirm close';
  const cancelLabel = 'Cancel';

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket-${action}-confirm`)
      .setLabel(confirmLabel)
      .setStyle(action === 'delete' ? ButtonStyle.Danger : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket-${action}-cancel`)
      .setLabel(cancelLabel)
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildTicketUserActionRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket-users-add')
      .setLabel('Add user')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket-users-remove')
      .setLabel('Remove user')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildTicketUserModal(action = 'add') {
  const modal = new ModalBuilder()
    .setCustomId(`ticket-user-modal-${action}`)
    .setTitle(action === 'add' ? 'Add user to ticket' : 'Remove user from ticket');

  const targetInput = new TextInputBuilder()
    .setCustomId('ticket-user-id')
    .setLabel('User ID or mention')
    .setPlaceholder('Example: 123456789012345678 or @user')
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  modal.addComponents(new ActionRowBuilder().addComponents(targetInput));
  return modal;
}

function buildTicketActionRow(ticket) {
  const row = new ActionRowBuilder();
  const closeLabel = ticket.status === 'closed' ? 'Ticket closed' : TICKET_BUTTONS.close.label;
  const closeStyle = ticket.status === 'closed' ? ButtonStyle.Secondary : TICKET_BUTTONS.close.style;

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(ticket.status === 'closed' ? 'ticket-reopen' : 'ticket-close')
      .setLabel(ticket.status === 'closed' ? 'Reopen ticket' : closeLabel)
      .setStyle(ticket.status === 'closed' ? ButtonStyle.Success : closeStyle)
      .setEmoji(ticket.status === 'closed' ? '🔓' : TICKET_BUTTONS.close.emoji),
    new ButtonBuilder()
      .setCustomId(ticket.claimedBy ? 'ticket-unclaim' : 'ticket-claim')
      .setLabel(ticket.claimedBy ? 'Unclaim ticket' : 'Claim ticket')
      .setStyle(ticket.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setEmoji(ticket.claimedBy ? '↩️' : '✅'),
    new ButtonBuilder()
      .setCustomId('ticket-users')
      .setLabel('Users')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👥'),
    new ButtonBuilder()
      .setCustomId('ticket-transcript')
      .setLabel('Transcript')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📄'),
    new ButtonBuilder()
      .setCustomId('ticket-delete')
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
  );

  return row;
}

function buildTicketCategorySelect(settings = {}) {
  const categories = normalizeTicketCategories(settings.ticketCategories || {});
  const effectiveCategories = Object.keys(categories).length
    ? categories
    : { general: 'General', billing: 'Billing', bug: 'Bug', other: 'Other' };

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket-category-select')
    .setPlaceholder('Select a ticket type')
    .setMinValues(1)
    .setMaxValues(1);

  for (const [key, label] of Object.entries(effectiveCategories)) {
    const normalizedLabel = typeof label === 'string' ? label : key;
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(normalizedLabel)
        .setValue(key)
        .setDescription(`Open a ${normalizedLabel.toLowerCase()} ticket`)
    );
  }

  return menu;
}

function normalizePanelOptions(options) {
  if (!options) return [];
  if (Array.isArray(options)) return options.filter(Boolean).map(String);
  if (typeof options === 'string') return options.split(',').map((item) => item.trim()).filter(Boolean);
  if (options instanceof Map) return [...options.keys()].filter(Boolean).map(String);
  if (typeof options === 'object') return Object.keys(options).filter(Boolean).map(String);
  return [];
}

function buildTicketPanelRow(settings = {}) {
  const panelType = settings.panelType === 'select' ? 'select' : 'buttons';
  const panelOptions = normalizePanelOptions(settings.panelOptions && settings.panelOptions.length ? settings.panelOptions : ['general', 'billing', 'bug', 'other']);

  if (panelType === 'buttons') {
    const buttonRow = new ActionRowBuilder();
    for (const option of panelOptions) {
      const label = String(option).charAt(0).toUpperCase() + String(option).slice(1);
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket-open-${String(option).toLowerCase()}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Primary)
      );
    }
    return [buttonRow];
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket-category-select')
    .setPlaceholder('Select a ticket type')
    .setMinValues(1)
    .setMaxValues(1);

  for (const option of panelOptions) {
    const label = String(option).charAt(0).toUpperCase() + String(option).slice(1);
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setValue(String(option).toLowerCase())
        .setDescription(`Open a ${label.toLowerCase()} ticket`)
    );
  }

  return [new ActionRowBuilder().addComponents(menu)];
}

function buildTicketSetupModal(page = 1, defaults = {}) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket-setup-page-${page}`)
    .setTitle(`Ticket setup - Page ${page}`);

  const panelType = defaults.panelType || 'buttons';
  const panelOptions = Array.isArray(defaults.panelOptions)
    ? defaults.panelOptions.join(',')
    : typeof defaults.panelOptions === 'string'
      ? defaults.panelOptions
      : 'general,billing,bug,other';

  if (page === 1) {
    const fields = [
      ['panel_name', 'Panel name', defaults.panelName || 'Support tickets'],
      ['panel_header', 'Panel header', defaults.panelHeader || 'Open a support ticket'],
      ['panel_message', 'Panel message (embed)', defaults.panelMessage || 'Need help? Use the panel below and a staff member will respond soon.'],
      ['staff_role_id', 'Staff role (@role or ID)', defaults.supportRoleId || ''],
      ['panel_channel_id', 'Panel channel ID', defaults.panelChannelId || '']
    ];

    for (const [customId, label, value] of fields) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(value)
        )
      );
    }

    return modal;
  }

  if (page === 2) {
    const fields = [
      ['panel_message_above', 'Panel message above embed', defaults.panelMessageAbove || ''],
      ['ticket_category_id', 'Opening category ID', defaults.categoryId || ''],
      ['transcript_channel_id', 'Transcript channel ID', defaults.transcriptChannelId || ''],
      ['ticket_opening_message', 'Ticket opening message', defaults.ticketOpeningMessage || 'Your ticket has been created. A staff member will respond soon.'],
      ['ping_targets', 'Ping roles/users (comma-separated IDs)', defaults.pingTargets || '']
    ];

    for (const [customId, label, value] of fields) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(value)
        )
      );
    }

    return modal;
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('panel_type')
        .setLabel('Panel type (buttons or select)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(panelType)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('panel_options')
        .setLabel('Panel options (comma separated)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(panelOptions)
    )
  );

  return modal;
}

function parseDiscordId(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{17,20})/);
  return match ? match[1] : String(value).trim() || null;
}

function readModalField(interaction, customId, fallback = '') {
  try {
    const value = interaction.fields.getTextInputValue(customId);
    return value === undefined || value === null ? fallback : value;
  } catch (error) {
    const message = error?.message || '';
    const isMissingModalField = error?.code === 'ModalSubmitInteractionFieldNotFound'
      || message.includes('Required field with custom id')
      || message.includes('custom id');

    if (isMissingModalField) {
      return fallback;
    }
    throw error;
  }
}

function parseTicketSetupDraft(interaction) {
  const page1 = {
    panelName: readModalField(interaction, 'panel_name', 'Support tickets') || 'Support tickets',
    panelHeader: readModalField(interaction, 'panel_header', 'Open a support ticket') || 'Open a support ticket',
    panelMessage: readModalField(interaction, 'panel_message', 'Need help? Use the panel below and a staff member will respond soon.') || 'Need help? Use the panel below and a staff member will respond soon.',
    panelMessageAbove: readModalField(interaction, 'panel_message_above', '') || '',
    supportRoleId: parseDiscordId(readModalField(interaction, 'staff_role_id')) || null,
    categoryId: parseDiscordId(readModalField(interaction, 'ticket_category_id')) || null,
    panelChannelId: parseDiscordId(readModalField(interaction, 'panel_channel_id')) || null,
    transcriptChannelId: parseDiscordId(readModalField(interaction, 'transcript_channel_id')) || null,
    ticketOpeningMessage: readModalField(interaction, 'ticket_opening_message', 'Your ticket has been created. A staff member will respond soon.') || 'Your ticket has been created. A staff member will respond soon.',
    pingTargets: readModalField(interaction, 'ping_targets', '') || ''
  };

  return page1;
}

function buildTicketModal(type = 'general') {
  const modal = new ModalBuilder()
    .setCustomId(`ticket-form-${String(type || 'general').toLowerCase()}`)
    .setTitle(`Open a ${String(type || 'general').toLowerCase()} ticket`);

  const titleInput = new TextInputBuilder()
    .setCustomId('ticket-title')
    .setLabel('Ticket title')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Example: Account access issue')
    .setRequired(true)
    .setMaxLength(80);

  const detailsInput = new TextInputBuilder()
    .setCustomId('ticket-details')
    .setLabel('Describe your issue')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Tell the support team what is happening')
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(2000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(detailsInput)
  );

  return modal;
}

function buildTicketFormResponse(ticket, guild) {
  const channelName = guild?.channels?.cache?.get(ticket.channelId)?.name || 'ticket';
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Ticket created')
    .setDescription(`Your ticket has been created in <#${ticket.channelId}>`)
    .addFields(
      { name: 'Channel', value: `#${channelName}`, inline: true },
      { name: 'Status', value: 'Open', inline: true },
      { name: 'Summary', value: ticket.summary || 'No summary provided.', inline: false }
    );
}

async function getTicketStatsForGuild(guildId) {
  if (!guildId) return { total: 0, open: 0, closed: 0, claimed: 0 };

  const tickets = await Ticket.find({ guildId }).lean();
  return {
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === 'open').length,
    closed: tickets.filter((ticket) => ticket.status === 'closed').length,
    claimed: tickets.filter((ticket) => ticket.claimedBy).length
  };
}

function buildTicketListEmbed(guild, tickets = []) {
  const openTickets = (tickets || []).filter((ticket) => ticket.status === 'open');
  const claimed = openTickets.filter((ticket) => ticket.claimedBy).length;
  const total = tickets.length;
  const open = openTickets.length;
  const closed = (tickets || []).filter((ticket) => ticket.status === 'closed').length;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Ticket overview')
    .setDescription(`There are ${open} open ticket(s) in this server.`)
    .addFields(
      { name: 'Total tickets', value: String(total || 0), inline: true },
      { name: 'Open', value: String(open || 0), inline: true },
      { name: 'Closed', value: String(closed || 0), inline: true },
      { name: 'Claimed', value: String(claimed || 0), inline: true }
    );

  if (openTickets.length) {
    const lines = openTickets.slice(0, 10).map((ticket) => {
      const status = ticket.claimedBy ? 'Claimed' : 'Unclaimed';
      return `• <#${ticket.channelId}> • <@${ticket.openerId}> • ${status}`;
    });
    embed.addFields({ name: 'Open tickets', value: lines.join('\n') || 'None', inline: false });
  } else {
    embed.addFields({ name: 'Open tickets', value: 'No open tickets right now.', inline: false });
  }

  return embed;
}

async function buildTicketTranscript(ticket, guild, ticketChannel) {
  const channel = ticketChannel || (guild?.channels?.cache?.get(ticket.channelId) ?? await guild?.channels?.fetch(ticket.channelId).catch(() => null));
  const lines = [
    '=== Ticket Transcript ===',
    `Ticket ID: ${ticket.channelId}`,
    `Opened by: <@${ticket.openerId}>`,
    `Status: ${ticket.status || 'open'}`,
    `Claimed by: ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed'}`,
    `Reason: ${ticket.reason || 'No reason provided.'}`,
    `Summary: ${ticket.summary || 'No summary provided.'}`,
    '',
    '--- Messages ---',
    ''
  ];

  if (!channel || !channel.isTextBased()) {
    lines.push('No messages available for this ticket.');
    return lines.join('\n');
  }

  const messages = Array.from((await channel.messages.fetch({ limit: 100 })).values())
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  if (!messages.length) {
    lines.push('No messages in this ticket.');
    return lines.join('\n');
  }

  for (const message of messages) {
    const text = (message.content || '').replace(/\r\n/g, '\n').trim();
    const body = text || '[Attachment or embed]';
    lines.push(`[${new Date(message.createdTimestamp).toISOString()}] ${message.author.tag}: ${body}`);
  }

  return lines.join('\n');
}

async function sendTicketStatusMessage(channel, ticket, guild) {
  if (!channel || !channel.isTextBased()) return;

  await channel.send({
    embeds: [buildTicketEmbed(ticket, guild)],
    components: [buildTicketActionRow(ticket)]
  });
}

async function createPanelMessage(interaction, channelId) {
  if (!interaction || !interaction.guild) throw new Error('This command can only be used inside a server.');

  const targetChannel = channelId
    ? interaction.guild.channels.cache.get(channelId) ?? await interaction.guild.channels.fetch(channelId).catch(() => null)
    : interaction.channel;

  if (!targetChannel || !targetChannel.isTextBased() || targetChannel.isThread()) {
    throw new Error('The panel channel must be a valid text channel.');
  }

  const settings = await getTicketSettings(interaction.guildId) || await ensureTicketSettings(interaction.guildId, { guildId: interaction.guildId });
  const panelTitle = settings?.panelName || 'Support tickets';
  const panelHeader = settings?.panelHeader || 'Open a support ticket';
  const panelMessage = settings?.panelMessage || 'Need help? Use the panel below and a staff member will respond soon.';
  const panelMessageAbove = (settings?.panelMessageAbove || '').trim();
  const guildIcon = interaction.guild.iconURL({ dynamic: true, size: 256 }) || null;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(panelTitle)
    .setThumbnail(guildIcon)
    .setDescription(`${panelHeader || 'Open a support ticket'}${panelMessage ? `\n\n${panelMessage}` : ''}`)
    .setFooter({
      text: `${interaction.guild.name} • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`,
      iconURL: guildIcon || undefined
    });

  const panelPayload = {
    content: panelMessageAbove || undefined,
    embeds: [embed],
    components: buildTicketPanelRow(settings)
  };

  const existingPanelMessageId = settings?.panelMessageId;
  const existingPanelChannelId = settings?.panelChannelId;

  let message;
  if (existingPanelMessageId && existingPanelChannelId === targetChannel.id) {
    const existingMessage = targetChannel.messages.cache.get(existingPanelMessageId)
      ?? await targetChannel.messages.fetch(existingPanelMessageId).catch(() => null);

    if (existingMessage) {
      message = await existingMessage.edit(panelPayload);
    }
  }

  if (!message) {
    message = await targetChannel.send(panelPayload);
  }

  const updatedSettings = await ensureTicketSettings(interaction.guildId, {
    guildId: interaction.guildId,
    panelChannelId: targetChannel.id,
    panelMessageId: message.id
  });
  return { message, settings: updatedSettings };
}

async function setTicketPermissionsForMembers(channel, members, allow = true) {
  if (!channel || !channel.guild) return;

  for (const memberId of members) {
    try {
      const member = await channel.guild.members.fetch(memberId).catch(() => null);
      if (!member) continue;
      await channel.permissionOverwrites.edit(member, {
        ViewChannel: allow,
        SendMessages: allow,
        ReadMessageHistory: allow,
        AttachFiles: allow,
        AddReactions: allow
      }).catch(() => null);
    } catch (error) {
      console.error('Could not sync ticket permissions:', error);
    }
  }
}

async function createTicket({ interaction, reason, summary, type = 'general' }) {
  if (!interaction.inGuild()) {
    throw new Error('This command can only be used inside a server.');
  }

  const settings = await getTicketSettings(interaction.guildId) || await ensureTicketSettings(interaction.guildId, {
    guildId: interaction.guildId,
    ticketPrefix: 'ticket',
    defaultReason: 'Customer support request.',
    allowUserOpenTickets: true
  });

  if (!settings || settings.enabled === false) {
    throw new Error('The ticket system is not enabled for this server. Run /ticket setup first.');
  }

  const isStaffMember = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
    || (!!settings.supportRoleId && interaction.member?.roles?.cache?.has(settings.supportRoleId));

  if (settings.allowUserOpenTickets === false && !isStaffMember) {
    throw new Error('This server has disabled user-opened tickets. Please contact a staff member.');
  }

  const supportRoleId = settings.supportRoleId || null;
  const ticketPrefix = settings.ticketPrefix || 'ticket';
  const ticketType = type || 'general';
  const defaultReason = settings.defaultReason || 'Customer support request.';
  const resolvedReason = (typeof reason === 'string' && reason.trim()) ? reason : defaultReason;
  const categoryId = resolveTicketCategory(settings, ticketType);
  const ticketName = `${toSafeChannelName(ticketType)}-${ticketPrefix}-${toSafeChannelName(interaction.user.username)}`;

  const category = categoryId ? interaction.guild.channels.cache.get(categoryId) ?? await interaction.guild.channels.fetch(categoryId).catch(() => null) : null;
  const permissionOverwrites = [
    {
      id: interaction.guild.roles.everyone,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.AddReactions]
    }
  ];

  if (supportRoleId) {
    permissionOverwrites.push({
      id: supportRoleId,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages]
    });
  }

  const channel = await interaction.guild.channels.create({
    name: ticketName,
    type: 0,
    parent: category ? category.id : null,
    permissionOverwrites,
    topic: `Ticket (${ticketType}) created by ${interaction.user.tag} | ${reason || 'No reason provided.'}`
  });

  const ticketDoc = await Ticket.create({
    guildId: interaction.guildId,
    channelId: channel.id,
    openerId: interaction.user.id,
    createdBy: interaction.user.id,
    status: 'open',
    reason: resolvedReason,
    summary: summary || (ticketType === 'general' ? 'General support request.' : `${ticketType} support request.`),
    participants: [interaction.user.id]
  });

  const embed = buildTicketEmbed(ticketDoc.toObject(), interaction.guild);
  const row = buildTicketActionRow(ticketDoc.toObject());
  const mentionTargets = [
    ...(Array.isArray(settings.pingUserIds) ? settings.pingUserIds : []),
    ...(Array.isArray(settings.pingRoleIds) ? settings.pingRoleIds : [])
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const mentions = [...new Set(mentionTargets)].map((id) => {
    const role = interaction.guild.roles.cache.get(id);
    return role ? `<@&${id}>` : `<@${id}>`;
  });

  const initialMessage = await channel.send({
    content: mentions.length ? mentions.join(' ') : undefined,
    embeds: [embed],
    components: [row]
  });

  await initialMessage.pin().catch(() => null);

  return { channel, ticket: ticketDoc.toObject(), initialMessage };
}

async function openTicketButton(interaction, type = 'general') {
  const settings = await getTicketSettings(interaction.guildId);
  if (!settings || settings.enabled === false) {
    throw new Error('The ticket system is not enabled for this server.');
  }

  const selectedType = String(type || 'general').toLowerCase();
  const ticket = await createTicket({
    interaction,
    reason: settings.defaultReason || 'Customer support request.',
    summary: `${selectedType} support request.`,
    type: selectedType
  });

  return { ...ticket, type: selectedType };
}

async function submitTicketForm(interaction) {
  if (!interaction.isModalSubmit()) {
    throw new Error('This interaction is not a ticket form submission.');
  }

  const title = interaction.fields.getTextInputValue('ticket-title');
  const details = interaction.fields.getTextInputValue('ticket-details');
  const type = interaction.customId.startsWith('ticket-form-') ? interaction.customId.replace('ticket-form-', '') : 'general';

  const settings = await getTicketSettings(interaction.guildId);
  if (!settings || settings.enabled === false) {
    throw new Error('The ticket system is not enabled for this server.');
  }

  const ticket = await createTicket({
    interaction,
    reason: details,
    summary: title,
    type
  });

  return { ticket, embed: buildTicketFormResponse(ticket.ticket, interaction.guild) };
}

async function closeTicket(interaction, options = {}) {
  const targetChannelId = options.channelId || interaction.channelId;
  const ticket = await Ticket.findOne({ guildId: interaction.guildId, channelId: targetChannelId });
  if (!ticket) {
    throw new Error('This channel is not a valid ticket.');
  }

  if (ticket.status === 'closed') {
    throw new Error('This ticket is already closed.');
  }

  ticket.status = 'closed';
  ticket.closedBy = interaction.user.id;
  ticket.closedAt = new Date();
  ticket.updatedAt = new Date();
  await ticket.save();

  const channel = interaction.guild.channels.cache.get(targetChannelId) ?? await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (channel) {
    await channel.permissionOverwrites.edit(ticket.openerId, {
      ViewChannel: true,
      SendMessages: false,
      ReadMessageHistory: true,
      AddReactions: false,
      AttachFiles: false
    }).catch(() => null);

    if (ticket.claimedBy) {
      await channel.permissionOverwrites.edit(ticket.claimedBy, {
        ViewChannel: true,
        SendMessages: false,
        ReadMessageHistory: true,
        AddReactions: false,
        AttachFiles: false
      }).catch(() => null);
    }

    await channel.send({
      embeds: [
        new EmbedBuilder().setColor(0xED4245).setTitle('Ticket closed').setDescription(`This ticket was closed by <@${interaction.user.id}>.`)
      ]
    });
  }

  const settings = await getTicketSettings(interaction.guildId);
  const transcriptTarget = settings?.transcriptChannelId ? interaction.guild.channels.cache.get(settings.transcriptChannelId) ?? await interaction.guild.channels.fetch(settings.transcriptChannelId).catch(() => null) : null;
  if (transcriptTarget && transcriptTarget.isTextBased()) {
    const transcriptBody = await buildTicketTranscript(ticket.toObject(), interaction.guild, channel);
    await transcriptTarget.send({
      content: `Ticket transcript for <#${targetChannelId}>\n\n\`\`\`\n${transcriptBody.slice(0, 1800)}\n\`\`\``
    }).catch(() => null);
  }

  return ticket.toObject();
}

async function reopenTicket(interaction, options = {}) {
  const targetChannelId = options.channelId || interaction.channelId;
  const ticket = await Ticket.findOne({ guildId: interaction.guildId, channelId: targetChannelId });
  if (!ticket) {
    throw new Error('This channel is not a valid ticket.');
  }

  if (ticket.status === 'open') {
    throw new Error('This ticket is already open.');
  }

  ticket.status = 'open';
  ticket.closedBy = null;
  ticket.closedAt = null;
  ticket.updatedAt = new Date();
  await ticket.save();

  const channel = interaction.guild.channels.cache.get(targetChannelId) ?? await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (channel) {
    await channel.permissionOverwrites.edit(ticket.openerId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      AddReactions: true
    }).catch(() => null);

    await channel.send({
      embeds: [
        new EmbedBuilder().setColor(0x57F287).setTitle('Ticket reopened').setDescription(`This ticket was reopened by <@${interaction.user.id}>.`)
      ]
    });
  }

  return ticket.toObject();
}

async function claimTicket(interaction, options = {}) {
  const targetChannelId = options.channelId || interaction.channelId;
  const ticket = await Ticket.findOne({ guildId: interaction.guildId, channelId: targetChannelId });
  if (!ticket) {
    throw new Error('This channel is not a valid ticket.');
  }

  if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
    throw new Error('This ticket is already claimed by another staff member.');
  }

  ticket.claimedBy = interaction.user.id;
  ticket.claimedAt = new Date();
  ticket.updatedAt = new Date();
  await ticket.save();

  const channel = interaction.guild.channels.cache.get(targetChannelId) ?? await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (channel) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Ticket claimed').setDescription(`This ticket has been claimed by <@${interaction.user.id}>.`)] });
  }

  return ticket.toObject();
}

async function unclaimTicket(interaction, options = {}) {
  const targetChannelId = options.channelId || interaction.channelId;
  const ticket = await Ticket.findOne({ guildId: interaction.guildId, channelId: targetChannelId });
  if (!ticket) {
    throw new Error('This channel is not a valid ticket.');
  }

  if (!ticket.claimedBy) {
    throw new Error('This ticket is not currently claimed.');
  }

  ticket.claimedBy = null;
  ticket.claimedAt = null;
  ticket.updatedAt = new Date();
  await ticket.save();

  const channel = interaction.guild.channels.cache.get(targetChannelId) ?? await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (channel) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Ticket unclaimed').setDescription('This ticket is no longer claimed.')] });
  }

  return ticket.toObject();
}

async function addUserToTicket(interaction, user, options = {}) {
  const targetChannelId = options.channelId || interaction.channelId;
  const ticket = await Ticket.findOne({ guildId: interaction.guildId, channelId: targetChannelId });
  if (!ticket) {
    throw new Error('This channel is not a valid ticket.');
  }

  if (!user || !user.id) {
    throw new Error('Please provide a valid user.');
  }

  if (!ticket.participants.includes(user.id)) {
    ticket.participants.push(user.id);
    ticket.updatedAt = new Date();
    await ticket.save();
  }

  const channel = interaction.guild.channels.cache.get(targetChannelId) ?? await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (channel) {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      AddReactions: true
    }).catch(() => null);

    await channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('User added').setDescription(`<@${user.id}> has been added to this ticket.`)] });
  }

  return ticket.toObject();
}

async function removeUserFromTicket(interaction, user, options = {}) {
  const targetChannelId = options.channelId || interaction.channelId;
  const ticket = await Ticket.findOne({ guildId: interaction.guildId, channelId: targetChannelId });
  if (!ticket) {
    throw new Error('This channel is not a valid ticket.');
  }

  if (!user || !user.id) {
    throw new Error('Please provide a valid user.');
  }

  ticket.participants = (ticket.participants || []).filter((participantId) => participantId !== user.id);
  ticket.updatedAt = new Date();
  await ticket.save();

  const channel = interaction.guild.channels.cache.get(targetChannelId) ?? await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (channel) {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: false,
      SendMessages: false,
      ReadMessageHistory: false,
      AttachFiles: false,
      AddReactions: false
    }).catch(() => null);

    await channel.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('User removed').setDescription(`<@${user.id}> has been removed from this ticket.`)] });
  }

  return ticket.toObject();
}

async function renameTicket(interaction, newName, options = {}) {
  const targetChannelId = options.channelId || interaction.channelId;
  const ticket = await Ticket.findOne({ guildId: interaction.guildId, channelId: targetChannelId });
  if (!ticket) {
    throw new Error('This channel is not a valid ticket.');
  }

  const channel = interaction.guild.channels.cache.get(targetChannelId) ?? await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (!channel) {
    throw new Error('This ticket channel could not be found.');
  }

  const safeName = toSafeChannelName(newName || channel.name).slice(0, 80);
  await channel.setName(safeName);

  ticket.summary = newName;
  ticket.updatedAt = new Date();
  await ticket.save();

  return ticket.toObject();
}

async function getTicketInfo(guild, channelId) {
  const ticket = await Ticket.findOne({ guildId: guild.id, channelId: channelId }).lean();
  if (!ticket) return null;
  return { ticket, embed: buildTicketEmbed(ticket, guild) };
}

async function getTicketsForGuild(guildId) {
  return Ticket.find({ guildId }).sort({ createdAt: -1 }).lean();
}

async function canManageTicket(interaction, ticket) {
  if (!interaction.guild) return false;
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;

  const settings = await getTicketSettings(interaction.guildId);
  if (settings?.supportRoleId && interaction.member.roles.cache.has(settings.supportRoleId)) return true;
  if (ticket?.openerId === interaction.user.id) return true;
  return false;
}

async function canManageTicketStaff(interaction) {
  if (!interaction.guild) return false;
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;

  const settings = await getTicketSettings(interaction.guildId);
  return !!(settings?.supportRoleId && interaction.member?.roles?.cache?.has(settings.supportRoleId));
}

module.exports = {
  getTicketSettings,
  normalizeTicketCategories,
  resolveTicketCategory,
  getTicketByChannel,
  ensureTicketSettings,
  buildTicketEmbed,
  buildTicketActionRow,
  buildTicketConfirmationRow,
  buildTicketUserActionRow,
  buildTicketUserModal,
  buildTicketPanelRow,
  buildTicketModal,
  buildTicketFormResponse,
  buildTicketCategorySelect,
  buildTicketTranscript,
  createPanelMessage,
  sendTicketStatusMessage,
  createTicket,
  openTicketButton,
  submitTicketForm,
  closeTicket,
  reopenTicket,
  claimTicket,
  unclaimTicket,
  addUserToTicket,
  removeUserFromTicket,
  renameTicket,
  getTicketInfo,
  getTicketsForGuild,
  getTicketStatsForGuild,
  buildTicketListEmbed,
  buildTicketSetupModal,
  parseTicketSetupDraft,
  normalizePanelOptions,
  canManageTicket,
  canManageTicketStaff,
  TICKET_BUTTONS
};
