const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { buildServerEmbed } = require('../utils/embedHelper');
const {
  createTicket,
  closeTicket,
  reopenTicket,
  claimTicket,
  unclaimTicket,
  addUserToTicket,
  removeUserFromTicket,
  renameTicket,
  ensureTicketSettings,
  getTicketInfo,
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
        .setName('setup')
        .setDescription('Configure the ticketing module for this server.')
        .addChannelOption((option) => option.setName('category').setDescription('Category used for ticket channels.').setRequired(false))
        .addRoleOption((option) => option.setName('support_role').setDescription('Role used for staff support members.').setRequired(false))
        .addStringOption((option) => option.setName('prefix').setDescription('Ticket channel prefix, for example: ticket or support.').setRequired(false))
        .addChannelOption((option) => option.setName('transcript_channel').setDescription('Channel used for ticket transcripts/logs.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('info')
        .setDescription('View details for the current ticket.')
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true }).catch(() => null);

    if (!interaction.inGuild()) {
      return interaction.editReply({ content: 'This command can only be used inside a server.', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'create': {
          const reason = interaction.options.getString('reason') || 'No reason provided.';
          const summary = interaction.options.getString('summary') || 'No summary provided.';

          const result = await createTicket({ interaction, reason, summary });
          const success = buildServerEmbed(interaction, 0x57F287, `Ticket created: ${result.channel}`);
          return interaction.editReply({ embeds: [success], content: `Ticket created in ${result.channel.toString()}` });
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
          if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            const embed = buildServerEmbed(interaction, 0xED4245, 'You need administrator permissions to configure the ticket system.');
            return interaction.editReply({ embeds: [embed] });
          }

          const category = interaction.options.getChannel('category');
          const supportRole = interaction.options.getRole('support_role');
          const prefix = interaction.options.getString('prefix');
          const transcriptChannel = interaction.options.getChannel('transcript_channel');

          const config = await ensureTicketSettings(interaction.guildId, {
            guildId: interaction.guildId,
            categoryId: category ? category.id : null,
            supportRoleId: supportRole ? supportRole.id : null,
            ticketPrefix: prefix || 'ticket',
            transcriptChannelId: transcriptChannel ? transcriptChannel.id : null,
            enabled: true
          });

          const summaryEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Ticket system configured')
            .addFields(
              { name: 'Category', value: config.categoryId ? `<#${config.categoryId}>` : 'None', inline: true },
              { name: 'Support role', value: config.supportRoleId ? `<@&${config.supportRoleId}>` : 'None', inline: true },
              { name: 'Prefix', value: config.ticketPrefix || 'ticket', inline: true },
              { name: 'Transcript channel', value: config.transcriptChannelId ? `<#${config.transcriptChannelId}>` : 'None', inline: true }
            );

          return interaction.editReply({ embeds: [summaryEmbed] });
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
