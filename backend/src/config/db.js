const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

async function connectDb() {
  if (!env.mongoUri) {
    throw new Error('MONGO_URI is required to connect to MongoDB');
  }

  await mongoose.connect(env.mongoUri, {
    autoIndex: true,
    maxPoolSize: 10
  });
}

module.exports = { connectDb };
