const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

const currencySymbols = {
  Dollar: '$',
  Euro: '€',
  INR: '₹',
  MYR: 'RM',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bill')
    .setDescription('Generate a bill with customer details.')
    .addUserOption(option =>
      option
        .setName('customer')
        .setDescription('Select the customer.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('order')
        .setDescription('Items ordered.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('price')
        .setDescription('Price of the order.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('discount')
        .setDescription('Discount applied.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('grand_total')
        .setDescription('Grand total of the bill.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('currency')
        .setDescription('Choose the currency.')
        .setRequired(true)
        .addChoices({ name: 'Dollar', value: 'Dollar' },
                    { name: 'Euro', value: 'Euro' },
                    { name: 'INR', value: 'INR' },
                    { name: 'MYR', value: 'MYR' })
    ),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ADMINISTRATOR)) {
        return await interaction.followUp({ content: 'You need admin permissions to use this command.', ephemeral: true });
      }

      const customer = interaction.options.getMember('customer');
      const order = interaction.options.getString('order');
      const price = interaction.options.getString('price');
      const discount = interaction.options.getString('discount');
      const grandTotal = interaction.options.getString('grand_total');
      const currency = interaction.options.getString('currency');
      const currencySymbol = currencySymbols[currency] || '';

      const customerName = customer.displayName && customer.displayName.length <= 6
        ? customer.displayName
        : customer.displayName && customer.displayName.length > 6 && customer.displayName.length < 15
        ? customer.displayName
        : 'Anonymous';

      const canvas = createCanvas(402, 752);
      const ctx = canvas.getContext('2d');

      const background = await loadImage('https://cdn.discordapp.com/attachments/916149747180511294/983757661348704276/DW_receipt.png?ex=6602ecb7&is=65f077b7&hm=c715fd632bab116edf744e3f126363264e8936dcd50c3ca9d3329fdb89c9b620&');
      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      ctx.font = '30px Comic Sans MS';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';

      ctx.fillText(`${currencySymbol} ${grandTotal}`, 227, 641);
      ctx.fillText(discount, 262, 518);
      ctx.fillText(`${currencySymbol} ${price}`, 235, 395);

      if (order.length < 10) {
        ctx.fillText(order, 252, 269);
      } else if (order.length > 10 && order.length < 15) {
        ctx.fillText(order, 275, 320);
      } else {
        ctx.fillText(order, 185, 320);
      }

      if (customerName !== 'Anonymous') {
        if (customerName.length < 6) {
          ctx.fillText(customerName, 280, 148);
        } else if (customerName.length > 6 && customerName.length < 15) {
          ctx.fillText(customerName, 255, 190);
        } else {
          ctx.fillText(customerName, 185, 190);
        }
      }

      const attachment = new AttachmentBuilder(canvas.toBuffer(), 'bill.png');

      const replyEmbed = {
        files: [attachment]
      };

      await interaction.followUp(replyEmbed);
    } catch (error) {
      console.error('Error executing /bill command:', error);
      await interaction.followUp({ content: 'An error occurred while executing this command.', ephemeral: true });
    }
  },
};
