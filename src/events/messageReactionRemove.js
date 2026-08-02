const { EmbedBuilder } = require('discord.js');
const Giveaway = require('../../models/giveaway');

const REACTION_EMOJI = '🎉';

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function buildGiveawayEmbed(giveaway) {
  const isEnded = giveaway.status === 'ended';
  const color = isEnded ? 0xED4245 : 0x5865F2;
  const winners = (giveaway.winnersList || []).length > 0
    ? giveaway.winnersList.map((id) => `<@${id}>`).join(', ')
    : 'No winners yet';
  const description = [
    `**Prize:** ${giveaway.prize}`,
    `**Winners:** ${giveaway.winners}`,
    `**Status:** ${giveaway.status.toUpperCase()}`,
    `**Ends:** ${formatTimestamp(giveaway.endAt)}`
  ].join('\n');

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎉 ${giveaway.prize}`)
    .setDescription(description)
    .addFields(
      { name: 'Hosted by', value: `<@${giveaway.hostedBy}>`, inline: true },
      { name: 'Participants', value: `${giveaway.participantCount || 0}`, inline: true },
      { name: isEnded ? 'Winners' : 'React with 🎉 to enter', value: winners, inline: false }
    );
}

async function refreshGiveawayMessage(giveaway, client) {
  if (!client) return;

  try {
    const guild = await client.guilds.fetch(giveaway.guildId);
    const channel = await guild.channels.fetch(giveaway.channelId);
    if (!channel || !channel.isTextBased() || channel.isThread()) return;
    const message = await channel.messages.fetch(giveaway.messageId);
    if (!message) return;
    await message.edit({ embeds: [buildGiveawayEmbed(giveaway)] });
  } catch {
    // Ignore errors from cleaned up messages or missing permissions.
  }
}

module.exports = {
  name: 'messageReactionRemove',
  async execute(reaction, user) {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    if (reaction.emoji.name !== REACTION_EMOJI) return;
    if (!reaction.message.guild) return;

    const giveaway = await Giveaway.findOne({ messageId: reaction.message.id, guildId: reaction.message.guild.id, status: 'active' });
    if (!giveaway) return;

    giveaway.participantCount = Math.max(0, (giveaway.participantCount || 1) - 1);
    await giveaway.save();
    await refreshGiveawayMessage(giveaway, reaction.message.client);
  }
};
