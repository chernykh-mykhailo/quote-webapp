// Initialize Telegram WebApp SDK
const tg = window.Telegram.WebApp;

// DOM Screens
const loadingScreen = document.getElementById('loading-screen');
const errorScreen = document.getElementById('error-screen');
const errorMessage = document.getElementById('error-message');
const groupsScreen = document.getElementById('groups-screen');
const feedScreen = document.getElementById('feed-screen');
const detailScreen = document.getElementById('detail-screen');

// Header Elements
const backBtn = document.getElementById('back-btn');
const groupTitle = document.getElementById('group-title');
const groupSubtitle = document.getElementById('group-subtitle');
const themeBadge = document.getElementById('theme-badge');

// Lists & Container Elements
const groupsList = document.getElementById('groups-list');
const emptyGroups = document.getElementById('empty-groups');
const feedList = document.getElementById('feed-list');
const emptyFeed = document.getElementById('empty-feed');
const detailBubbleContent = document.getElementById('detail-bubble-content');
const moreAuthorSlider = document.getElementById('more-author-slider');
const moreGroupSlider = document.getElementById('more-group-slider');

// Input & Navigation Tabs
const searchInput = document.getElementById('search-input');
const tabButtons = document.querySelectorAll('.tab-btn');
const dateSubtabsContainer = document.getElementById('date-subtabs');
const subtabButtons = document.querySelectorAll('.subtab-btn');

// Detail Page Metadata & Actions
const metaAuthor = document.getElementById('meta-author');
const metaQuotedBy = document.getElementById('meta-quotedby');
const metaPublished = document.getElementById('meta-published');
const metaReactions = document.getElementById('meta-reactions');
const detailVoteUp = document.getElementById('detail-vote-up');
const detailVoteUpCount = document.getElementById('detail-vote-up-count');
const detailVoteDown = document.getElementById('detail-vote-down');
const detailVoteDownCount = document.getElementById('detail-vote-down-count');
const originalBtn = document.getElementById('original-btn');
const allAuthorQuotesBtn = document.getElementById('all-author-quotes-btn');
const allGroupQuotesBtn = document.getElementById('all-group-quotes-btn');

// State Manager
let currentScreen = 'groups'; // 'groups', 'feed', 'detail'
let groupsData = [];
let currentGroup = null;
let currentQuoteDetails = null;

// Query States
let searchFilter = '';
let activeSort = 'top'; // 'top', 'new', 'random'
let activeRange = 'week'; // 'day', 'week', 'month', 'year', 'all'
let searchTimeout = null;

// Setup Telegram SDK
tg.ready();
tg.expand();

// Apply Telegram theme colors dynamically
function applyTheme() {
  const theme = tg.colorScheme || 'dark';
  document.body.className = `${theme}-theme`;
  themeBadge.textContent = `Theme: ${theme.toUpperCase()}`;
}
applyTheme();
tg.onEvent('themeChanged', applyTheme);

// Handle Back Button
backBtn.addEventListener('click', () => {
  if (currentScreen === 'detail') {
    showScreen('feed');
  } else if (currentScreen === 'feed') {
    showScreen('groups');
  }
});

// Switch screens helper
function showScreen(screen) {
  currentScreen = screen;
  
  if (screen === 'groups') {
    groupsScreen.classList.remove('hidden');
    feedScreen.classList.add('hidden');
    detailScreen.classList.add('hidden');
    backBtn.classList.add('hidden');
    groupTitle.textContent = 'Quotly';
    groupSubtitle.textContent = 'Select a group to view quotes';
    currentGroup = null;
  } else if (screen === 'feed') {
    groupsScreen.classList.add('hidden');
    feedScreen.classList.remove('hidden');
    detailScreen.classList.add('hidden');
    backBtn.classList.remove('hidden');
    if (currentGroup) {
      groupTitle.textContent = currentGroup.title;
      groupSubtitle.textContent = `${currentGroup.quoteCount || 0} quotes · ${currentGroup.memberCount || 0} members`;
    }
  } else if (screen === 'detail') {
    groupsScreen.classList.add('hidden');
    feedScreen.classList.add('hidden');
    detailScreen.classList.remove('hidden');
    backBtn.classList.remove('hidden');
  }
}

// Generate beautiful avatar gradients
function getAvatarColor(name, id) {
  let hash = 0;
  const seed = name + (id || '');
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `linear-gradient(135deg, hsl(${h}, 70%, 55%) 0%, hsl(${(h + 40) % 360}, 75%, 45%) 100%)`;
}

// Get initials
function getInitials(title) {
  if (!title) return '?';
  return title
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0))
    .slice(0, 2)
    .join('');
}

// Get user avatar URL or fallback
function getUserAvatarHtml(author) {
  const initials = getInitials(author.name || author.first_name || author.title);
  const color = getAvatarColor(author.name || author.first_name || '', author.telegram_id);

  if (author.username) {
    // Fetch Telegram web avatar redirector
    const userpicUrl = `https://t.me/i/userpic/320/${author.username}.jpg`;
    return `
      <div class="avatar" style="background: ${color}">
        <img src="${userpicUrl}" class="avatar-img" onerror="this.style.display='none'" alt="">
        <span class="avatar-initials">${initials}</span>
      </div>
    `;
  }
  
  return `<div class="avatar" style="background: ${color}">${initials}</div>`;
}

// Format date
function formatDate(dateStr, formatStyle = 'short') {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  
  if (formatStyle === 'full') {
    return date.toLocaleDateString(undefined, { 
      day: 'numeric',
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
  
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric'
  });
}

// Escape HTML utility
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Parse Search Param or InitData
function getInitDataQuery() {
  const initData = tg.initData;
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocalDev ? 'initData=mock_data' : `initData=${encodeURIComponent(initData)}`;
}

// App Initialization
async function init() {
  const initData = tg.initData;
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (!initData && !isLocalDev) {
    loadingScreen.classList.add('hidden');
    errorScreen.classList.remove('hidden');
    errorMessage.textContent = 'Please open this application from within Telegram.';
    return;
  }

  // Load groups
  try {
    const response = await fetch(`/api/groups?${getInitDataQuery()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    groupsData = await response.json();
    loadingScreen.classList.add('hidden');
    
    renderGroups(groupsData);
    
    // Automatically open group if start_param contains a group ID
    const startParam = tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    if (startParam) {
      handleStartParam(startParam);
    }
  } catch (err) {
    console.error('Error fetching groups:', err);
    loadingScreen.classList.add('hidden');
    errorScreen.classList.remove('hidden');
    errorMessage.textContent = 'Failed to load database groups.';
  }
}

function handleStartParam(param) {
  if (param.startsWith('g_')) {
    const groupId = param.substring(2);
    const matchedGroup = groupsData.find(g => g.id === groupId || String(g.telegramId) === groupId);
    if (matchedGroup) loadGroupFeed(matchedGroup);
  } else if (param.startsWith('q_')) {
    const match = param.match(/^q_(\d+)_g_([0-9a-fA-F]+)$/);
    if (match) {
      const localId = match[1];
      const groupId = match[2];
      const matchedGroup = groupsData.find(g => g.id === groupId || String(g.telegramId) === groupId);
      if (matchedGroup) currentGroup = matchedGroup;
      openQuoteDetail(localId, groupId);
    }
  }
}

// Render groups
function renderGroups(groups) {
  groupsList.innerHTML = '';
  if (!groups || groups.length === 0) {
    emptyGroups.classList.remove('hidden');
    return;
  }

  emptyGroups.classList.add('hidden');
  showScreen('groups');

  groups.forEach(group => {
    const item = document.createElement('div');
    item.className = 'group-item';
    
    const initials = getInitials(group.title);
    const color = getAvatarColor(group.title, group.id);
    
    item.innerHTML = `
      <div class="group-details">
        <div class="avatar" style="background: ${color}">${initials}</div>
        <div>
          <div class="group-name">${escapeHtml(group.title)}</div>
          <div class="group-username">${group.quoteCount} quotes · ${group.username ? '@' + group.username : 'Private group'}</div>
        </div>
      </div>
      <div class="arrow-icon">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/></svg>
      </div>
    `;
    
    item.addEventListener('click', () => loadGroupFeed(group));
    groupsList.appendChild(item);
  });
}

// Load quotes feed
async function loadGroupFeed(group) {
  currentGroup = group;
  showScreen('feed');
  fetchGroupQuotes();
}

// Fetch quotes from server
async function fetchGroupQuotes() {
  if (!currentGroup) return;

  feedList.innerHTML = '<div style="margin: 30px auto;" class="spinner"></div>';
  emptyFeed.classList.add('hidden');

  try {
    const url = `/api/groups/${currentGroup.id}/quotes?sort=${activeSort}&topRange=${activeRange}&search=${encodeURIComponent(searchFilter)}&${getInitDataQuery()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('API error');
    
    const quotes = await response.json();
    renderFeed(quotes);
  } catch (err) {
    console.error(err);
    feedList.innerHTML = '';
    emptyFeed.classList.remove('hidden');
  }
}

// Render quotes feed list
function renderFeed(quotes) {
  feedList.innerHTML = '';
  
  if (!quotes || quotes.length === 0) {
    emptyFeed.classList.remove('hidden');
    return;
  }
  
  emptyFeed.classList.add('hidden');

  quotes.forEach((quote, index) => {
    const item = document.createElement('div');
    item.className = 'feed-quote-item';
    
    const score = quote.rate && quote.rate.score != null ? quote.rate.score : 0;
    
    // Get quote preview text
    let previewText = '';
    let authorName = 'User';
    let authorObj = null;

    if (quote.payload && quote.payload.messages && quote.payload.messages.length > 0) {
      const firstMsg = quote.payload.messages[0];
      previewText = firstMsg.text || '[Sticker/Media]';
      if (firstMsg.from) {
        authorName = firstMsg.from.name || firstMsg.from.first_name || 'User';
        authorObj = firstMsg.from;
      }
    } else if (quote.authors && quote.authors.length > 0) {
      authorName = quote.authors[0].name || quote.authors[0].first_name || 'User';
      authorObj = quote.authors[0];
    }

    const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
    const avatarHtml = authorObj ? getUserAvatarHtml(authorObj) : `<div class="avatar" style="background: ${getAvatarColor(authorName)}">${getInitials(authorName)}</div>`;

    item.innerHTML = `
      <div class="rank-badge ${rankClass}">${index + 1}</div>
      ${avatarHtml}
      <div class="feed-item-content">
        <div class="feed-item-header">
          <div class="feed-author-name">${escapeHtml(authorName)}</div>
          <div class="badge">#${quote.local_id || index + 1}</div>
        </div>
        <div class="feed-quote-preview">${escapeHtml(previewText)}</div>
        <div class="feed-item-footer">
          <span>${formatDate(quote.createdAt)}</span>
          <span class="score-tag ${score >= 0 ? 'up' : 'down'}">${score >= 0 ? '↑' : '↓'} ${Math.abs(score)}</span>
        </div>
      </div>
    `;
    
    item.addEventListener('click', () => openQuoteDetail(quote._id));
    feedList.appendChild(item);
  });
}

// Open detailed quote screen
async function openQuoteDetail(quoteId, groupId = null) {
  showScreen('detail');
  detailBubbleContent.innerHTML = '<div style="margin: 30px auto;" class="spinner"></div>';
  
  // Reset vote button highlight
  detailVoteUp.className = 'vote-action-btn up';
  detailVoteDown.className = 'vote-action-btn down';

  try {
    const url = groupId 
      ? `/api/groups/${groupId}/quotes/local/${quoteId}?${getInitDataQuery()}`
      : `/api/quotes/${quoteId}?${getInitDataQuery()}`;
      
    const response = await fetch(url);
    if (!response.ok) throw new Error('Details fetch failed');
    
    currentQuoteDetails = await response.json();
    renderQuoteDetails(currentQuoteDetails);
  } catch (err) {
    console.error(err);
    detailBubbleContent.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Failed to load quote details</h3><p>Ensure the quote is still available and not forgotten.</p></div>';
  }
}

// Render Quote Details screen
function renderQuoteDetails(data) {
  const { quote, moreFromAuthor, moreFromGroup } = data;
  
  groupTitle.textContent = currentGroup ? currentGroup.title : 'Quotly';
  groupSubtitle.textContent = `#${quote.local_id || 'Quote'}`;

  // 1. Render Telegram Bubbles
  detailBubbleContent.innerHTML = '';
  
  if (quote.payload && quote.payload.messages && quote.payload.messages.length > 0) {
    quote.payload.messages.forEach(msg => {
      const msgRow = document.createElement('div');
      msgRow.className = 'detail-msg-row';
      
      const author = msg.from || { name: 'Deleted User', telegram_id: 0 };
      const avatarHtml = getUserAvatarHtml(author);
      const text = msg.text || '';
      
      // Handle replies representation
      let replyHtml = '';
      if (msg.reply_to_message) {
        const replyAuthor = msg.reply_to_message.from ? (msg.reply_to_message.from.name || msg.reply_to_message.from.first_name) : 'User';
        const replyText = msg.reply_to_message.text || '[Media]';
        replyHtml = `
          <div class="tg-reply-box">
            <div class="tg-reply-author">${escapeHtml(replyAuthor)}</div>
            <div class="tg-reply-text">${escapeHtml(replyText)}</div>
          </div>
        `;
      }

      msgRow.innerHTML = `
        ${avatarHtml}
        <div class="tg-bubble-card">
          <div class="tg-author-name" style="color: ${getAvatarColor(author.name || '', author.telegram_id)}">${escapeHtml(author.name || author.first_name)}</div>
          ${replyHtml}
          <div class="tg-text">${escapeHtml(text)}</div>
        </div>
      `;
      
      detailBubbleContent.appendChild(msgRow);
    });
  }

  // 2. Render Score/Votes
  const score = quote.rate && quote.rate.score != null ? quote.rate.score : 0;
  const userVote = quote.rate && quote.rate.votes && quote.rate.votes.find(v => v.telegram_id === tg.initDataUnsafe.user?.id);
  
  detailVoteUpCount.textContent = score >= 0 ? score : 0;
  detailVoteDownCount.textContent = score < 0 ? Math.abs(score) : 0;

  if (userVote) {
    if (userVote.voteType === 'up') detailVoteUp.classList.add('active');
    else if (userVote.voteType === 'down') detailVoteDown.classList.add('active');
  }

  // 3. Render Metadata Cards
  const authorName = quote.authors && quote.authors.length > 0 ? quote.authors[0].name : 'Unknown';
  const quotedBy = quote.user ? (quote.user.first_name || 'bot') : 'bot';
  
  metaAuthor.textContent = authorName;
  metaQuotedBy.textContent = quotedBy === authorName ? 'self-quoted' : quotedBy;
  metaPublished.textContent = formatDate(quote.createdAt, 'full');
  metaReactions.textContent = score >= 0 ? `+${score}` : `${score}`;

  // 4. Render More from Author
  moreAuthorSlider.innerHTML = '';
  if (moreFromAuthor && moreFromAuthor.length > 0) {
    moreFromAuthor.forEach(q => {
      const card = createSliderCard(q);
      moreAuthorSlider.appendChild(card);
    });
  } else {
    moreAuthorSlider.innerHTML = '<div style="color: var(--tg-hint); font-size: 12px; padding: 10px;">No other quotes</div>';
  }

  // 5. Render More from Group
  moreGroupSlider.innerHTML = '';
  if (moreFromGroup && moreFromGroup.length > 0) {
    moreFromGroup.forEach(q => {
      const card = createSliderCard(q);
      moreGroupSlider.appendChild(card);
    });
  } else {
    moreGroupSlider.innerHTML = '<div style="color: var(--tg-hint); font-size: 12px; padding: 10px;">No other quotes</div>';
  }

  // 6. Floating Original Sticker Button
  if (quote.file_id) {
    originalBtn.onclick = () => {
      // Trigger Telegram sticker preview or view sticker
      tg.sendData(JSON.stringify({ action: 'view_sticker', file_id: quote.file_id }));
    };
  } else {
    originalBtn.onclick = null;
  }
}

// Helper to create slider cards
function createSliderCard(quote) {
  const card = document.createElement('div');
  card.className = 'slider-quote-card';
  
  let previewText = '';
  let authorName = 'User';
  let authorObj = null;

  if (quote.payload && quote.payload.messages && quote.payload.messages.length > 0) {
    const firstMsg = quote.payload.messages[0];
    previewText = firstMsg.text || '[Media]';
    if (firstMsg.from) {
      authorName = firstMsg.from.name || firstMsg.from.first_name || 'User';
      authorObj = firstMsg.from;
    }
  }

  const score = quote.rate && quote.rate.score != null ? quote.rate.score : 0;
  const avatarHtml = authorObj ? getUserAvatarHtml(authorObj) : '';

  card.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; font-size: 11px;">
      ${avatarHtml}
      <span class="feed-author-name" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(authorName)}</span>
    </div>
    <div class="slider-card-text">${escapeHtml(previewText)}</div>
    <div class="slider-card-footer">
      <span>#${quote.local_id || ''}</span>
      <span class="${score >= 0 ? 'up' : 'down'}">${score >= 0 ? '↑' : '↓'} ${Math.abs(score)}</span>
    </div>
  `;
  
  card.addEventListener('click', () => openQuoteDetail(quote._id));
  return card;
}

// Voting integration
async function vote(voteType) {
  if (!currentQuoteDetails || !currentQuoteDetails.quote) return;
  const quoteId = currentQuoteDetails.quote._id;

  try {
    const response = await fetch(`/api/quotes/${quoteId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': tg.initData || 'mock_data'
      },
      body: JSON.stringify({ voteType })
    });

    if (!response.ok) throw new Error('Vote failed');
    const result = await response.json();
    
    // Update local UI state
    const score = result.score;
    detailVoteUpCount.textContent = score >= 0 ? score : 0;
    detailVoteDownCount.textContent = score < 0 ? Math.abs(score) : 0;
    metaReactions.textContent = score >= 0 ? `+${score}` : `${score}`;

    detailVoteUp.classList.remove('active');
    detailVoteDown.classList.remove('active');

    const userVote = result.votes.find(v => v.telegram_id === tg.initDataUnsafe.user?.id);
    if (userVote) {
      if (userVote.voteType === 'up') detailVoteUp.classList.add('active');
      else if (userVote.voteType === 'down') detailVoteDown.classList.add('active');
    }
  } catch (err) {
    console.error(err);
  }
}

detailVoteUp.addEventListener('click', () => vote('up'));
detailVoteDown.addEventListener('click', () => vote('down'));

// Search input listener (with debounce)
searchInput.addEventListener('input', (e) => {
  searchFilter = e.target.value;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    fetchGroupQuotes();
  }, 400);
});

// Main Tab buttons listener
tabButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    activeSort = btn.dataset.tab;
    
    // Toggle date subtabs visibility
    if (activeSort === 'top') {
      dateSubtabsContainer.style.display = 'flex';
    } else {
      dateSubtabsContainer.style.display = 'none';
    }
    
    fetchGroupQuotes();
  });
});

// Date Range subtab buttons listener
subtabButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    subtabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    activeRange = btn.dataset.range;
    fetchGroupQuotes();
  });
});

// Sliders buttons
allAuthorQuotesBtn.addEventListener('click', () => {
  if (currentQuoteDetails && currentQuoteDetails.quote && currentQuoteDetails.quote.authors.length > 0) {
    const author = currentQuoteDetails.quote.authors[0];
    searchInput.value = author.name || author.first_name;
    searchFilter = searchInput.value;
    showScreen('feed');
    fetchGroupQuotes();
  }
});

allGroupQuotesBtn.addEventListener('click', () => {
  showScreen('feed');
  searchInput.value = '';
  searchFilter = '';
  fetchGroupQuotes();
});

// Start app
init();
