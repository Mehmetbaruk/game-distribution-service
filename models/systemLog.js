const mongoose = require('mongoose');

/**
 * System Log Schema
 * Tracks platform activities for AI analysis and admin reporting
 */
const systemLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  level: {
    type: String,
    enum: ['info', 'warning', 'error', 'success'],
    default: 'info',
    required: true
  },
  category: {
    type: String,
    enum: ['user', 'game', 'auth', 'admin', 'system', 'ai'],
    default: 'system',
    required: true
  },
  action: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for quick queries
systemLogSchema.index({ timestamp: -1 });
systemLogSchema.index({ level: 1 });
systemLogSchema.index({ category: 1 });
systemLogSchema.index({ userId: 1 });
systemLogSchema.index({ gameId: 1 });

// Export the model
const SystemLog = mongoose.model('SystemLog', systemLogSchema);
module.exports = SystemLog;