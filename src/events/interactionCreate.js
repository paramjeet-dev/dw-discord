const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildServerEmbed } = require('../utils/embedHelper');
const {
  closeTicket,
  reopenTicket,
  claimTicket,
  unclaimTicket,
  openTicketButton,
  submitTicketForm,
  canManageTicket,
  canManageTicketStaff,
  buildTicketConfirmationRow,
  buildTicketUserActionRow,
  buildTicketUserModal,
  buildTicketSetupModal,
  parseTicketSetupDraft,
  ensureTicketSettings,
  getTicketSettings,
  addUserToTicket,
  removeUserFromTicket,
  createPanelMessage
} = require('../utils/ticketHelper');

const ticketSetupDrafts = new Map();
const ticketSetupReviewMessages = new Map();

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

function buildTicketSetupNavigationRow({ nextId, nextLabel, backId, backLabel }) {
  const row = new ActionRowBuilder();

  if (backId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(backId)
        .setLabel(backLabel || 'Back')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel(nextLabel || 'Continue')
      .setStyle(ButtonStyle.Primary)
  );

  return row;
}

function buildTicketSetupButtonRow({ nextId, nextLabel, backId, backLabel, saveLabel }) {
  const row = new ActionRowBuilder();

  if (backId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(backId)
        .setLabel(backLabel || 'Back')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel(nextLabel || saveLabel || 'Continue')
      .setStyle(ButtonStyle.Primary)
  );

  return row;
}

function formatTicketSetupValue(value, fallback = 'Not set') {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function buildGuildEmbedFooter(guild, extraText = '') {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const name = guild?.name || 'Server';
  const iconURL = guild?.iconURL?.({ dynamic: true, size: 64 }) || undefined;
  return { text: `${name}${extraText ? ` • ${extraText}` : ''} • ${time}`, iconURL };
}

function buildTicketSetupConfirmationEmbed(guild, draft = {}) {
  const panelChannel = draft.panelChannelId ? `<#${draft.panelChannelId}>` : 'Not set';
  const supportRole = draft.supportRoleId ? `<@&${draft.supportRoleId}>` : 'Not set';
  const transcriptChannel = draft.transcriptChannelId ? `<#${draft.transcriptChannelId}>` : 'Not set';
  const categoryId = draft.categoryId ? `<#${draft.categoryId}>` : 'Not set';

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Confirm ticket panel settings')
    .setThumbnail(guild?.iconURL?.({ dynamic: true, size: 256 }) || null)
    .setDescription('Review the values below, then click Save to publish the panel in the selected channel.')
    .setFooter(buildGuildEmbedFooter(guild, 'Ticket setup'))
    .addFields(
      { name: 'Panel name', value: formatTicketSetupValue(draft.panelName), inline: true },
      { name: 'Panel header', value: formatTicketSetupValue(draft.panelHeader), inline: true },
      { name: 'Panel channel', value: panelChannel, inline: true },
      { name: 'Staff role', value: supportRole, inline: true },
      { name: 'Embed message', value: formatTicketSetupValue(draft.panelMessage), inline: false },
      { name: 'Message above embed', value: formatTicketSetupValue(draft.panelMessageAbove), inline: false },
      { name: 'Opening category', value: categoryId, inline: true },
      { name: 'Transcript channel', value: transcriptChannel, inline: true },
      { name: 'Opening message', value: formatTicketSetupValue(draft.ticketOpeningMessage), inline: false },
      { name: 'Ping targets', value: formatTicketSetupValue(draft.pingTargets), inline: false },
      { name: 'Panel type', value: formatTicketSetupValue(draft.panelType || 'buttons'), inline: true },
      { name: 'Panel options', value: formatTicketSetupValue((Array.isArray(draft.panelOptions) ? draft.panelOptions.join(', ') : draft.panelOptions) || 'general, billing, bug, other'), inline: true }
    );
}

function buildTicketSetupReviewButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket-setup-open-page-1').setLabel('Edit Page 1').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket-setup-open-page-2').setLabel('Edit Page 2').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket-setup-open-page-3').setLabel('Edit Page 3').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket-setup-save').setLabel('Save panel').setStyle(ButtonStyle.Success)
    )
  ];
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
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
          } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
          }
        } catch (err) {
          console.error('Failed to send error response', err);
        }
      }

      return;
    }

    if (interaction.isButton()) {
      const ticketHandlers = {
        'open-ticket': async () => {
          const ticket = await openTicketButton(interaction, 'general');
          return { title: 'Ticket created', description: `Ticket form opened for ${ticket.type}.`, color: 0x57F287 };
        },
        'ticket-close': async () => {
          if (!(await canManageTicket(interaction, null))) {
            throw new Error('You do not have permission to close this ticket.');
          }
          const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Confirm close ticket')
            .setDescription('This will close the ticket and remove the creator from the channel.');
          return { replyType: 'confirm', content: '', embeds: [embed], components: [buildTicketConfirmationRow('close')] };
        },
        'ticket-delete': async () => {
          if (!(await canManageTicketStaff(interaction))) {
            throw new Error('You do not have permission to delete this ticket.');
          }
          const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Confirm delete ticket')
            .setDescription('This will permanently delete the ticket channel. This action cannot be undone.');
          return { replyType: 'confirm', content: '', embeds: [embed], components: [buildTicketConfirmationRow('delete')] };
        },
        'ticket-close-confirm': async () => {
          const ticket = await closeTicket(interaction);
          return { title: 'Ticket closed', description: `Ticket ${ticket.channelId} has been closed.`, color: 0x57F287, messageOnly: true };
        },
        'ticket-delete-confirm': async () => {
          if (!(await canManageTicketStaff(interaction))) {
            throw new Error('You do not have permission to delete this ticket.');
          }
          const channel = interaction.channel;
          if (channel) {
            await channel.delete('Ticket deleted by staff.').catch(() => null);
          }
          return { title: 'Ticket deleted', description: 'This ticket channel has been deleted.', color: 0xED4245, messageOnly: true };
        },
        'ticket-close-cancel': async () => {
          return { title: 'Close cancelled', description: 'The close action was cancelled.', color: 0x5865F2, messageOnly: true };
        },
        'ticket-delete-cancel': async () => {
          return { title: 'Delete cancelled', description: 'The delete action was cancelled.', color: 0x5865F2, messageOnly: true };
        },
        'ticket-reopen': async () => {
          if (!(await canManageTicket(interaction, null))) {
            throw new Error('You do not have permission to reopen this ticket.');
          }
          const ticket = await reopenTicket(interaction);
          return { title: 'Ticket reopened', description: `Ticket ${ticket.channelId} has been reopened.`, color: 0x57F287 };
        },
        'ticket-claim': async () => {
          if (!(await canManageTicketStaff(interaction))) {
            throw new Error('You do not have permission to claim this ticket.');
          }
          const ticket = await claimTicket(interaction);
          return { title: 'Ticket claimed', description: `Ticket claimed by <@${ticket.claimedBy}>.`, color: 0x57F287 };
        },
        'ticket-unclaim': async () => {
          if (!(await canManageTicketStaff(interaction))) {
            throw new Error('You do not have permission to unclaim this ticket.');
          }
          const ticket = await unclaimTicket(interaction);
          return { title: 'Ticket unclaimed', description: `Ticket ${ticket.channelId} is now unclaimed.`, color: 0x5865F2 };
        },
        'ticket-users': async () => {
          if (!(await canManageTicketStaff(interaction))) {
            throw new Error('You do not have permission to manage users for this ticket.');
          }
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Manage ticket users')
            .setDescription('Choose whether to add or remove a user from this ticket.');
          return { replyType: 'confirm', content: '', embeds: [embed], components: [buildTicketUserActionRow()] };
        },
        'ticket-users-add': async () => {
          if (!(await canManageTicketStaff(interaction))) {
            throw new Error('You do not have permission to manage users for this ticket.');
          }
          await interaction.showModal(buildTicketUserModal('add')).catch(() => null);
          return null;
        },
        'ticket-users-remove': async () => {
          if (!(await canManageTicketStaff(interaction))) {
            throw new Error('You do not have permission to manage users for this ticket.');
          }
          await interaction.showModal(buildTicketUserModal('remove')).catch(() => null);
          return null;
        },
        'ticket-setup-open-page-1': async () => {
          const draftKey = `${interaction.guildId}:${interaction.user.id}`;
          const draft = ticketSetupDrafts.get(draftKey) || {};
          const settings = await getTicketSettings(interaction.guildId) || {};
          await interaction.showModal(buildTicketSetupModal(1, { ...settings, ...draft })).catch(() => null);
          return null;
        },
        'ticket-setup-open-page-2': async () => {
          const draftKey = `${interaction.guildId}:${interaction.user.id}`;
          const draft = ticketSetupDrafts.get(draftKey) || {};
          const settings = await getTicketSettings(interaction.guildId) || {};
          await interaction.showModal(buildTicketSetupModal(2, { ...settings, ...draft })).catch(() => null);
          return null;
        },
        'ticket-setup-open-page-3': async () => {
          const draftKey = `${interaction.guildId}:${interaction.user.id}`;
          const draft = ticketSetupDrafts.get(draftKey) || {};
          const settings = await getTicketSettings(interaction.guildId) || {};
          await interaction.showModal(buildTicketSetupModal(3, { ...settings, ...draft })).catch(() => null);
          return null;
        },
        'ticket-setup-save': async () => {
          const draftKey = `${interaction.guildId}:${interaction.user.id}`;
          const draft = ticketSetupDrafts.get(draftKey) || {};

          const panelOptions = String(draft.panelOptions || 'general,billing,bug,other')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);

          const pingTargets = String(draft.pingTargets || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => value.match(/\d{17,20}/)?.[0] || value)
            .filter(Boolean);

          const savedSettings = await ensureTicketSettings(interaction.guildId, {
            guildId: interaction.guildId,
            panelName: draft.panelName || 'Support tickets',
            panelHeader: draft.panelHeader || 'Open a support ticket',
            panelMessage: draft.panelMessage || 'Need help? Use the panel below and a staff member will respond soon.',
            panelMessageAbove: draft.panelMessageAbove || '',
            supportRoleId: draft.supportRoleId || null,
            categoryId: draft.categoryId || null,
            panelChannelId: draft.panelChannelId || null,
            transcriptChannelId: draft.transcriptChannelId || null,
            ticketOpeningMessage: draft.ticketOpeningMessage || 'Your ticket has been created. A staff member will respond soon.',
            panelType: draft.panelType || 'buttons',
            panelOptions: panelOptions.length ? panelOptions : ['general', 'billing', 'bug', 'other'],
            pingUserIds: pingTargets.filter((id) => /^\d{17,20}$/.test(id)),
            pingRoleIds: [],
            enabled: true,
            allowUserOpenTickets: true,
            defaultReason: 'Customer support request.'
          });

          const panelChannelId = savedSettings?.panelChannelId || draft.panelChannelId;
          if (!panelChannelId) {
            throw new Error('No panel channel was selected. Please choose a panel channel on page 1.');
          }

          await createPanelMessage(interaction, panelChannelId);
          ticketSetupDrafts.delete(draftKey);

          const successEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Ticket panel published')
            .setDescription(`The ticket panel was sent to <#${panelChannelId}>.`)
            .setThumbnail(interaction.guild?.iconURL?.({ dynamic: true, size: 256 }) || null)
            .setFooter(buildGuildEmbedFooter(interaction.guild, 'Ticket panel'));

          await interaction.update({ embeds: [successEmbed], components: [] }).catch(() => null);
          return null;
        }
      };

      const handler = ticketHandlers[interaction.customId];
      if (handler) {
        try {
          const result = await handler();
          if (!result) return;

          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(() => null);
          }

          if (result.replyType === 'confirm') {
            return interaction.editReply({ embeds: result.embeds, components: result.components || [] });
          }

          const embed = new EmbedBuilder()
            .setColor(result.color)
            .setTitle(result.title)
            .setDescription(result.description);

          return interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error('Ticket button error:', error);
          const embed = buildServerEmbed(interaction, 0xED4245, error.message || 'Unable to process this ticket action.');
          return interaction.editReply({ embeds: [embed] });
        }
      }
    }

    if (interaction.isModalSubmit()) {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply().catch(() => null);
        }

        if (interaction.customId.startsWith('ticket-setup-page-1')) {
          const draftKey = `${interaction.guildId}:${interaction.user.id}`;
          const pageOneDraft = parseTicketSetupDraft(interaction);
          ticketSetupDrafts.set(draftKey, pageOneDraft);

          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Ticket setup: continue')
            .setDescription('Your first page is saved. Use the button below to continue to the next setup page.');

          const reply = await interaction.editReply({
            embeds: [embed],
            components: [buildTicketSetupButtonRow({ nextId: 'ticket-setup-open-page-2', nextLabel: 'Next page' })]
          }).catch(() => null);
          if (reply && reply.id && reply.channelId) {
            ticketSetupReviewMessages.delete(draftKey);
          }
          return;
        }

        if (interaction.customId.startsWith('ticket-setup-page-2')) {
          const draftKey = `${interaction.guildId}:${interaction.user.id}`;
          const existingDraft = ticketSetupDrafts.get(draftKey) || {};
          const pageTwoDraft = {
            panelMessageAbove: readModalField(interaction, 'panel_message_above', '') || '',
            categoryId: readModalField(interaction, 'ticket_category_id', existingDraft.categoryId || '') || existingDraft.categoryId || null,
            transcriptChannelId: readModalField(interaction, 'transcript_channel_id', existingDraft.transcriptChannelId || '') || existingDraft.transcriptChannelId || null,
            ticketOpeningMessage: readModalField(interaction, 'ticket_opening_message', 'Your ticket has been created. A staff member will respond soon.') || 'Your ticket has been created. A staff member will respond soon.',
            pingTargets: readModalField(interaction, 'ping_targets', '') || '',
          };

          ticketSetupDrafts.set(draftKey, { ...existingDraft, ...pageTwoDraft });

          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Ticket setup: final page')
            .setDescription('Your second page is saved. Use the button below to open the final setup page.');

          const reply = await interaction.editReply({
            embeds: [embed],
            components: [buildTicketSetupButtonRow({ backId: 'ticket-setup-open-page-1', backLabel: 'Back', nextId: 'ticket-setup-open-page-3', nextLabel: 'Final page' })]
          }).catch(() => null);
          if (reply && reply.id && reply.channelId) {
            ticketSetupReviewMessages.delete(draftKey);
          }
          return;
        }

        if (interaction.customId.startsWith('ticket-setup-page-3')) {
          const draftKey = `${interaction.guildId}:${interaction.user.id}`;
          const existingDraft = ticketSetupDrafts.get(draftKey) || {};
          const finalDraft = {
            ...existingDraft,
            panelType: readModalField(interaction, 'panel_type', 'buttons') || 'buttons',
            panelOptions: readModalField(interaction, 'panel_options', 'general,billing,bug,other') || 'general,billing,bug,other',
          };

          ticketSetupDrafts.set(draftKey, finalDraft);

          const updatePayload = {
            embeds: [buildTicketSetupConfirmationEmbed(interaction.guild, finalDraft)],
            components: buildTicketSetupReviewButtons()
          };

          const reviewMessageRef = ticketSetupReviewMessages.get(draftKey);
          if (reviewMessageRef) {
            const channel = interaction.client.channels.cache.get(reviewMessageRef.channelId) || await interaction.client.channels.fetch(reviewMessageRef.channelId).catch(() => null);
            const message = channel?.messages?.cache?.get(reviewMessageRef.messageId) || await channel?.messages?.fetch(reviewMessageRef.messageId).catch(() => null);
            if (message) {
              await message.edit(updatePayload).catch(() => null);
              await interaction.editReply({ content: 'Review updated.' }).catch(() => null);
              return;
            }
          }

          const reply = await interaction.editReply(updatePayload).catch(() => null);
          if (reply && reply.id && reply.channelId) {
            ticketSetupReviewMessages.set(draftKey, { channelId: reply.channelId, messageId: reply.id });
          }
          return;
        }

        if (interaction.customId.startsWith('ticket-user-modal-')) {
          const action = interaction.customId.replace('ticket-user-modal-', '');
          const rawUser = interaction.fields.getTextInputValue('ticket-user-id').trim();
          const match = rawUser.match(/(\d{17,20})/);
          const userId = match ? match[1] : null;

          if (!userId) {
            return interaction.editReply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Please provide a valid user ID or mention.')] });
          }

          if (action === 'add') {
            await addUserToTicket(interaction, { id: userId });
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('User added').setDescription(`<@${userId}> has been added to this ticket.`)] });
          }

          await removeUserFromTicket(interaction, { id: userId });
          return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('User removed').setDescription(`<@${userId}> has been removed from this ticket.`)] });
        }

        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply().catch(() => null);
        }

        const result = await submitTicketForm(interaction);
        return interaction.editReply({ embeds: [result.embed] });
      } catch (error) {
        console.error('Ticket form error:', error);
        const embed = buildServerEmbed(interaction, 0xED4245, error.message || 'Unable to submit this ticket form.');
        return interaction.editReply({ embeds: [embed] });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ticket-category-select') {
        try {
          await openTicketButton(interaction, interaction.values[0] || 'general');
          return;
        } catch (error) {
          console.error('Ticket category selection error:', error);
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, error.message || 'Unable to open this ticket form.')] });
        }
      }

      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply().catch(() => null);
        }
      } catch (err) {}

      return interaction.followUp({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Ticket selection menus are not enabled in this version yet.')] });
    }
  }
};
