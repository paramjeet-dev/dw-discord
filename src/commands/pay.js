const { SlashCommandBuilder } = require('@discordjs/builders');

const paypalLinks = {
  Tanki: 'https://www.paypal.me/WaiiHiinNg',
  Beast: 'https://www.paypal.me/ParamjeetAhlawat',
  Ninja: 'https://paypal.me/GiriPrasad216?locale.x=en_GB&country.x=IN'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Place a payment order.')
    .addStringOption(option =>
      option
        .setName('order')
        .setDescription('Items ordered.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('cost')
        .setDescription('Price of the order.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('user')
        .setDescription('Choose the user for payment.')
        .setRequired(true)
        .addChoices({ name: 'Tanki', value: 'Tanki' },
                    { name: 'Beast', value: 'Beast' },
                    { name: 'Ninja', value: 'Ninja' })
    ),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const order = interaction.options.getString('order');
      const cost = interaction.options.getString('cost');
      const user = interaction.options.getString('user');
      const paypalLink = paypalLinks[user];

      const response = `As per our company policy, payment has to be done 1st before we can deliver the product.\n\nItems ordered: ${order}\n\nPrice: ${cost}\n\nPlease send the payment to:\n[PayPal](${paypalLink})\n\nDrop us a screenshot after sending, thanks.\n\nRegards,\nDesign Wonderland Management`;

      await interaction.followUp({ content: response });
    } catch (error) {
      console.error('Error executing /pay command:', error);
      await interaction.followUp({ content: 'An error occurred while executing this command.', ephemeral: true });
    }
  },
};
