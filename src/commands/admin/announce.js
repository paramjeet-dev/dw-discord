const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send an announcement to the current channel.')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('The message to announce')
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('embed')
        .setDescription('Send the announcement as an embed instead of a plain message')
        .setRequired(false)
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

    const message = interaction.options.getString('message', true);
    const useEmbed = interaction.options.getBoolean('embed') ?? false;

    if (useEmbed) {
      await interaction.channel.send({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(message)]
      });
    } else {
      await interaction.channel.send(message);
    }

    const successEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setDescription('Announcement sent successfully.');

    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  }
};
