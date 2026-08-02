const { SlashCommandBuilder, PermissionsBitField, ModalBuilder, TextInputBuilder, ActionRowBuilder, ChannelType, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const TicketConfig = require('../../models/ticketConfig');
const { buildServerEmbed } = require('../../utils/embedHelper');

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
}

function buildPermissionReply(interaction) {
  return interaction.reply({
    embeds: [buildServerEmbed(interaction, 0xED4245, 'You need administrator permissions to use this command.')],
    ephemeral: true
  });
}

function buildSetupModal(panelChannelId, categoryId) {
  const modal = new ModalBuilder()
    .setCustomId(`ticketSetupModal:${panelChannelId}:${categoryId}`)
    .setTitle('Ticket module setup');

  const panelMessageInput = new TextInputBuilder()
    .setCustomId('panelMessage')
    .setLabel('Ticket panel message')
    .setStyle(2)
    .setRequired(true)
    .setPlaceholder('Example: Open a ticket for help or support');

  const openingMessageInput = new TextInputBuilder()
    .setCustomId('openingMessage')
    .setLabel('Ticket opening message')
    .setStyle(2)
    .setRequired(true)
    .setPlaceholder('Example: Your ticket has been opened. Please wait for staff.');

  const optionOneInput = new TextInputBuilder()
    .setCustomId('optionOne')
    .setLabel('Option 1 label + description')
    .setStyle(2)
    .setRequired(true)
    .setPlaceholder('Claim a prize | Use this to claim a prize');

  const optionTwoInput = new TextInputBuilder()
    .setCustomId('optionTwo')
    .setLabel('Option 2 label + description')
    .setStyle(2)
    .setRequired(true)
    .setPlaceholder('Query | Use this for general questions');

  const optionThreeInput = new TextInputBuilder()
    .setCustomId('optionThree')
    .setLabel('Option 3 label + description')
    .setStyle(2)
    .setRequired(false)
    .setPlaceholder('Optional: Feedback | Use this to share feedback');

  modal.addComponents(
    new ActionRowBuilder().addComponents(panelMessageInput),
    new ActionRowBuilder().addComponents(openingMessageInput),
    new ActionRowBuilder().addComponents(optionOneInput),
    new ActionRowBuilder().addComponents(optionTwoInput),
    new ActionRowBuilder().addComponents(optionThreeInput)
  );

  return modal;
}

function parseOptionInput(input, fallbackValue) {
  const [label, description] = input.split('|').map((part) => part.trim());
  if (!label || !description) {
    return { label: fallbackValue, description: input.trim(), value: fallbackValue.toLowerCase().replace(/\s+/g, '-') };
  }
  return { label, description, value: label.toLowerCase().replace(/\s+/g, '-') };
}

function buildTicketPanelEmbed(config) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎫 Ticket Support')
    .setDescription(config.panelMessage)
    .setFooter({ text: 'Select a reason to open a ticket.' });
}

function buildTicketSelect(config) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticketOpenSelect')
      .setPlaceholder('Open a ticket...')
      .addOptions(config.options.map((option) => ({
        label: option.label,
        description: option.description,
        value: option.value
      })))
  );
}

async function ensureCategory(channel) {
  if (!channel || channel.type !== ChannelType.GuildCategory) {
    return null;
  }
  return channel;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Configure the ticketing system for this server.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Setup ticket panel and ticket options.')
        .addChannelOption((option) =>
          option
            .setName('panel_channel')
            .setDescription('Channel where the ticket panel will be posted')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Category for newly opened ticket channels')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildCategory)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Show current ticket configuration.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disable ticketing for this server.')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This command can only be used inside a server.', ephemeral: true });
    }

    if (!isAdmin(interaction)) {
      return buildPermissionReply(interaction);
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const panelChannel = interaction.options.getChannel('panel_channel', true);
      const categoryChannel = interaction.options.getChannel('category', true);
      return interaction.showModal(buildSetupModal(panelChannel.id, categoryChannel.id));
    }

    if (subcommand === 'status') {
      const config = await TicketConfig.findOne({ guildId: interaction.guild.id }).lean();
      if (!config) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x5865F2, 'Ticket module is not configured for this server.')], ephemeral: true });
      }

      const statusEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Ticket configuration')
        .addFields(
          { name: 'Panel channel', value: `<#${config.panelChannelId}>`, inline: true },
          { name: 'Category', value: `<#${config.ticketCategoryId}>`, inline: true },
          { name: 'Panel message', value: config.panelMessage || 'None', inline: false },
          { name: 'Opening message', value: config.openingMessage || 'None', inline: false },
          { name: 'Options', value: config.options.map((option) => `• ${option.label}: ${option.description}`).join('\n'), inline: false }
        );

      return interaction.reply({ embeds: [statusEmbed], ephemeral: true });
    }

    if (subcommand === 'disable') {
      const deleted = await TicketConfig.findOneAndDelete({ guildId: interaction.guild.id });
      if (!deleted) {
        return interaction.reply({ embeds: [buildServerEmbed(interaction, 0xED4245, 'Ticket module was not configured.')], ephemeral: true });
      }

      return interaction.reply({ embeds: [buildServerEmbed(interaction, 0x57F287, 'Ticket module disabled successfully.')], ephemeral: true });
    }

    return interaction.reply({ content: 'Unknown ticket subcommand.', ephemeral: true });
  }
};
