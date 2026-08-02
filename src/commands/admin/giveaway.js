const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { buildServerEmbed } = require('../../utils/embedHelper');
const Giveaway = require('../../models/giveaway');

const ALLOWED_ROLE_ID = '123';
const REACTION_EMOJI = '🎉';

let clientInstance = null;
let giveawayTimers = new Map();

function isAllowed(interaction) {
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  return interaction.member?.roles?.cache.has(ALLOWED_ROLE_ID) || false;
}

function parseDurationToMs(value) {
  if (!value) return null;

  const match = value.trim().match(/^(\d+)([smhdw])$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);

  return parts.join(' ');
}

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

async function getGiveawayMessage(giveaway, client) {
  if (!client) return null;

  try {
    const guild = await client.guilds.fetch(giveaway.guildId);
    const channel = await guild.channels.fetch(giveaway.channelId);
    if (!channel || !channel.isTextBased() || channel.isThread()) return null;
    return await channel.messages.fetch(giveaway.messageId);
  } catch {
    return null;
  }
}

async function refreshGiveawayMessage(giveaway, client) {
  if (!client) return;

  const message = await getGiveawayMessage(giveaway, client);
  if (!message) return;

  try {
    await message.edit({ embeds: [buildGiveawayEmbed(giveaway)] });
  } catch (error) {
    console.error('Could not refresh giveaway message:', error);
  }
}

async function getParticipantIds(message) {
  if (!message) return [];

  try {
    await message.reactions.fetch();
    const reaction = message.reactions.cache.get(REACTION_EMOJI);
    if (!reaction) return [];

    const users = await reaction.users.fetch();
    return users.filter((user) => !user.bot).map((user) => user.id);
  } catch (error) {
    console.error('Could not fetch giveaway participants:', error);
    return [];
  }
}

async function scheduleGiveawayEnd(giveaway, client) {
  if (giveaway.status !== 'active') return;

  clearTimeout(giveawayTimers.get(giveaway.id));
  const delay = giveaway.endAt - Date.now();
  if (delay <= 0) {
    await finalizeGiveaway(giveaway.id, client);
    return;
  }

  const timer = setTimeout(() => {
    void finalizeGiveaway(giveaway.id, client);
  }, delay);

  giveawayTimers.set(giveaway.id, timer);
}

async function finalizeGiveaway(giveawayId, client) {
  const giveaway = await Giveaway.findOne({ id: giveawayId, status: 'active' });
  if (!giveaway) return;

  const message = await getGiveawayMessage(giveaway, client);
  const participantIds = await getParticipantIds(message);

  const shuffled = [...participantIds].sort(() => Math.random() - 0.5);
  const winnersList = shuffled.slice(0, Math.min(giveaway.winners, shuffled.length));

  giveaway.status = 'ended';
  giveaway.endedAt = new Date();
  giveaway.winnersList = winnersList;
  giveaway.participantCount = participantIds.length;

  await giveaway.save();
  await refreshGiveawayMessage(giveaway.toObject(), client);

  clearTimeout(giveawayTimers.get(giveaway.id));
  giveawayTimers.delete(giveaway.id);

  if (!message) return;

  const winnerText = winnersList.length > 0
    ? winnersList.map((id) => `<@${id}>`).join(', ')
    : 'No participants joined this giveaway.';

  const resultEmbed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🎉 Giveaway ended')
    .setDescription(`**Prize:** ${giveaway.prize}\n**Winners:** ${winnerText}`);

  await message.channel.send({ embeds: [resultEmbed] });
}

async function getGuildGiveaways(guildId) {
  return Giveaway.find({ guildId }).lean();
}

async function ensureGiveawayExists(giveawayId, guildId) {
  const giveaway = await Giveaway.findOne({ id: giveawayId, guildId }).lean();
  if (!giveaway) {
    throw new Error('Giveaway not found.');
  }

  return giveaway;
}

function buildPermissionReply(interaction) {
  return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'You need administrator permissions or the configured giveaway role to use this command.')], ephemeral: true });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways in this server.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a new giveaway.')
        .addStringOption((option) =>
          option.setName('prize').setDescription('The prize for the giveaway').setRequired(true)
        )
        .addIntegerOption((option) =>
          option.setName('winners').setDescription('How many winners to pick').setRequired(true).setMinValue(1).setMaxValue(10)
        )
        .addStringOption((option) =>
          option.setName('duration').setDescription('How long the giveaway lasts (example: 30m, 2h, 1d)').setRequired(true)
        )
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Where to post the giveaway').addChannelTypes(0, 5)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List giveaways in this server.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Edit an existing giveaway.')
        .addStringOption((option) =>
          option.setName('giveaway_id').setDescription('The giveaway ID').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('prize').setDescription('Update the giveaway prize').setRequired(false)
        )
        .addIntegerOption((option) =>
          option.setName('winners').setDescription('Update the number of winners').setRequired(false).setMinValue(1).setMaxValue(10)
        )
        .addStringOption((option) =>
          option.setName('duration').setDescription('Update how long the giveaway lasts').setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete a giveaway.')
        .addStringOption((option) =>
          option.setName('giveaway_id').setDescription('The giveaway ID').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('info')
        .setDescription('View details about a particular giveaway.')
        .addStringOption((option) =>
          option.setName('giveaway_id').setDescription('The giveaway ID').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reroll')
        .setDescription('Pick a new set of winners for a giveaway.')
        .addStringOption((option) =>
          option.setName('giveaway_id').setDescription('The giveaway ID').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('end')
        .setDescription('End a giveaway early.')
        .addStringOption((option) =>
          option.setName('giveaway_id').setDescription('The giveaway ID').setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This command can only be used inside a server.', ephemeral: true });
    }

    if (!isAllowed(interaction)) {
      return buildPermissionReply(interaction);
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      const prize = interaction.options.getString('prize', true);
      const winners = interaction.options.getInteger('winners', true);
      const duration = interaction.options.getString('duration', true);
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const durationMs = parseDurationToMs(duration);

      if (!durationMs) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Use a duration like 30m, 2h, 1d, or 1w.')], ephemeral: true });
      }

      if (!targetChannel || !targetChannel.isTextBased() || targetChannel.isThread()) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Please choose a valid text channel for the giveaway.')], ephemeral: true });
      }

      const giveaway = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        guildId: interaction.guild.id,
        channelId: targetChannel.id,
        messageId: null,
        prize,
        winners,
        durationMs,
        endAt: Date.now() + durationMs,
        createdAt: Date.now(),
        status: 'active',
        hostedBy: interaction.user.id,
        participantCount: 0,
        winnersList: []
      };

      try {
        const message = await targetChannel.send({
          embeds: [buildGiveawayEmbed(giveaway)]
        });
        await message.react(REACTION_EMOJI);
        giveaway.messageId = message.id;
        giveaway.participantCount = 0;

        await Giveaway.create(giveaway);
        await scheduleGiveawayEnd(giveaway, interaction.client);

        const successEmbed = buildServerEmbed(interaction, 0x57F287, `Giveaway created successfully. ID: ${giveaway.id}`);
        return interaction.reply({ embeds: [successEmbed], ephemeral: true });
      } catch (error) {
        console.error(error);
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'I could not create the giveaway. Please check bot permissions and the target channel.')], ephemeral: true });
      }
    }

    if (subcommand === 'list') {
      const giveaways = await getGuildGiveaways(interaction.guild.id);
      if (giveaways.length === 0) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x5865F2, 'No giveaways found for this server.')], ephemeral: true });
      }

      const fields = giveaways.slice(0, 8).map((giveaway) => ({
        name: `${giveaway.prize} (${giveaway.status})`,
        value: `ID: ${giveaway.id}\nEnds: ${formatTimestamp(giveaway.endAt)}\nWinners: ${giveaway.winners}`
      }));

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎉 Giveaways')
        .setDescription('Current giveaways for this server.')
        .addFields(fields);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'edit') {
      const giveawayId = interaction.options.getString('giveaway_id', true);
      const prize = interaction.options.getString('prize');
      const winners = interaction.options.getInteger('winners');
      const duration = interaction.options.getString('duration');
      const giveaway = await Giveaway.findOne({ id: giveawayId, guildId: interaction.guild.id });

      if (!giveaway) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Giveaway not found.')], ephemeral: true });
      }

      if (giveaway.status === 'ended') {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Completed giveaways cannot be edited.')], ephemeral: true });
      }

      if (prize) giveaway.prize = prize;
      if (winners) giveaway.winners = winners;
      if (duration) {
        const durationMs = parseDurationToMs(duration);
        if (!durationMs) {
          return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Use a duration like 30m, 2h, 1d, or 1w.')], ephemeral: true });
        }
        giveaway.durationMs = durationMs;
        giveaway.endAt = Date.now() + durationMs;
      }

      await giveaway.save();
      await refreshGiveawayMessage(giveaway.toObject(), interaction.client);
      await scheduleGiveawayEnd(giveaway.toObject(), interaction.client);

      return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, 'Giveaway updated successfully.')], ephemeral: true });
    }

    if (subcommand === 'delete') {
      const giveawayId = interaction.options.getString('giveaway_id', true);
      const giveaway = await Giveaway.findOneAndDelete({ id: giveawayId, guildId: interaction.guild.id });

      if (!giveaway) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Giveaway not found.')], ephemeral: true });
      }

      clearTimeout(giveawayTimers.get(giveaway.id));
      giveawayTimers.delete(giveaway.id);

      const message = await getGiveawayMessage(giveaway.toObject ? giveaway.toObject() : giveaway, interaction.client);
      if (message) {
        await message.delete().catch(() => null);
      }

      return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, 'Giveaway deleted successfully.')], ephemeral: true });
    }

    if (subcommand === 'info') {
      const giveawayId = interaction.options.getString('giveaway_id', true);
      const giveaway = await Giveaway.findOne({ id: giveawayId, guildId: interaction.guild.id }).lean();

      if (!giveaway) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Giveaway not found.')], ephemeral: true });
      }

      const participantCount = giveaway.participantCount || 0;
      const infoEmbed = new EmbedBuilder()
        .setColor(giveaway.status === 'ended' ? 0xED4245 : 0x5865F2)
        .setTitle(`Giveaway: ${giveaway.prize}`)
        .setDescription(`ID: ${giveaway.id}`)
        .addFields(
          { name: 'Status', value: giveaway.status.toUpperCase(), inline: true },
          { name: 'Winners', value: `${giveaway.winners}`, inline: true },
          { name: 'Participants', value: `${participantCount}`, inline: true },
          { name: 'Ends', value: formatTimestamp(giveaway.endAt), inline: false },
          { name: 'Hosted by', value: `<@${giveaway.hostedBy}>`, inline: false }
        );

      return interaction.reply({ embeds: [infoEmbed], ephemeral: true });
    }

    if (subcommand === 'reroll') {
      const giveawayId = interaction.options.getString('giveaway_id', true);
      const giveaway = await Giveaway.findOne({ id: giveawayId, guildId: interaction.guild.id });
      if (!giveaway) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Giveaway not found.')], ephemeral: true });
      }

      const message = await getGiveawayMessage(giveaway, interaction.client);
      const participantIds = await getParticipantIds(message);

      if (participantIds.length === 0) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'There are no participants to reroll from.')], ephemeral: true });
      }

      const shuffled = [...participantIds].sort(() => Math.random() - 0.5);
      const winnersList = shuffled.slice(0, Math.min(giveaway.winners, shuffled.length));
      giveaway.winnersList = winnersList;
      await giveaway.save();
      await refreshGiveawayMessage(giveaway.toObject(), interaction.client);

      return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, `Reroll complete. Winners: ${winnersList.map((id) => `<@${id}>`).join(', ')}`)], ephemeral: true });
    }

    if (subcommand === 'end') {
      const giveawayId = interaction.options.getString('giveaway_id', true);
      const giveaway = await Giveaway.findOne({ id: giveawayId, guildId: interaction.guild.id });

      if (!giveaway) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Giveaway not found.')], ephemeral: true });
      }

      if (giveaway.status === 'ended') {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'This giveaway is already ended.')], ephemeral: true });
      }

      await finalizeGiveaway(giveaway.id, interaction.client);
      return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, 'Giveaway ended successfully.')], ephemeral: true });
    }

    return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Unknown giveaway subcommand.')], ephemeral: true });
  },

  async initialize(client) {
    clientInstance = client;

    const activeGiveaways = await Giveaway.find({ status: 'active' }).lean();
    for (const giveaway of activeGiveaways) {
      await scheduleGiveawayEnd(giveaway, client);
    }
  }
};
