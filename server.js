const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/QuoteBot')
  .then(() => console.log('WebApp successfully connected to MongoDB'))
  .catch(err => console.error('WebApp MongoDB connection error:', err));

// Schemas & Models (Matching the bot's schemas)
const Group = mongoose.models.Group || mongoose.model('Group', new mongoose.Schema({
  group_id: Number,
  title: String,
  username: String,
  settings: {
    hidden: { type: Boolean, default: true },
    privacy: { type: Boolean, default: false }
  }
}));

const GroupMember = mongoose.models.GroupMember || mongoose.model('GroupMember', new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  telegram_id: Number
}));

const Quote = mongoose.models.Quote || mongoose.model('Quote', new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  file_id: String,
  payload: mongoose.Schema.Types.Mixed,
  authors: Array,
  rate: {
    score: Number
  },
  forgottenAt: Date
}, { timestamps: true }));

// Telegram initData verification helper
function verifyTelegramWebappData(initData, botToken) {
  if (!initData || !botToken) return false;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;

    // Sort params alphabetically
    const keys = Array.from(params.keys()).filter(key => key !== 'hash').sort();
    const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');

    // Generate secret key
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    // Compute check hash
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return computedHash === hash;
  } catch (err) {
    console.error('Auth verification error:', err);
    return false;
  }
}

// Authentication middleware
const authMiddleware = (req, res, next) => {
  const initData = req.headers['authorization'] || req.query.initData;
  const botToken = process.env.BOT_TOKEN;

  if (!initData || !verifyTelegramWebappData(initData, botToken)) {
    return res.status(401).json({ error: 'Unauthorized. Invalid Telegram initData.' });
  }

  // Parse user from initData
  try {
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (userStr) {
      req.user = JSON.parse(userStr);
    }
  } catch (err) {
    console.error('Error parsing user from initData:', err);
  }

  next();
};

// API: Get user's groups
app.get('/api/groups', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(400).json({ error: 'User ID is missing in initData' });
    }

    const userId = req.user.id;

    // Find all group relationships for this user
    const memberships = await GroupMember.find({ telegram_id: userId }).populate('group');
    
    // Filter and map to simple group list
    const groups = memberships
      .filter(m => m.group)
      .map(m => ({
        id: m.group._id,
        telegramId: m.group.group_id,
        title: m.group.title,
        username: m.group.username,
        settings: m.group.settings
      }));

    res.json(groups);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// API: Get quotes of a group
app.get('/api/groups/:groupId/quotes', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Security check: Verify if the user is indeed a member of this group
    const membership = await GroupMember.findOne({ group: groupId, telegram_id: userId });
    if (!membership) {
      // Also check if group is public/not hidden to be more permissive, but default is secure
      const groupObj = await Group.findById(groupId);
      if (!groupObj) {
        return res.status(404).json({ error: 'Group not found' });
      }
      if (groupObj.settings && groupObj.settings.hidden) {
        return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
      }
    }

    // Find quotes that have a valid payload (renderable quotes) and are not forgotten
    const quotes = await Quote.find({
      group: groupId,
      payload: { $exists: true },
      forgottenAt: { $exists: false }
    })
    .sort({ createdAt: -1 })
    .limit(100); // Limit to latest 100 quotes

    res.json(quotes);
  } catch (err) {
    console.error('Error fetching quotes:', err);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

app.listen(PORT, () => {
  console.log(`WebApp server running on port ${PORT}`);
});
