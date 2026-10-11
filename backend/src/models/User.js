const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Do not return passwordHash in queries by default
    },
    profileImage: {
      type: String,
      default: null,
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'light',
      },
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      batteryAlerts: {
        type: Boolean,
        default: true,
      },
      analysisNotifications: {
        type: Boolean,
        default: true,
      },
      dataQualityAlerts: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    collection: 'users',
    timestamps: true,
  }
);

// Indexes handled by unique: true on email

const User = mongoose.model('User', userSchema);

module.exports = User;
