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
  addUserToTicket,
  removeUserFromTicket
} = require('../utils/ticketHelper');

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
        }
      };

      const handler = ticketHandlers[interaction.customId];
      if (handler) {
        try {
          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true }).catch(() => null);
          }

          const result = await handler();
          if (!result) return;

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
        if (interaction.customId.startsWith('ticket-user-modal-')) {
          const action = interaction.customId.replace('ticket-user-modal-', '');
          const rawUser = interaction.fields.getTextInputValue('ticket-user-id').trim();
          const match = rawUser.match(/(\d{17,20})/);
          const userId = match ? match[1] : null;

          if (!userId) {
            return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Please provide a valid user ID or mention.')], ephemeral: true });
          }

          if (action === 'add') {
            await addUserToTicket(interaction, { id: userId });
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('User added').setDescription(`<@${userId}> has been added to this ticket.`)], ephemeral: true });
          }

          await removeUserFromTicket(interaction, { id: userId });
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('User removed').setDescription(`<@${userId}> has been removed from this ticket.`)], ephemeral: true });
        }

        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: true }).catch(() => null);
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
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, error.message || 'Unable to open this ticket form.')], ephemeral: true });
        }
      }

      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: true }).catch(() => null);
        }
      } catch (err) {}

      return interaction.followUp({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Ticket selection menus are not enabled in this version yet.')], ephemeral: true });
    }
  }
};
