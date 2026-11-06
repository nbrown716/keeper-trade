import { liveData } from './live-data.js';

export const NEWS_SOURCE = 'nfl-news';

liveData.register(NEWS_SOURCE, {
  url: 'https://keeper-trade-ai.nicholas-brown00.workers.dev/espn/news',
  cadence: 300000
});

export function normalizeNews(data) {
  return (data?.articles || []).filter(article => article.headline && article.type !== 'Media').map(article => ({
    id: article.dataSourceIdentifier || article.headline,
    headline: article.headline,
    description: article.description || '',
    published: article.published,
    image: article.images?.[0]?.url || '',
    url: article.links?.web?.href || '#',
    source: article.byline || 'ESPN'
  }));
}

export function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}
