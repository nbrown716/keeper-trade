import { getSleeperLeagueId, getNflState } from '../data/sleeper.js';
import { liveData } from '../data/live-data.js';
import { mountNavigation } from '../ui/navigation.js';
import { AWARD_LABELS, loadPulseData, narratePulse, writeNewsletter, newsletterText } from './pulse-data.js';

let data;
let narrative;
let article;
let latestWeek = 1;
let loading = false;
let transactionCleanup = () => {};
let transactionSignature = '';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function status(message) {
  document.querySelector('#pulse-status').textContent = message;
}

function teamColor(id) {
  return (Number(id || 0) * 47 % 360) || 210;
}

function selectTab(name, focus = false) {
  document.querySelectorAll('[data-pulse-tab]').forEach(tab => {
    const selected = tab.dataset.pulseTab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });
  document.querySelectorAll('[data-pulse-panel]').forEach(panel => { panel.hidden = panel.dataset.pulsePanel !== name; });
}

function renderStories(stories, source = 'computed') {
  const container = document.querySelector('#pulse-stories');
  container.setAttribute('aria-busy', 'false');
  container.innerHTML = stories.map((item, index) => `<article class="kt-pulse-story" style="--kt-story-color:${teamColor(item.teamId)};--kt-delay:${index * 45}ms"><button type="button" data-story-toggle="${index}" aria-expanded="false" aria-controls="pulse-story-evidence-${index}"><span class="kt-pulse-story-kicker">WEEK ${data.week} · ${escapeHtml(item.id.replace(/([A-Z])/g, ' $1'))}</span><strong>${escapeHtml(item.headline)}</strong><span class="kt-pulse-story-open">See the receipts <i aria-hidden="true">+</i></span></button><div class="kt-pulse-evidence" id="pulse-story-evidence-${index}" hidden><p>${escapeHtml(item.fact)}</p><dl>${item.evidence.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></div></article>`).join('');
  if (source === 'ai') status('Fresh league narration. Every headline still opens to the underlying Sleeper data.');
}

function renderAwards(awards, source = 'computed') {
  const container = document.querySelector('#pulse-awards');
  container.setAttribute('aria-busy', 'false');
  container.innerHTML = awards.map((award, index) => `<article class="kt-pulse-award" style="--kt-award-color:${teamColor(award.teamId)};--kt-delay:${index * 50}ms"><div class="kt-pulse-award-top"><span>${escapeHtml(AWARD_LABELS[award.id])}</span><strong>${escapeHtml(award.displayValue)}</strong></div><h3>${escapeHtml(award.teamName)}</h3>${award.playerName ? `<small>${escapeHtml(award.playerName)}</small>` : ''}<p>${escapeHtml(award.citation || award.detail)}</p><div class="kt-pulse-award-source">${source === 'ai' ? 'AI citation · verified facts' : 'Computed from Sleeper'}</div></article>`).join('');
}

function renderNewsletter(result) {
  article = result.article;
  const container = document.querySelector('#pulse-newsletter');
  container.setAttribute('aria-busy', 'false');
  container.innerHTML = `<header class="kt-pulse-article-header"><span class="kt-pulse-article-brand">THE COMMISSIONER</span><span class="kt-pulse-article-issue">${escapeHtml(data.leagueName)} · Week ${data.week} · ${escapeHtml(data.season)}</span><h2>${escapeHtml(article.title)}</h2><p>${escapeHtml(article.dek)}</p></header><div class="kt-pulse-article-body">${article.sections.map((section, index) => `<section><div class="kt-pulse-article-section-number">${String(index + 1).padStart(2, '0')}</div><div><h3>${escapeHtml(section.heading)}</h3>${section.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}</div></section>`).join('')}</div><footer class="kt-pulse-article-footer"><span>${result.source === 'ai' ? 'Sonnet narration' : 'Computed edition · AI narration unavailable'}</span><span>${result.createdAt ? `${result.cached ? 'Cached' : 'Fresh'} · ${new Date(result.createdAt).toLocaleDateString()}` : 'No API call required'}</span></footer>`;
  document.querySelector('#pulse-copy-newsletter').disabled = false;
}

function renderTrophies() {
  document.querySelector('#pulse-trophies').innerHTML = data.trophies.map((team, index) => `<article class="kt-pulse-trophy-row" style="--kt-delay:${index * 35}ms"><div class="kt-pulse-trophy-rank">${index + 1}</div><div class="kt-pulse-trophy-team"><strong>${escapeHtml(team.name)}</strong><span>${team.total} award${team.total === 1 ? '' : 's'} this season</span></div><div class="kt-pulse-trophy-counts">${Object.entries(team.awards).map(([id, count]) => `<span title="${escapeHtml(AWARD_LABELS[id])}"${count ? ' class="has-trophy"' : ''}><b>${count}</b>${escapeHtml(id === 'highest' ? 'HS' : id === 'heartbreak' ? 'HB' : id === 'bench' ? 'BB' : id === 'lucky' ? 'LD' : 'BW')}</span>`).join('')}</div><strong class="kt-pulse-trophy-total kt-num">${team.total}</strong></article>`).join('');
}

function renderRecords() {
  document.querySelector('#pulse-records').innerHTML = data.recordBook.map((record, index) => {
    const broken = data.celebrations.some(item => item.id === record.id);
    return `<article class="kt-pulse-record${broken ? ' is-new-record' : ''}" style="--kt-delay:${index * 60}ms"><span class="kt-eyebrow">${escapeHtml(record.label)}</span>${broken ? '<span class="kt-pulse-new-record">NEW RECORD</span>' : ''}<strong class="kt-num">${escapeHtml(record.displayValue)}</strong><h3>${escapeHtml(record.teamName)}</h3><p>${escapeHtml(record.detail)}</p><small>Week ${escapeHtml(record.week)} · ${escapeHtml(record.season)}</small></article>`;
  }).join('') || '<p class="kt-muted">Records appear after the first completed week.</p>';
  const celebration = document.querySelector('#pulse-celebration');
  celebration.hidden = !data.celebrations.length;
  celebration.innerHTML = data.celebrations.length ? `<span class="kt-eyebrow">History just changed</span><strong>${data.celebrations.map(record => `${escapeHtml(record.label)}: ${escapeHtml(record.teamName)}`).join(' · ')}</strong>` : '';
}

function subscribeTransactions() {
  transactionCleanup();
  transactionSignature = data.trades.map(trade => trade.id).join(',') + `:${data.waiverCount}`;
  transactionCleanup = liveData.subscribe(`sleeper-transactions:${data.leagueId}:${data.week}`, snapshot => {
    if (!snapshot.data) return;
    const nextTrades = snapshot.data.filter(transaction => transaction.type === 'trade').map(transaction => transaction.transaction_id).join(',');
    const waivers = snapshot.data.filter(transaction => ['waiver', 'free_agent'].includes(transaction.type)).length;
    const nextSignature = `${nextTrades}:${waivers}`;
    if (nextSignature === transactionSignature) return;
    transactionSignature = nextSignature;
    loadWeek(data.week);
  });
}

function renderComputed() {
  document.querySelector('#pulse-league').textContent = `${data.leagueName} · ${data.season} season · ${data.history.length} week${data.history.length === 1 ? '' : 's'} archived`;
  renderStories(data.stories);
  renderAwards(data.awards);
  renderTrophies();
  renderRecords();
}

let pendingWeek;

async function loadWeek(week) {
  const id = getSleeperLeagueId();
  if (!id) return;
  if (loading) { pendingWeek = week; return; }
  loading = true;
  document.querySelector('#pulse-week').disabled = true;
  transactionCleanup();
  document.querySelector('#pulse-stories').setAttribute('aria-busy', 'true');
  document.querySelector('#pulse-awards').setAttribute('aria-busy', 'true');
  document.querySelector('#pulse-newsletter').setAttribute('aria-busy', 'true');
  document.querySelector('#pulse-copy-newsletter').disabled = true;
  status('Computing the week from real Sleeper scores…');
  try {
    data = await loadPulseData(id, week);
    narrative = { stories: data.stories, awards: data.awards.map(award => ({ ...award, citation: award.detail })) };
    renderComputed();
    subscribeTransactions();
    if (week === latestWeek) {
      status('Facts are ready. Adding the league’s voice…');
      narrative = await narratePulse(data);
    }
    renderStories(narrative.stories, narrative.source);
    renderAwards(narrative.awards, narrative.source);
    if (narrative.source !== 'ai') status(week === latestWeek ? 'Computed edition. AI narration is unavailable, but every fact and award is here.' : 'Historical computed edition. AI calls are reserved for the latest completed week.');
    const newsletter = await writeNewsletter(data, narrative, { allowAI: week === latestWeek });
    renderNewsletter(newsletter);
  } catch (error) {
    document.querySelector('#pulse-stories').setAttribute('aria-busy', 'false');
    document.querySelector('#pulse-stories').innerHTML = `<div class="kt-pulse-error"><h2>${escapeHtml(error.message)}</h2><p>Try another week or reconnect your league. The rest of Keeper Trade is unaffected.</p><a class="kt-btn kt-btn-primary" href="index.html#league">Open league setup</a></div>`;
    document.querySelector('#pulse-awards').innerHTML = '';
    document.querySelector('#pulse-newsletter').innerHTML = '<p class="kt-muted">The Commissioner will arrive when matchup data is available.</p>';
    status('League Pulse is waiting for matchup data.');
  } finally {
    loading = false;
    document.querySelector('#pulse-week').disabled = false;
    if (pendingWeek) {
      const next = pendingWeek;
      pendingWeek = null;
      loadWeek(next);
    }
  }
}

async function copyNewsletter(event) {
  if (!article) return;
  const button = event.currentTarget;
  const text = newsletterText(data, article);
  let copied = false;
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise((_, reject) => { const timer = window.setTimeout(() => { clearTimeout(timer); reject(new Error('Clipboard timeout')); }, 800); })
    ]);
    copied = true;
  } catch (_) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    copied = document.execCommand('copy');
    textarea.remove();
  }
  button.textContent = copied ? 'Copied for the group chat' : 'Copy unavailable';
  status(copied ? 'Commissioner copied. The group chat has been notified.' : 'Clipboard access is unavailable in this browser.');
  window.setTimeout(() => { button.textContent = 'Copy as text'; }, 1800);
}

document.querySelectorAll('[data-pulse-tab]').forEach(tab => {
  tab.addEventListener('click', () => selectTab(tab.dataset.pulseTab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[data-pulse-tab]')];
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[next].dataset.pulseTab, true);
  });
});
document.querySelector('#pulse-stories').addEventListener('click', event => {
  const button = event.target.closest('[data-story-toggle]');
  if (!button) return;
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  button.querySelector('i').textContent = expanded ? '+' : '−';
  document.getElementById(button.getAttribute('aria-controls')).hidden = expanded;
});
document.querySelector('#pulse-copy-newsletter').addEventListener('click', copyNewsletter);
document.querySelector('#pulse-week').addEventListener('change', event => loadWeek(Number(event.target.value)));

mountNavigation({ active: 'pulse' });

async function init() {
  const id = getSleeperLeagueId();
  if (!id) {
    document.querySelector('#pulse-stories').innerHTML = '<div class="kt-pulse-error"><h2>Connect your league to start the lore.</h2><p>League Pulse uses your real Sleeper matchups, transactions, and standings.</p><a class="kt-btn kt-btn-primary" href="index.html#league">Connect Sleeper</a></div>';
    document.querySelector('#pulse-stories').setAttribute('aria-busy', 'false');
    document.querySelector('#pulse-awards').innerHTML = '';
    status('Waiting for a Sleeper league.');
    return;
  }
  try {
    const state = await getNflState();
    latestWeek = Math.max(1, Number(state?.display_week || state?.week || 2) - 1);
    const requested = Number(new URLSearchParams(window.location.search).get('sleeperweek'));
    const week = Math.min(latestWeek, Math.max(1, requested || latestWeek));
    document.querySelector('#pulse-week').innerHTML = Array.from({ length: latestWeek }, (_, index) => `<option value="${index + 1}"${index + 1 === week ? ' selected' : ''}>Week ${index + 1}${index + 1 === latestWeek ? ' · Latest complete' : ''}</option>`).join('');
    await loadWeek(week);
  } catch (_) {
    status('Sleeper is unavailable. Your saved tools still work.');
    document.querySelector('#pulse-stories').innerHTML = '<div class="kt-pulse-error"><h2>The league office is reconnecting.</h2><p>Try again when your connection returns.</p></div>';
  }
}

init();
