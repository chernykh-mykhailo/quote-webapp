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

// Schemas & Models
const Group = mongoose.models.Group || mongoose.model('Group', new mongoose.Schema({
  group_id: Number,
  title: String,
  username: String,
  memberCount: Number,
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
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  file_id: String,
  payload: mongoose.Schema.Types.Mixed,
  authors: [{
    telegram_id: Number,
    first_name: String,
    last_name: String,
    username: String,
    title: String,
    name: String
  }],
  rate: {
    votes: [{
      telegram_id: Number,
      voteType: String // "up" or "down"
    }],
    score: { type: Number, default: 0 }
  },
  local_id: Number,
  forgottenAt: Date
}, { timestamps: true }));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  telegram_id: Number,
  first_name: String,
  last_name: String,
  username: String
}));

// Telegram initData verification helper
function verifyTelegramWebappData(initData, botToken) {
  if (!initData || !botToken) return false;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;

    const keys = Array.from(params.keys()).filter(key => key !== 'hash').sort();
    const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
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

  const isLocalDev = window => false; // Dummy check
  const host = req.get('host') || '';
  const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1');

  if (isLocalHost && !initData) {
    req.user = { id: 8512337917, first_name: 'DevUser' };
    return next();
  }

  if (!initData || !verifyTelegramWebappData(initData, botToken)) {
    return res.status(401).json({ error: 'Unauthorized. Invalid Telegram initData.' });
  }

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
    const userId = req.user.id;
    const memberships = await GroupMember.find({ telegram_id: userId }).populate('group');
    
    const groups = [];
    for (const m of memberships) {
      if (!m.group) continue;
      // Get quote count for this group
      const quoteCount = await Quote.countDocuments({ group: m.group._id, forgottenAt: { $exists: false } });
      groups.push({
        id: m.group._id,
        telegramId: m.group.group_id,
        title: m.group.title,
        username: m.group.username,
        memberCount: m.group.memberCount || 0,
        quoteCount,
        settings: m.group.settings
      });
    }

    res.json(groups);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// API: Get quotes of a group (supporting search, sorting tabs, and date filters)
app.get('/api/groups/:groupId/quotes', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { sort = 'new', topRange = 'all', search = '' } = req.query;

    const membership = await GroupMember.findOne({ group: groupId, telegram_id: userId });
    if (!membership) {
      const groupObj = await Group.findById(groupId);
      if (!groupObj) return res.status(404).json({ error: 'Group not found' });
      if (groupObj.settings && groupObj.settings.hidden) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    let filter = { group: groupId, forgottenAt: { $exists: false } };

    // Search filter
    if (search) {
      filter['payload.messages.text'] = new RegExp(search, 'i');
    }

    // Top Range date filter
    if (sort === 'top' && topRange !== 'all') {
      const now = new Date();
      let dateLimit = new Date();
      if (topRange === 'day') dateLimit.setDate(now.getDate() - 1);
      else if (topRange === 'week') dateLimit.setDate(now.getDate() - 7);
      else if (topRange === 'month') dateLimit.setDate(now.getDate() - 30);
      else if (topRange === 'year') dateLimit.setDate(now.getDate() - 365);
      
      filter.createdAt = { $gte: dateLimit };
    }

    // Query builder
    let query = Quote.find(filter).populate('user');

    if (sort === 'new') {
      query = query.sort({ createdAt: -1 });
    } else if (sort === 'top') {
      query = query.sort({ 'rate.score': -1, createdAt: -1 });
    } else if (sort === 'random') {
      // Pick random
      const count = await Quote.countDocuments(filter);
      const randomSkip = Math.floor(Math.random() * Math.max(1, count - 50));
      query = query.skip(randomSkip);
    }

    const quotes = await query.limit(50);
    res.json(quotes);
  } catch (err) {
    console.error('Error fetching quotes:', err);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// API: Get a single quote details (with more from author / group)
app.get('/api/quotes/:quoteId', authMiddleware, async (req, res) => {
  try {
    const { quoteId } = req.params;
    const quote = await Quote.findById(quoteId).populate('user');
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    // Fetch more from author
    let moreFromAuthor = [];
    if (quote.authors && quote.authors.length > 0) {
      const authorId = quote.authors[0].telegram_id;
      moreFromAuthor = await Quote.find({
        group: quote.group,
        _id: { $ne: quote._id },
        'authors.telegram_id': authorId,
        forgottenAt: { $exists: false }
      })
      .sort({ createdAt: -1 })
      .limit(10);
    }

    // Fetch more from group
    const moreFromGroup = await Quote.find({
      group: quote.group,
      _id: { $ne: quote._id },
      forgottenAt: { $exists: false }
    })
    .sort({ createdAt: -1 })
    .limit(10);

    res.json({
      quote,
      moreFromAuthor,
      moreFromGroup
    });
  } catch (err) {
    console.error('Error fetching quote details:', err);
    res.status(500).json({ error: 'Failed to fetch details' });
  }
});

// API: Vote on a quote
app.post('/api/quotes/:quoteId/vote', authMiddleware, async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { voteType } = req.body; // "up" or "down"
    const userId = req.user.id;

    if (!['up', 'down'].includes(voteType)) {
      return res.status(400).json({ error: 'Invalid voteType' });
    }

    const quote = await Quote.findById(quoteId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    if (!quote.rate) {
      quote.rate = { votes: [], score: 0 };
    }

    // Check if already voted
    const existingVoteIndex = quote.rate.votes.findIndex(v => v.telegram_id === userId);
    
    let scoreDiff = 0;
    if (existingVoteIndex > -1) {
      const existingVote = quote.rate.votes[existingVoteIndex];
      if (existingVote.voteType === voteType) {
        // Double tap: remove vote
        scoreDiff = voteType === 'up' ? -1 : 1;
        quote.rate.votes.splice(existingVoteIndex, 1);
      } else {
        // Change vote
        scoreDiff = voteType === 'up' ? 2 : -2;
        existingVote.voteType = voteType;
      }
    } else {
      // New vote
      scoreDiff = voteType === 'up' ? 1 : -1;
      quote.rate.votes.push({ telegram_id: userId, voteType });
    }

    quote.rate.score = (quote.rate.score || 0) + scoreDiff;
    await quote.save();

    res.json({ score: quote.rate.score, votes: quote.rate.votes });
  } catch (err) {
    console.error('Error voting:', err);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

app.listen(PORT, () => {
  console.log(`WebApp server running on port ${PORT}`);
});
