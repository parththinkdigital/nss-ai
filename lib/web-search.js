/**
 * Live Web Search utility for NSS AI Chatbot
 * Performs fast search queries when official local chunks do not have the answer.
 */

const https = require('https');
const cheerio = require('cheerio');
const querystring = require('querystring');

/**
 * Searches the live web using privacy-friendly fast search
 * @param {string} query Search terms
 * @returns {Promise<Array<{ title: string, url: string, snippet: string }>>}
 */
function searchWeb(query) {
  return new Promise((resolve) => {
    try {
      const enhancedQuery = query.toLowerCase().includes('nss') || query.toLowerCase().includes('national service scheme')
        ? query
        : `${query} National Service Scheme India`;

      const postData = querystring.stringify({ q: enhancedQuery });

      const options = {
        hostname: 'lite.duckduckgo.com',
        port: 443,
        path: '/lite/',
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 5000,
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            const $ = cheerio.load(body);
            const results = [];

            $('.result-link').each((i, el) => {
              if (results.length >= 4) return false;
              const linkElem = $(el);
              const title = linkElem.text().trim();
              let rawUrl = linkElem.attr('href') || '';

              // Clean DuckDuckGo redirect wrapper if present
              if (rawUrl.includes('uddg=')) {
                try {
                  const u = new URL('https://duckduckgo.com' + rawUrl);
                  rawUrl = decodeURIComponent(u.searchParams.get('uddg') || rawUrl);
                } catch (_) {}
              }

              // Extract snippet from following row
              const snippetRow = linkElem.closest('tr').next('tr');
              const snippet = snippetRow.find('.result-snippet').text().trim();

              if (title && rawUrl && !rawUrl.includes('duckduckgo.com')) {
                results.push({
                  title,
                  url: rawUrl,
                  snippet: snippet || title,
                });
              }
            });

            resolve(results);
          } catch (parseErr) {
            console.warn('[Web Search Parse Error]:', parseErr.message);
            resolve([]);
          }
        });
      });

      req.on('error', (err) => {
        console.warn('[Web Search Network Error]:', err.message);
        resolve([]);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve([]);
      });

      req.write(postData);
      req.end();
    } catch (e) {
      console.warn('[Web Search Exception]:', e.message);
      resolve([]);
    }
  });
}

module.exports = {
  searchWeb,
};
