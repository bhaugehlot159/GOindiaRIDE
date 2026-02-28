const mongoose = require('mongoose');
const env = require('./env');

async function connectDb() {
  if (!env.mongoUri) {
    throw new Error('MONGO_URI is required to connect to MongoDB');
  }
  await mongoose.connect(env.mongoUri);
}

module.exports = { connectDb };
