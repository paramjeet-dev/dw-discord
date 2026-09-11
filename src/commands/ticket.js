const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { buildServerEmbed } = require('../utils/embedHelper');
const {
  createTicket,
  createPanelMessage,
  closeTicket,
  reopenTicket,
  claimTicket,
  unclaimTicket,
  addUserToTicket,
  removeUserFromTicket,
  renameTicket,
  ensureTicketSettings,
  getTicketSettings,
  getTicketInfo,
  getTicketsForGuild,
  buildTicketListEmbed,
  buildTicketSetupModal,
  canManageTicket
} = require('../utils/ticketHelper');

function requireSupportAccess(interaction, ticket) {
  return canManageTicket(interaction, ticket);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Create and manage support tickets.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Open a new support ticket.')
        .addStringOption((option) => option.setName('reason').setDescription('Why are you opening this ticket?').setRequired(false))
        .addStringOption((option) => option.setName('summary').setDescription('A short summary for the ticket.').setRequired(false))
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Select the ticket category.')
            .setRequired(false)
            .addChoices(
              { name: 'General', value: 'general' },
              { name: 'Billing', value: 'billing' },
              { name: 'Bug', value: 'bug' },
              { name: 'Other', value: 'other' }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('close')
        .setDescription('Close the current ticket.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reopen')
        .setDescription('Reopen the current ticket.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('claim')
        .setDescription('Claim the current ticket for staff review.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unclaim')
        .setDescription('Unclaim the current ticket.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add a member to this ticket.')
        .addUserOption((option) => option.setName('user').setDescription('The member to add.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a member from this ticket.')
        .addUserOption((option) => option.setName('user').setDescription('The member to remove.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('rename')
        .setDescription('Rename the current ticket channel.')
        .addStringOption((option) => option.setName('name').setDescription('The new ticket name.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Create the support ticket panel in a channel.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to post the ticket panel in.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List open tickets in this guild.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure the ticketing module for this server.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('info')
        .setDescription('View details for the current ticket.')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);
        return interaction.editReply({ content: 'This command can only be used inside a server.' }).catch(() => null);
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.deferReply({ ephemeral: true }).catch(() => null);
          return interaction.editReply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'You need administrator permissions to configure the ticket system.')] }).catch(() => null);
      }

      const settings = await getTicketSettings(interaction.guildId);
      await interaction.showModal(buildTicketSetupModal(1, settings || {})).catch(() => null);
      return;
    }

    await interaction.deferReply({ ephemeral: true }).catch(() => null);

    try {
      switch (subcommand) {
        case 'create': {
          const reason = interaction.options.getString('reason') || 'No reason provided.';
          const summary = interaction.options.getString('summary') || 'No summary provided.';
          const type = interaction.options.getString('type') || 'general';

          const result = await createTicket({ interaction, reason, summary, type });
          return interaction.editReply({ content: `Ticket created in ${result.channel.toString()}` });
        }

        case 'panel': {
          if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'You need administrator permissions to create the ticket panel.');
            return interaction.editReply({ embeds: [embed] });
          }

          const channel = interaction.options.getChannel('channel') || interaction.channel;
          const result = await createPanelMessage(interaction, channel.id);
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Ticket panel created')
            .setDescription(`The ticket panel was posted in ${result.message.channel.toString()}.`);
          return interaction.editReply({ embeds: [embed] });
        }

        case 'list': {
          const tickets = await getTicketsForGuild(interaction.guildId);
          const embed = buildTicketListEmbed(interaction.guild, tickets);
          return interaction.editReply({ embeds: [embed] });
        }

        case 'close': {
          const allowed = await requireSupportAccess(interaction, null);
          if (!allowed) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'You do not have permission to close this ticket.');
            return interaction.editReply({ embeds: [embed] });
          }

          const ticket = await closeTicket(interaction);
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Ticket closed')
            .setDescription(`Ticket ${ticket.channelId} has been closed.`);
          return interaction.editReply({ embeds: [embed] });
        }

        case 'reopen': {
          const allowed = await requireSupportAccess(interaction, null);
          if (!allowed) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'You do not have permission to reopen this ticket.');
            return interaction.editReply({ embeds: [embed] });
          }

          const ticket = await reopenTicket(interaction);
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Ticket reopened')
            .setDescription(`Ticket ${ticket.channelId} has been reopened.`);
          return interaction.editReply({ embeds: [embed] });
        }

        case 'claim': {
          const allowed = await requireSupportAccess(interaction, null);
          if (!allowed) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'You do not have permission to claim this ticket.');
            return interaction.editReply({ embeds: [embed] });
          }

          const ticket = await claimTicket(interaction);
          return interaction.editReply({ embeds: [buildServerEmbed(interaction, 0x57F287, `Ticket claimed by <@${ticket.claimedBy}>.`)] });
        }

        case 'unclaim': {
          const allowed = await requireSupportAccess(interaction, null);
          if (!allowed) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'You do not have permission to unclaim this ticket.');
            return interaction.editReply({ embeds: [embed] });
          }

          const ticket = await unclaimTicket(interaction);
          return interaction.editReply({ embeds: [buildServerEmbed(interaction, 0x5865F2, `Ticket ${ticket.channelId} is now unclaimed.`)] });
        }

        case 'add': {
          const member = interaction.options.getMember('user');
          if (!member) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'Please choose a valid user to add.');
            return interaction.editReply({ embeds: [embed] });
          }

          const allowed = await requireSupportAccess(interaction, null);
          if (!allowed) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'You do not have permission to manage participants for this ticket.');
            return interaction.editReply({ embeds: [embed] });
          }

          const ticket = await addUserToTicket(interaction, member.user);
          return interaction.editReply({ embeds: [buildServerEmbed(interaction, 0x57F287, `<@${member.user.id}> was added to ticket ${ticket.channelId}.`)] });
        }

        case 'remove': {
          const member = interaction.options.getMember('user');
          if (!member) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'Please choose a valid user to remove.');
            return interaction.editReply({ embeds: [embed] });
          }

          const allowed = await requireSupportAccess(interaction, null);
          if (!allowed) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'You do not have permission to manage participants for this ticket.');
            return interaction.editReply({ embeds: [embed] });
          }

          const ticket = await removeUserFromTicket(interaction, member.user);
          return interaction.editReply({ embeds: [buildServerEmbed(interaction, 0xED4245, `<@${member.user.id}> was removed from ticket ${ticket.channelId}.`)] });
        }

        case 'rename': {
          const newName = interaction.options.getString('name', true);
          const allowed = await requireSupportAccess(interaction, null);
          if (!allowed) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'You do not have permission to rename this ticket.');
            return interaction.editReply({ embeds: [embed] });
          }

          const ticket = await renameTicket(interaction, newName);
          return interaction.editReply({ embeds: [buildServerEmbed(interaction, 0x5865F2, `Ticket renamed to ${ticket.summary}.`)] });
        }

        case 'setup': {
          const settings = await getTicketSettings(interaction.guildId);
          return interaction.showModal(buildTicketSetupModal(1, settings || {})).catch(() => null);
        }

        case 'info': {
          const channelId = interaction.channelId;
          const info = await getTicketInfo(interaction.guild, channelId);
          if (!info) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'This channel is not a ticket.');
            return interaction.editReply({ embeds: [embed] });
          }

          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Ticket info')
            .setDescription(`Ticket channel: <#${channelId}>`)
            .addFields(
              { name: 'Opened by', value: `<@${info.ticket.openerId}>`, inline: true },
              { name: 'Status', value: info.ticket.status, inline: true },
              { name: 'Claimed by', value: info.ticket.claimedBy ? `<@${info.ticket.claimedBy}>` : 'Unclaimed', inline: true },
              { name: 'Reason', value: info.ticket.reason || 'No reason provided.', inline: false },
              { name: 'Summary', value: info.ticket.summary || 'No summary provided.', inline: false }
            );

          return interaction.editReply({ embeds: [embed] });
        }

        default:
          return interaction.editReply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Unknown ticket action.')] });
      }
    } catch (error) {
      console.error('Ticket command error:', error);
      return interaction.editReply({ embeds: [buildServerEmbed(interaction, 0xED4245, error.message || 'An error occurred while processing this ticket action.')] });
    }
  }
};
