const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { buildServerEmbed } = require('../../utils/embedHelper');

const TARGET_CHANNEL_ID = '123';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upload')
    .setDescription('Post an uploaded image to the configured target channel.')
    .addAttachmentOption((option) =>
      option
        .setName('image')
        .setDescription('The image to post')
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
      const embed = buildServerEmbed(interaction, 0xED4245, 'You need administrator permissions to use this command.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const attachment = interaction.options.getAttachment('image', true);

    if (!attachment) {
      const embed = buildServerEmbed(interaction, 0xED4245, 'Please upload an image to post.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!attachment.contentType?.startsWith('image/')) {
      const embed = buildServerEmbed(interaction, 0xED4245, 'The uploaded file must be an image.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (attachment.size > 8 * 1024 * 1024) {
      const embed = buildServerEmbed(interaction, 0xED4245, 'The image is too large. Please upload a file smaller than 8 MB.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      const targetChannel = await interaction.guild.channels.fetch(TARGET_CHANNEL_ID);

      if (!targetChannel || !targetChannel.isTextBased() || targetChannel.isThread()) {
        const embed = buildServerEmbed(interaction, 0xED4245, 'The target channel is not available or is not a text channel.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      await targetChannel.send({
        files: [{ attachment: attachment.url, name: attachment.name || 'uploaded-image.png' }]
      });

      const successEmbed = buildServerEmbed(interaction, 0x57F287, 'Image posted successfully.');
      return interaction.reply({ embeds: [successEmbed], ephemeral: true });
    } catch (error) {
      console.error(error);
      const errorEmbed = buildServerEmbed(interaction, 0xED4245, 'I could not post the image. Please check the target channel and bot permissions.');
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
};
