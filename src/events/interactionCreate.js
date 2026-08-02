const { Events, EmbedBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder } = require('discord.js');
const fs = require('node:fs/promises');
const path = require('node:path');
const TicketConfig = require('../models/ticketConfig');
const Ticket = require('../models/ticket');
const { buildServerEmbed } = require('../utils/embedHelper');

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
}

function buildTicketEmbed(config) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎫 Open a ticket')
    .setDescription(config.panelMessage);
}

function buildTicketSelect(config) {
  return {
    type: 1,
    components: [
      {
        type: 3,
        custom_id: 'ticketOpenSelect',
        placeholder: 'Choose a ticket reason',
        min_values: 1,
        max_values: 1,
        options: config.options.map((option) => ({
          label: option.label,
          description: option.description,
          value: option.value
        }))
      }
    ]
  };
}

function buildTicketActionRow(ticketChannelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:users:${ticketChannelId}`).setLabel('Users').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket:roles:${ticketChannelId}`).setLabel('Roles').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket:close:${ticketChannelId}`).setLabel('Close').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket:delete:${ticketChannelId}`).setLabel('Delete').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket:transcript:${ticketChannelId}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary)
  );
}

async function createTicketChannel(interaction, config, optionValue) {
  const option = config.options.find((opt) => opt.value === optionValue);
  if (!option) {
    return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Invalid ticket option selected.')], ephemeral: true });
  }

  const guild = interaction.guild;
  const category = await guild.channels.fetch(config.ticketCategoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Ticket category is not available.')], ephemeral: true });
  }

  const channelName = `ticket-${option.value}-${Date.now()}`.slice(0, 100);
  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: ['ViewChannel']
      },
      {
        id: interaction.user.id,
        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
      }
    ]
  });

  await Ticket.create({
    guildId: guild.id,
    channelId: ticketChannel.id,
    openerId: interaction.user.id,
    optionValue: option.value,
    optionLabel: option.label
  });

  const ticketEmbed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle(`🎫 ${option.label}`)
    .setDescription(config.openingMessage);

  await ticketChannel.send({
    content: `${interaction.user}, ${config.openingMessage}`,
    embeds: [ticketEmbed],
    components: [buildTicketActionRow(ticketChannel.id)]
  });

  return interaction.reply({ content: `Ticket opened: ${ticketChannel}`, ephemeral: true });
}

async function sendManageMenu(interaction, channelId, kind, description) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:${kind}Add:${channelId}`).setLabel('Add').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket:${kind}Remove:${channelId}`).setLabel('Remove').setStyle(ButtonStyle.Danger)
  );

  const message = await interaction.reply({
    content: description,
    components: [row],
    fetchReply: true
  });

  return message;
}

function buildConfirmButtons(channelId, operation, targetMessageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:${operation}:confirm:${channelId}:${targetMessageId}`).setLabel('Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket:${operation}:cancel:${channelId}:${targetMessageId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
}

async function addOrRemoveTarget(interaction, channelId, action, kind) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket:${kind}Modal:${action}:${channelId}:${interaction.message.id}`)
    .setTitle(`${action === 'add' ? 'Add' : 'Remove'} ${kind === 'user' ? 'user' : 'role'}`);

  const targetInput = new TextInputBuilder()
    .setCustomId('targetId')
    .setLabel(`${kind === 'user' ? 'User ID' : 'Role ID'}`)
    .setStyle(1)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(targetInput));
  await interaction.showModal(modal);
}

async function handleTargetChange(interaction, channelId, action, kind) {
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'The ticket channel is no longer available.')], ephemeral: true });
  }

  const targetId = interaction.fields.getTextInputValue('targetId').trim();
  try {
    if (kind === 'user') {
      const member = await interaction.guild.members.fetch(targetId);
      if (action === 'add') {
        await channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      } else {
        await channel.permissionOverwrites.edit(member.id, { ViewChannel: false, SendMessages: false, ReadMessageHistory: false });
      }
    } else {
      const role = await interaction.guild.roles.fetch(targetId);
      if (action === 'add') {
        await channel.permissionOverwrites.edit(role.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      } else {
        await channel.permissionOverwrites.edit(role.id, { ViewChannel: false, SendMessages: false, ReadMessageHistory: false });
      }
    }

    const menuMessageId = interaction.customId.split(':').pop();
    const menuMessage = await channel.messages.fetch(menuMessageId).catch(() => null);
    if (menuMessage) {
      await menuMessage.edit({
        content: `${kind === 'user' ? 'User' : 'Role'} ${action === 'add' ? 'added' : 'removed'} successfully.`,
        components: []
      });
    }

    return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, `${kind === 'user' ? 'User' : 'Role'} ${action === 'add' ? 'added' : 'removed'} successfully.`)], ephemeral: true });
  } catch (error) {
    console.error(error);
    return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, `I could not ${action === 'add' ? 'add' : 'remove'} that ${kind}.`)], ephemeral: true });
  }
}

async function closeTicket(interaction, channelId) {
  const ticket = await Ticket.findOne({ channelId }).lean();
  if (!ticket) return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Ticket not found.')], ephemeral: true });

  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (channel) {
    await channel.send({ content: `Ticket closed by ${interaction.user}.` });
  }

  await Ticket.updateOne({ channelId }, { status: 'closed', closedAt: new Date() });
  return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, 'Ticket closed successfully.')], ephemeral: true });
}

async function deleteTicket(interaction, channelId) {
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (channel) {
    await channel.delete().catch(() => null);
  }
  await Ticket.findOneAndDelete({ channelId });
  return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, 'Ticket deleted successfully.')], ephemeral: true });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTranscriptHtml(channel, messages) {
  const messageRows = messages.map((message) => {
    const lines = [];
    if (message.content) {
      lines.push(`<div class="content">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>`);
    }

    if (message.attachments?.size) {
      const attachments = [...message.attachments.values()]
        .map((attachment) => `<span class="attachment">${escapeHtml(attachment.name || attachment.url)}</span>`)
        .join('');
      lines.push(`<div class="attachments">${attachments}</div>`);
    }

    if (message.embeds?.length) {
      const embeds = message.embeds
        .map((embed) => {
          const title = embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : '';
          const description = embed.description ? `<div class="embed-description">${escapeHtml(embed.description)}</div>` : '';
          return `<div class="embed">${title}${description}</div>`;
        })
        .join('');
      lines.push(`<div class="embeds">${embeds}</div>`);
    }

    const body = lines.length ? `<div class="body">${lines.join('')}</div>` : '<div class="body"><em>No content</em></div>';
    return `
      <div class="message">
        <div class="meta">${escapeHtml(message.author?.tag || message.author?.username || 'Unknown')} • ${escapeHtml(new Date(message.createdTimestamp).toISOString())}</div>
        ${body}
      </div>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(channel.name)} transcript</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #2f3136; }
      .header { margin-bottom: 20px; }
      .message { border: 1px solid #e3e5e8; border-radius: 8px; padding: 12px; margin-bottom: 12px; background: #f8f9fa; }
      .meta { font-size: 12px; color: #72767d; margin-bottom: 8px; }
      .content { white-space: pre-wrap; }
      .attachment { display: inline-block; margin-right: 8px; padding: 2px 6px; background: #e8f0fe; border-radius: 4px; }
      .embed { margin-top: 8px; padding: 8px; border-left: 3px solid #5865f2; background: #ffffff; }
      .embed-title { font-weight: bold; margin-bottom: 4px; }
      .embed-description { color: #4f545c; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>${escapeHtml(channel.name)} transcript</h1>
      <p>Generated from the ticket channel on ${escapeHtml(new Date().toISOString())}</p>
    </div>
    ${messageRows}
  </body>
</html>`;
}

async function sendTranscript(interaction, channelId) {
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'The ticket channel is no longer available.')], ephemeral: true });
  }

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const transcriptMessages = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const html = buildTranscriptHtml(channel, transcriptMessages);
    const buffer = Buffer.from(html, 'utf8');

    await interaction.user.send({
      content: `Transcript for ${channel.name}`,
      files: [{ attachment: buffer, name: `${channel.name}-transcript.html` }]
    });

    return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, 'Transcript sent to your DMs.')], ephemeral: true });
  } catch (error) {
    console.error(error);
    return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'I could not generate the transcript right now.')], ephemeral: true });
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
          await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
      }

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('ticket:users:')) {
        if (!isAdmin(interaction)) {
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Only admins can manage users for tickets.')], ephemeral: true });
        }
        const [, , channelId] = interaction.customId.split(':');
        await sendManageMenu(interaction, channelId, 'user', 'Choose whether to add or remove a user from this ticket.');
        return;
      }

      if (interaction.customId.startsWith('ticket:roles:')) {
        if (!isAdmin(interaction)) {
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Only admins can manage roles for tickets.')], ephemeral: true });
        }
        const [, , channelId] = interaction.customId.split(':');
        await sendManageMenu(interaction, channelId, 'role', 'Choose whether to add or remove a role from this ticket.');
        return;
      }

      if (interaction.customId.startsWith('ticket:close:')) {
        const [, , channelId] = interaction.customId.split(':');
        const ticket = await Ticket.findOne({ channelId }).lean();
        if (!ticket || (ticket.openerId !== interaction.user.id && !isAdmin(interaction))) {
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Only the ticket creator or an admin can close this ticket.')], ephemeral: true });
        }

        const confirmationMessage = await interaction.reply({
          content: 'Are you sure you want to close this ticket?',
          components: [buildConfirmButtons(channelId, 'close', interaction.message.id)],
          fetchReply: true
        });
        return confirmationMessage;
      }

      if (interaction.customId.startsWith('ticket:delete:')) {
        if (!isAdmin(interaction)) {
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Only admins can delete tickets.')], ephemeral: true });
        }
        const [, , channelId] = interaction.customId.split(':');
        const confirmationMessage = await interaction.reply({
          content: 'Are you sure you want to delete this ticket?',
          components: [buildConfirmButtons(channelId, 'delete', interaction.message.id)],
          fetchReply: true
        });
        return confirmationMessage;
      }

      if (interaction.customId.startsWith('ticket:transcript:')) {
        if (!isAdmin(interaction)) {
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Only admins can generate transcripts.')], ephemeral: true });
        }
        const [, , channelId] = interaction.customId.split(':');
        return sendTranscript(interaction, channelId);
      }

      if (interaction.customId.startsWith('ticket:userAdd:') || interaction.customId.startsWith('ticket:userRemove:')) {
        const [, , action, channelId] = interaction.customId.split(':');
        return addOrRemoveTarget(interaction, channelId, action, 'user');
      }

      if (interaction.customId.startsWith('ticket:roleAdd:') || interaction.customId.startsWith('ticket:roleRemove:')) {
        const [, , action, channelId] = interaction.customId.split(':');
        return addOrRemoveTarget(interaction, channelId, action, 'role');
      }

      if (interaction.customId.startsWith('ticket:close:confirm:') || interaction.customId.startsWith('ticket:close:cancel:')) {
        const [, , , action, channelId] = interaction.customId.split(':');
        if (action === 'cancel') {
          await interaction.message.edit({ content: 'Ticket close cancelled.', components: [] });
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, 'Ticket close cancelled.')], ephemeral: true });
        }
        return closeTicket(interaction, channelId);
      }

      if (interaction.customId.startsWith('ticket:delete:confirm:') || interaction.customId.startsWith('ticket:delete:cancel:')) {
        const [, , , action, channelId] = interaction.customId.split(':');
        if (action === 'cancel') {
          await interaction.message.edit({ content: 'Ticket delete cancelled.', components: [] });
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, 'Ticket delete cancelled.')], ephemeral: true });
        }
        return deleteTicket(interaction, channelId);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('ticketSetupModal:')) {
        if (!isAdmin(interaction)) {
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'You need administrator permissions to complete ticket setup.')], ephemeral: true });
        }

        const [, panelChannelId, categoryChannelId] = interaction.customId.split(':');
        const panelChannel = await interaction.guild.channels.fetch(panelChannelId).catch(() => null);
        const categoryChannel = await interaction.guild.channels.fetch(categoryChannelId).catch(() => null);

        if (!panelChannel || panelChannel.type !== ChannelType.GuildText) {
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Panel channel is not valid.')], ephemeral: true });
        }
        if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Ticket category is not valid.')], ephemeral: true });
        }

        const panelMessage = interaction.fields.getTextInputValue('panelMessage');
        const openingMessage = interaction.fields.getTextInputValue('openingMessage');
        const optionOne = interaction.fields.getTextInputValue('optionOne');
        const optionTwo = interaction.fields.getTextInputValue('optionTwo');
        const optionThree = interaction.fields.getTextInputValue('optionThree');

        const options = [optionOne, optionTwo, optionThree]
          .filter(Boolean)
          .map((input, index) => {
            const [label, description] = input.split('|').map((part) => part.trim());
            const normalizedLabel = label || `Option ${index + 1}`;
            return {
              label: normalizedLabel,
              description: description || input.trim() || 'No description provided.',
              value: normalizedLabel.toLowerCase().replace(/\s+/g, '-')
            };
          });

        if (options.length === 0) {
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Please provide at least one ticket option.')], ephemeral: true });
        }

        const config = await TicketConfig.findOneAndUpdate(
          { guildId: interaction.guild.id },
          {
            guildId: interaction.guild.id,
            panelChannelId: panelChannel.id,
            ticketCategoryId: categoryChannel.id,
            panelMessage,
            openingMessage,
            options,
            createdBy: interaction.user.id,
            updatedAt: new Date()
          },
          { upsert: true, new: true }
        );

        const panelEmbed = buildTicketEmbed(config);
        const selectRow = buildTicketSelect(config);
        const panelMessageSent = await panelChannel.send({ embeds: [panelEmbed], components: [selectRow] });
        config.panelMessageId = panelMessageSent.id;
        await config.save();

        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, 'Ticket module configured successfully.')], ephemeral: true });
      }

      if (interaction.customId.startsWith('ticket:userModal:') || interaction.customId.startsWith('ticket:roleModal:')) {
        const [, kind, action, channelId, messageId] = interaction.customId.split(':');
        const targetKind = kind === 'user' ? 'user' : 'role';
        await handleTargetChange(interaction, channelId, action, targetKind);
        return;
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId !== 'ticketOpenSelect') return;

      const config = await TicketConfig.findOne({ guildId: interaction.guild.id }).lean();
      if (!config) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Ticket module is not configured.')], ephemeral: true });
      }

      const selected = interaction.values[0];
      return createTicketChannel(interaction, config, selected);
    }
  }
};
