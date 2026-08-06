const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const { buildServerEmbed } = require('../../utils/embedHelper');
const Voucher = require('../../models/voucher');

const CODE_LENGTH = 6;
const MAX_FIELDS = 15;
const CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
}

function buildPermissionReply(interaction) {
  return interaction.reply({
    embeds: [buildServerEmbed(interaction, 0xED4245, 'You need administrator permissions to use this command.')]
  });
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function formatUsageHistory(voucher) {
  if (!voucher.uses?.length) {
    return 'Uses: 0';
  }

  const totalUses = voucher.uses.length;
  const recentUses = voucher.uses.slice(-3).map((use) => `• <@${use.userId}> at ${formatTimestamp(use.usedAt)}`);
  return `Uses: ${totalUses}\n${recentUses.join('\n')}`;
}

function normalizeCode(value) {
  return value?.trim().toUpperCase();
}

function generateRandomCode() {
  return Array.from({ length: CODE_LENGTH }, () => CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)]).join('');
}

async function createUniqueCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateRandomCode();
    const exists = await Voucher.exists({ code });
    if (!exists) {
      return code;
    }
  }

  throw new Error('Could not generate a unique voucher code. Please try again.');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voucher')
    .setDescription('Manage server voucher codes.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('generate')
        .setDescription('Generate a new voucher code.')
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Optional description for this voucher')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('use')
        .setDescription('Mark a voucher code as used.')
        .addStringOption((option) =>
          option
            .setName('code')
            .setDescription('The voucher code to use')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List vouchers for this server.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete a voucher code.')
        .addStringOption((option) =>
          option
            .setName('code')
            .setDescription('The voucher code to delete')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This command can only be used inside a server.' });
    }

    if (!isAdmin(interaction)) {
      return buildPermissionReply(interaction);
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const guildVouchers = await Voucher.find({ guildId }).sort({ createdAt: -1 }).lean();

    if (subcommand === 'generate') {
      const description = interaction.options.getString('description') ?? 'No description provided.';
      const code = await createUniqueCode();
      const voucher = await Voucher.create({
        code,
        description,
        guildId,
        createdBy: interaction.user.id
      });

      const embed = buildServerEmbed(interaction, 0x57F287, `Voucher generated successfully.`)
        .addFields(
          { name: 'Code', value: `\`${voucher.code}\``, inline: false },
          { name: 'Description', value: voucher.description, inline: false }
        );

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'use') {
      const codeInput = normalizeCode(interaction.options.getString('code', true));
      const voucher = await Voucher.findOne({ guildId, code: codeInput });

      if (!voucher) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Voucher not found for this server.')] });
      }

      voucher.usedAt = new Date();
      voucher.usedBy = interaction.user.id;
      voucher.uses.push({ userId: interaction.user.id, usedAt: voucher.usedAt });
      await voucher.save();

      const successEmbed = buildServerEmbed(interaction, 0x57F287, `Voucher used successfully.`)
        .addFields(
          { name: 'Code', value: `\`${voucher.code}\``, inline: false },
          { name: 'Description', value: voucher.description, inline: false },
          { name: 'Used by', value: `<@${voucher.usedBy}>`, inline: false },
          { name: 'Usage count', value: `${voucher.uses.length}`, inline: false }
        );

      return interaction.reply({ embeds: [successEmbed] });
    }

    if (subcommand === 'list') {
      if (guildVouchers.length === 0) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x5865F2, 'No vouchers found for this server.')] });
      }

      const fields = guildVouchers.slice(0, MAX_FIELDS).map((voucher) => ({
        name: `${voucher.code} — ${voucher.uses?.length ? `Used ${voucher.uses.length} time${voucher.uses.length === 1 ? '' : 's'}` : 'Active'}`,
        value: `Description: ${voucher.description}\nCreated by: <@${voucher.createdBy}>${voucher.uses?.length ? `\n${formatUsageHistory(voucher)}` : ''}`,
        inline: false
      }));

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Voucher codes')
        .setDescription(`Showing ${fields.length} of ${guildVouchers.length} vouchers.`)
        .addFields(fields);

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'delete') {
      const codeInput = normalizeCode(interaction.options.getString('code', true));
      const deleted = await Voucher.findOneAndDelete({ guildId, code: codeInput });

      if (!deleted) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Voucher not found for this server.')] });
      }

      return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, `Voucher ${codeInput} deleted successfully.`)] });
    }

    return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Unknown voucher subcommand.')] });
  }
};
