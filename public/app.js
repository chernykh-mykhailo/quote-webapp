// Initialize Telegram WebApp SDK
const tg = window.Telegram.WebApp;

// DOM Elements
const loadingScreen = document.getElementById('loading-screen');
const errorScreen = document.getElementById('error-screen');
const errorMessage = document.getElementById('error-message');
const groupsScreen = document.getElementById('groups-screen');
const groupsList = document.getElementById('groups-list');
const emptyGroups = document.getElementById('empty-groups');
const quotesScreen = document.getElementById('quotes-screen');
const quotesFeed = document.getElementById('quotes-feed');
const emptyQuotes = document.getElementById('empty-quotes');

const backBtn = document.getElementById('back-btn');
const groupTitle = document.getElementById('group-title');
const groupSubtitle = document.getElementById('group-subtitle');
const themeBadge = document.getElementById('theme-badge');

// App state
let currentScreen = 'groups'; // 'groups' or 'quotes'
let currentGroupId = null;

// Setup theme and expand
tg.ready();
tg.expand();

// Apply Telegram theme colors dynamically if available
function applyTheme() {
  const theme = tg.colorScheme || 'dark';
  document.body.className = `${theme}-theme`;
  themeBadge.textContent = `Theme: ${theme.toUpperCase()}`;
}
applyTheme();
tg.onEvent('themeChanged', applyTheme);

// Back button handler
backBtn.addEventListener('click', () => {
  showScreen('groups');
});

// Helper to switch screens
function showScreen(screen) {
  currentScreen = screen;
  
  if (screen === 'groups') {
    groupsScreen.classList.remove('hidden');
    quotesScreen.classList.add('hidden');
    backBtn.classList.add('hidden');
    groupTitle.textContent = 'Quotly Archive';
    groupSubtitle.textContent = 'Select a group to view quotes';
    currentGroupId = null;
  } else if (screen === 'quotes') {
    groupsScreen.classList.add('hidden');
    quotesScreen.classList.remove('hidden');
    backBtn.classList.remove('hidden');
  }
}

// Generate beautiful avatar colors from name hashCode
function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 65%, 45%)`;
}

// Get initials from title
function getInitials(title) {
  return title
    .split(' ')
    .map(word => word.charAt(0))
    .slice(0, 2)
    .join('');
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// Initialize Application
async function init() {
  const initData = tg.initData;

  // For testing outside Telegram, allow fallback if local development
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (!initData && !isLocalDev) {
    loadingScreen.classList.add('hidden');
    errorScreen.classList.remove('hidden');
    errorMessage.textContent = 'Please open this application from within Telegram.';
    return;
  }

  // Load user's groups
  try {
    const url = isLocalDev ? '/api/groups?initData=mock_data' : `/api/groups?initData=${encodeURIComponent(initData)}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
    
    const groups = await response.json();
    loadingScreen.classList.add('hidden');
    
    renderGroups(groups);
  } catch (err) {
    console.error('Error fetching groups:', err);
    loadingScreen.classList.add('hidden');
    errorScreen.classList.remove('hidden');
    errorMessage.textContent = 'Failed to fetch groups from the server. Check backend connection.';
  }
}

// Render groups list
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
    const color = getAvatarColor(group.title);
    
    item.innerHTML = `
      <div class="group-details">
        <div class="avatar" style="background: ${color}">${initials}</div>
        <div>
          <div class="group-name">${escapeHtml(group.title)}</div>
          <div class="group-username">${group.username ? '@' + group.username : 'Private group'}</div>
        </div>
      </div>
      <div class="arrow-icon">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/></svg>
      </div>
    `;
    
    item.addEventListener('click', () => loadQuotes(group));
    groupsList.appendChild(item);
  });
}

// Load quotes for selected group
async function loadQuotes(group) {
  currentGroupId = group.id;
  groupTitle.textContent = group.title;
  groupSubtitle.textContent = 'Loading quotes...';
  
  // Show quotes loading state
  quotesFeed.innerHTML = '<div style="margin: auto;" class="spinner"></div>';
  showScreen('quotes');

  try {
    const initData = tg.initData;
    const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    const url = isLocalDev 
      ? `/api/groups/${group.id}/quotes?initData=mock_data` 
      : `/api/groups/${group.id}/quotes?initData=${encodeURIComponent(initData)}`;
      
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch quotes');
    
    const quotes = await response.json();
    groupSubtitle.textContent = `${quotes.length} quotes saved`;
    renderQuotes(quotes);
  } catch (err) {
    console.error('Error fetching quotes:', err);
    groupSubtitle.textContent = 'Failed to load';
    quotesFeed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load quotes</h3>
        <p>Could not connect to the backend server.</p>
      </div>
    `;
  }
}

// Render quotes feed
function renderQuotes(quotes) {
  quotesFeed.innerHTML = '';
  
  if (!quotes || quotes.length === 0) {
    emptyQuotes.classList.remove('hidden');
    return;
  }
  
  emptyQuotes.classList.add('hidden');

  quotes.forEach(quote => {
    const card = document.createElement('div');
    card.className = 'quote-card';
    
    const formattedDate = formatDate(quote.createdAt);
    const score = quote.rate && quote.rate.score != null ? quote.rate.score : 0;
    
    let bubbleHtml = '';
    
    // Render Telegram style bubbles if messages payload exists
    if (quote.payload && quote.payload.messages && quote.payload.messages.length > 0) {
      const messages = quote.payload.messages;
      
      messages.forEach(msg => {
        const text = msg.text || '';
        const authorName = msg.from ? (msg.from.name || msg.from.first_name || 'User') : 'Deleted User';
        const senderColor = getAvatarColor(authorName);
        
        bubbleHtml += `
          <div class="tg-bubble" style="border-left-color: ${senderColor}">
            <div class="tg-author-name" style="color: ${senderColor}">${escapeHtml(authorName)}</div>
            <div class="tg-text">${escapeHtml(text)}</div>
          </div>
        `;
      });
    }

    card.innerHTML = `
      <div class="quote-card-header">
        <span class="quote-date">${formattedDate}</span>
        <span class="badge" style="background-color: ${score >= 0 ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)'}">
          Score: ${score}
        </span>
      </div>
      
      ${bubbleHtml ? `
        <div class="quote-bubble-wrapper">
          ${bubbleHtml}
        </div>
      ` : ''}
      
      ${quote.file_id ? `
        <div class="sticker-preview">
          <!-- We fallback to displaying code or description since the raw webp is hosted on Telegram servers -->
          <div class="badge">Sticker ID: ${quote.file_id.slice(0, 16)}...</div>
        </div>
      ` : ''}
    `;
    
    quotesFeed.appendChild(card);
  });
}

// Utility to escape HTML
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start app
init();
