const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/recipe-sharing');
  } catch (error) {
    process.exit(1);
  }
};

module.exports = connectDB;
