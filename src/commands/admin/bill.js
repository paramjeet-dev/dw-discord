const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');

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
        .addChoices(
          { name: 'Dollar', value: 'Dollar' },
          { name: 'Euro', value: 'Euro' },
          { name: 'INR', value: 'INR' },
          { name: 'MYR', value: 'MYR' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      // Check administrator permission
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.Administrator
        )
      ) {
        return await interaction.editReply({
          content: 'You need admin permissions to use this command.',
        });
      }

      // Get command options
      const customer = interaction.options.getMember('customer');
      const order = interaction.options.getString('order');
      const price = interaction.options.getString('price');
      const discount = interaction.options.getString('discount');
      const grandTotal = interaction.options.getString('grand_total');
      const currency = interaction.options.getString('currency');

      const currencySymbol = currencySymbols[currency] || '';

      // Get customer display name
      const customerName =
        customer && customer.displayName
          ? customer.displayName
          : 'Anonymous';

      // Create canvas
      const canvas = createCanvas(402, 752);
      const ctx = canvas.getContext('2d');

      // Load local bill background image
      const backgroundPath = path.join(
        __dirname,
        '../../assets/bill.png'
      );

      const background = await loadImage(backgroundPath);

      // Draw background
      ctx.drawImage(
        background,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Text settings
      ctx.font = '30px Comic Sans MS';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';

      // Grand total
      ctx.fillText(
        `${currencySymbol} ${grandTotal}`,
        227,
        641
      );

      // Discount
      ctx.fillText(
        discount,
        262,
        518
      );

      // Price
      ctx.fillText(
        `${currencySymbol} ${price}`,
        235,
        395
      );

      // Order
      if (order.length < 10) {
        ctx.fillText(order, 252, 269);
      } else if (order.length >= 10 && order.length < 15) {
        ctx.fillText(order, 275, 320);
      } else {
        ctx.fillText(order, 185, 320);
      }

      // Customer name
      if (customerName !== 'Anonymous') {
        if (customerName.length < 6) {
          ctx.fillText(customerName, 280, 148);
        } else if (
          customerName.length >= 6 &&
          customerName.length < 15
        ) {
          ctx.fillText(customerName, 255, 190);
        } else {
          ctx.fillText(customerName, 185, 190);
        }
      }

      // Create attachment
      const attachment = new AttachmentBuilder(
        canvas.toBuffer('image/png'),
        {
          name: 'bill.png',
        }
      );

      // Send bill
      await interaction.editReply({
        files: [attachment],
      });

    } catch (error) {
      console.error('Error executing /bill command:', error);

      await interaction.editReply({
        content:
          'An error occurred while generating the bill. Please check the bot console for details.',
      });
    }
  },
};