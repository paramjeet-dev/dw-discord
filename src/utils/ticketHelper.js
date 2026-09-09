const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const Ticket = require('../models/ticket');
const TicketSettings = require('../models/ticketSettings');

const TICKET_BUTTONS = {
  close: { label: 'Close ticket', style: ButtonStyle.Danger, emoji: '🔒' },
  reopen: { label: 'Reopen ticket', style: ButtonStyle.Success, emoji: '🔓' },
  claim: { label: 'Claim ticket', style: ButtonStyle.Primary, emoji: '✅' },
  unclaim: { label: 'Unclaim ticket', style: ButtonStyle.Secondary, emoji: '↩️' }
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
    return existing;
  }

  const created = await TicketSettings.create({ guildId, ...overrides });
  return created.toObject();
}

function buildTicketEmbed(ticket, guild) {
  const status = ticket.status === 'closed' ? 'Closed' : ticket.status === 'open' ? 'Open' : 'Unknown';
  const claimedBy = ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed';
  const channel = guild?.channels?.cache?.get(ticket.channelId) || null;
  const participants = (ticket.participants || []).length ? ticket.participants.map((id) => `<@${id}>`).join(', ') : 'No extra participants';

  return new EmbedBuilder()
    .setColor(ticket.status === 'closed' ? 0xED4245 : 0x5865F2)
    .setTitle(`Ticket ${channel ? channel.name : 'Details'}`)
    .setDescription(ticket.reason || 'No reason provided.')
    .addFields(
      { name: 'Opened by', value: `<@${ticket.openerId}>`, inline: true },
      { name: 'Status', value: status, inline: true },
      { name: 'Claimed by', value: claimedBy, inline: true },
      { name: 'Participants', value: participants, inline: false },
      { name: 'Summary', value: ticket.summary || 'No summary provided.', inline: false }
    );
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
      .setEmoji(ticket.claimedBy ? '↩️' : '✅')
  );

  return row;
}

async function sendTicketStatusMessage(channel, ticket, guild) {
  if (!channel || !channel.isTextBased()) return;

  await channel.send({
    embeds: [buildTicketEmbed(ticket, guild)],
    components: [buildTicketActionRow(ticket)]
  });
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

async function createTicket({ interaction, reason, summary }) {
  if (!interaction.inGuild()) {
    throw new Error('This command can only be used inside a server.');
  }

  const settings = await getTicketSettings(interaction.guildId) || await ensureTicketSettings(interaction.guildId, {
    guildId: interaction.guildId,
    ticketPrefix: 'ticket'
  });

  if (!settings || settings.enabled === false) {
    throw new Error('The ticket system is not enabled for this server. Run /ticket setup first.');
  }

  const categoryId = settings.categoryId || null;
  const supportRoleId = settings.supportRoleId || null;
  const ticketPrefix = settings.ticketPrefix || 'ticket';
  const ticketName = `${ticketPrefix}-${toSafeChannelName(interaction.user.username)}-${String(Date.now()).slice(-4)}`;

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
    topic: `Ticket created by ${interaction.user.tag} | ${reason || 'No reason provided.'}`
  });

  const ticketDoc = await Ticket.create({
    guildId: interaction.guildId,
    channelId: channel.id,
    openerId: interaction.user.id,
    createdBy: interaction.user.id,
    status: 'open',
    reason: reason || 'No reason provided.',
    summary: summary || 'No summary provided.',
    participants: [interaction.user.id]
  });

  const embed = buildTicketEmbed(ticketDoc.toObject(), interaction.guild);
  const row = buildTicketActionRow(ticketDoc.toObject());

  const initialMessage = await channel.send({
    embeds: [embed],
    components: [row]
  });

  await initialMessage.pin().catch(() => null);

  return { channel, ticket: ticketDoc.toObject(), initialMessage };
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
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('Ticket closed')
          .setDescription(`This ticket was closed by <@${interaction.user.id}>.`)
      ]
    });
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
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Ticket reopened')
          .setDescription(`This ticket was reopened by <@${interaction.user.id}>.`)
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
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Ticket unclaimed').setDescription(`This ticket is no longer claimed.`)] });
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

async function canManageTicket(interaction, ticket) {
  if (!interaction.guild) return false;
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;

  const settings = await getTicketSettings(interaction.guildId);
  if (settings?.supportRoleId && interaction.member.roles.cache.has(settings.supportRoleId)) return true;
  if (ticket?.openerId === interaction.user.id) return true;
  return false;
}

module.exports = {
  getTicketSettings,
  getTicketByChannel,
  ensureTicketSettings,
  buildTicketEmbed,
  buildTicketActionRow,
  sendTicketStatusMessage,
  createTicket,
  closeTicket,
  reopenTicket,
  claimTicket,
  unclaimTicket,
  addUserToTicket,
  removeUserFromTicket,
  renameTicket,
  getTicketInfo,
  canManageTicket,
  TICKET_BUTTONS
};
