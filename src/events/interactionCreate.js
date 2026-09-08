const { Events, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { buildServerEmbed } = require('../utils/embedHelper');

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

    // For all component/modal interactions, respond that ticketing is disabled
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: true }).catch(() => null);
        }
      } catch (err) {}

      return interaction.followUp({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Ticketing module is currently disabled.')], ephemeral: true });
    }
  }
};
