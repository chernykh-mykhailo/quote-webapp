const mongoose = require('mongoose');
require('dotenv').config({ path: '../quote-bot/.env' });

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/QuoteBot')
  .then(async () => {
    console.log('Connected');
    const Quote = mongoose.model('Quote', new mongoose.Schema({}, { strict: false }));
    const quotes = await Quote.find().sort({ createdAt: -1 }).limit(3);
    console.log(JSON.stringify(quotes, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
