const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('completed')
    .setDescription('Move the current channel into a chosen category.')
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('The category name to move this channel into')
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used inside a server.',
        ephemeral: true
      });
    }

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription('You need administrator permissions to use this command.');

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const categoryName = interaction.options.getString('category', true);
    const category = interaction.guild.channels.cache.find(
      (channel) => channel.type === 4 && channel.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (!category) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription(`Category "${categoryName}" was not found.`);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!interaction.channel || interaction.channel.type !== 0) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription('This command must be run from a text channel.');

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      await interaction.channel.setParent(category.id);
      const successEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setDescription(`Moved this channel to **${category.name}**.`);

      return interaction.reply({ embeds: [successEmbed], ephemeral: true });
    } catch (error) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription('I could not move this channel. Please check the permissions and try again.');

      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
};
