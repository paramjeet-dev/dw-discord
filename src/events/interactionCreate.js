const { Events, EmbedBuilder } = require('discord.js');
const { buildServerEmbed } = require('../utils/embedHelper');
const {
  closeTicket,
  reopenTicket,
  claimTicket,
  unclaimTicket,
  openTicketButton,
  submitTicketForm,
  canManageTicket
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
          const ticket = await closeTicket(interaction);
          return { title: 'Ticket closed', description: `Ticket ${ticket.channelId} has been closed.`, color: 0x57F287 };
        },
        'ticket-reopen': async () => {
          if (!(await canManageTicket(interaction, null))) {
            throw new Error('You do not have permission to reopen this ticket.');
          }
          const ticket = await reopenTicket(interaction);
          return { title: 'Ticket reopened', description: `Ticket ${ticket.channelId} has been reopened.`, color: 0x57F287 };
        },
        'ticket-claim': async () => {
          if (!(await canManageTicket(interaction, null))) {
            throw new Error('You do not have permission to claim this ticket.');
          }
          const ticket = await claimTicket(interaction);
          return { title: 'Ticket claimed', description: `Ticket claimed by <@${ticket.claimedBy}>.`, color: 0x57F287 };
        },
        'ticket-unclaim': async () => {
          if (!(await canManageTicket(interaction, null))) {
            throw new Error('You do not have permission to unclaim this ticket.');
          }
          const ticket = await unclaimTicket(interaction);
          return { title: 'Ticket unclaimed', description: `Ticket ${ticket.channelId} is now unclaimed.`, color: 0x5865F2 };
        }
      };

      const handler = ticketHandlers[interaction.customId];
      if (handler) {
        try {
          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true }).catch(() => null);
          }

          const result = await handler();
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
