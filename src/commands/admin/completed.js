const { SlashCommandBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { buildServerEmbed } = require('../../utils/embedHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('completed')
    .setDescription('Move the current channel into a chosen category.'),

  async execute(interaction) {
    await interaction.deferReply().catch(() => null);
    if (!interaction.inGuild()) {
      return interaction.followUp({ content: 'This command can only be used inside a server.', ephemeral: true });
    }

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      const embed = buildServerEmbed(interaction, 0xED4245, 'You need administrator permissions to use this command.');
      return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.isThread()) {
      const embed = buildServerEmbed(interaction, 0xED4245, 'This command must be run from a text channel.');
      return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    const categoryOptions = interaction.guild.channels.cache
      .filter((channel) => channel.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position)
      .map((channel) => ({
        label: channel.name,
        value: channel.id
      }))
      .slice(0, 25);

    if (categoryOptions.length === 0) {
      const embed = buildServerEmbed(interaction, 0xED4245, 'No categories are available in this server.');
      return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('completedCategorySelect')
        .setPlaceholder('Choose a category')
        .addOptions(categoryOptions)
    );

    return interaction.followUp({
      content: 'Select the category you want to move this channel into.',
      components: [row],
      ephemeral: false,
      fetchReply: true
    });
  }
};
