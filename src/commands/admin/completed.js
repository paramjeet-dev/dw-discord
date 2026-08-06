const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { buildServerEmbed } = require('../../utils/embedHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('completed')
    .setDescription('Move the current channel into a chosen category.')
    .addChannelOption((option) =>
      option
        .setName('category')
        .setDescription('The category to move this channel into')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildCategory)
    ),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used inside a server.',
        ephemeral: true
      });
    }

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      const embed = buildServerEmbed(interaction, 0xED4245, 'You need administrator permissions to use this command.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const category = interaction.options.getChannel('category', true);

    if (!category || category.type !== ChannelType.GuildCategory) {
      const embed = buildServerEmbed(interaction, 0xED4245, 'The selected category is not valid.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!interaction.channel || interaction.channel.type !== 0) {
      const embed = buildServerEmbed(interaction, 0xED4245, 'This command must be run from a text channel.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      await interaction.channel.setParent(category.id);
      const successEmbed = buildServerEmbed(interaction, 0x57F287, `Moved this channel to **${category.name}**.`);
      return interaction.reply({ embeds: [successEmbed] });
    } catch (error) {
      const errorEmbed = buildServerEmbed(interaction, 0xED4245, 'I could not move this channel. Please check the permissions and try again.');
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
};
