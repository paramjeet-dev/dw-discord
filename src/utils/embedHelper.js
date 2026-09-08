const { EmbedBuilder } = require('discord.js');

function buildServerEmbed(interaction, color, description) {
  const serverIcon = interaction.guild.iconURL({ extension: 'png', size: 256 }) || interaction.client.user.displayAvatarURL({ extension: 'png', size: 256 });
  const footerIcon = interaction.guild.iconURL({ extension: 'png', size: 64 }) || interaction.client.user.displayAvatarURL({ extension: 'png', size: 64 });
  const locale = interaction.locale || (interaction.user && interaction.user.locale) || 'en-US';
  const timestamp = new Date().toLocaleString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return new EmbedBuilder()
    .setColor(color)
    .setDescription(description)
    .setThumbnail(serverIcon)
    .setFooter({
      text: `${interaction.guild.name} • ${timestamp}`,
      iconURL: footerIcon
    });
}

module.exports = { buildServerEmbed };
