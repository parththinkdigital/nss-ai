/**
 * Scraper & Vector Indexer for official NSS (https://nss.gov.in/)
 * Scrapes public pages, splits text into clean semantic chunks,
 * creates embeddings, and writes data/nss_index.json.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');
const { VectorStore } = require('../lib/vector-store');

const TARGET_PAGES = [
  {
    url: 'https://nss.gov.in/en',
    title: 'National Service Scheme - Overview & Introduction',
  },
  {
    url: 'https://nss.gov.in/en/about-us-0',
    title: 'Organisation, History and Background of NSS',
  },
  {
    url: 'https://nss.gov.in/en/mission-objectives',
    title: 'NSS Objectives, Motto, Symbol and Badge',
  },
  {
    url: 'https://nss.gov.in/en/regular-activities',
    title: 'NSS Regular Activities and 120 Hours Requirement',
  },
  {
    url: 'https://nss.gov.in/en/special-camping-programme',
    title: 'NSS Special Camping Programme (7 Days Camp)',
  },
  {
    url: 'https://nss.gov.in/en/awards',
    title: 'National Service Scheme Awards and Guidelines',
  },
  {
    url: 'https://nss.gov.in/en/nss-volunteer',
    title: 'NSS Volunteers Enrollment & Statistics',
  },
  {
    url: 'https://nss.gov.in/en/whos-who',
    title: 'Who is Who - Ministry of Youth Affairs and Sports & NSS Directorate',
  },
  {
    url: 'https://nss.gov.in/en/nss-contactus',
    title: 'NSS Contact Information and Directorate Address',
  },
  {
    url: 'https://nss.gov.in/en/national-youth-festivals',
    title: 'National Youth Festivals & Viksit Bharat Young Leaders Dialogue',
  },
  {
    url: 'https://nss.gov.in/en/help',
    title: 'NSS Portal Help, Accessibility and FAQs',
  },
  {
    url: 'https://nss.gov.in/en/success-stories',
    title: 'NSS Success Stories and Best Practices',
  },
];

// Supplementary verified official NSS facts from scheme guidelines (Ministry of Youth Affairs & Sports)
const ESSENTIAL_KNOWLEDGE = [
  {
    title: 'NSS Motto and Philosophy',
    url: 'https://nss.gov.in/en/mission-objectives',
    text: `The Motto of National Service Scheme (NSS) is "NOT ME BUT YOU". This reflects the essence of democratic living and upholds the need for selfless service. NSS philosophy underlines that the welfare of an individual is ultimately dependent on the welfare of society as a whole. Therefore, the NSS volunteers shall strive for the well-being of the society.`,
  },
  {
    title: 'NSS Symbol and Konark Sun Temple Wheel',
    url: 'https://nss.gov.in/en/mission-objectives',
    text: `The NSS symbol is based on the "Rath Wheel" of the Konark Sun Temple situated in Odisha, India. The giant wheel of the Sun Temple portrays the cycle of creation, preservation, and release, signifying movement in life across time and space. The 8 bars in the wheel represent the 24 hours of the day (each bar standing for a 3-hour period, or 'Pahar'). It reminds the volunteer to be in readiness for service of the nation round the clock.`,
  },
  {
    title: 'NSS Badge and Colors',
    url: 'https://nss.gov.in/en/mission-objectives',
    text: `The NSS badge contains the Konark wheel. The navy blue color in the NSS badge indicates the cosmos of which the NSS is a tiny part, ready to contribute its share for the welfare of mankind. The red color in the badge indicates that the volunteer is full of young blood, lively, active, energetic, and full of high spirit.`,
  },
  {
    title: 'History and Launch of NSS (1969)',
    url: 'https://nss.gov.in/en/about-us-0',
    text: `The National Service Scheme was formally launched on 24th September 1969, during the Mahatma Gandhi Centenary Year. It was launched by then Union Education Minister Dr. V.K.R.V. Rao across 37 universities covering 40,000 students. Today, NSS has expanded across all States and Union Territories covering more than 657 universities, 51 +2 councils, and over 4 million student volunteers.`,
  },
  {
    title: 'National Service Scheme Awards Structure',
    url: 'https://nss.gov.in/en/awards',
    text: `The Ministry of Youth Affairs & Sports confers the National Service Scheme Awards annually to recognize voluntary service. Awards are presented in 3 categories: 1. University/+2 Council level (1 Award, Trophy and Certificate), 2. NSS Units and Programme Officers (10 Awards, Cash prize of Rs. 2,00,000 for Unit and Rs. 1,50,000 for Programme Officer with Silver Medal and Certificate), 3. NSS Volunteers (30 Awards, Cash prize of Rs. 1,00,000 each with Silver Medal and Certificate). The awards are traditionally conferred by the President of India at Rashtrapati Bhavan.`,
  },
  {
    title: 'NSS Volunteer Requirements & Certification',
    url: 'https://nss.gov.in/en/regular-activities',
    text: `A student enrolled in NSS is expected to put in at least 120 hours of social work per academic year for two consecutive years (a total of 240 hours). In addition, each volunteer must participate in at least one 7-day Special Camping Programme during their 2-year tenure. Volunteers who complete 240 hours of regular service and one special camp are awarded the NSS Certificate by their University or Directorate.`,
  },
];

function fetchUrl(url) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        rejectUnauthorized: false,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 12000,
      };

      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).href;
          return resolve(fetchUrl(redirectUrl));
        }

        if (res.statusCode !== 200) {
          console.warn(`[Scraper] Warning: Status ${res.statusCode} for ${url}`);
          return resolve(null);
        }

        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve(body));
      });

      req.on('error', (err) => {
        console.warn(`[Scraper] Error fetching ${url}: ${err.message}`);
        resolve(null);
      });

      req.on('timeout', () => {
        console.warn(`[Scraper] Timeout fetching ${url}`);
        req.destroy();
        resolve(null);
      });

      req.end();
    } catch (e) {
      console.warn(`[Scraper] Exception fetching ${url}: ${e.message}`);
      resolve(null);
    }
  });
}

function cleanHtmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(html);

  // Remove chrome, navigation, scripts, footer
  $(
    'script, style, noscript, nav, header, footer, .region-header, .region-footer, .breadcrumb, #admin-menu, .menu-block-wrapper, #main-menu, .main_header'
  ).remove();

  // Prefer main content wrapper
  const container =
    $('.inner_right').length > 0
      ? $('.inner_right')
      : $('.content-top').length > 0
      ? $('.content-top')
      : $('.views-field-body').length > 0
      ? $('.views-field-body')
      : $('#skipCont').length > 0
      ? $('#skipCont')
      : $('.inner_body').length > 0
      ? $('.inner_body')
      : $('.region-content').length > 0
      ? $('.region-content')
      : $('body');

  // Convert br and block elements to newlines
  container.find('br').replaceWith('\n');
  container.find('p, h1, h2, h3, h4, h5, h6, li, tr').each((_, el) => {
    $(el).append('\n');
  });

  let text = container.text();
  // Clean whitespace
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  return text;
}

function splitIntoChunks(text, maxWords = 220, overlap = 35) {
  if (!text) return [];
  const paragraphs = text.split('\n\n').map(p => p.trim()).filter((p) => p.length > 20);
  if (paragraphs.length === 0 && text.trim().length > 20) {
    return [text.trim()];
  }
  const chunks = [];
  let currentWords = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/);

    if (currentWords.length + words.length <= maxWords) {
      currentWords.push(...words);
    } else {
      if (currentWords.length > 0) {
        chunks.push(currentWords.join(' '));
        // Keep trailing overlap words
        const keepCount = Math.min(overlap, Math.floor(currentWords.length / 2));
        currentWords = currentWords.slice(-keepCount);
      }

      if (words.length > maxWords) {
        // Split long paragraph into chunks
        let offset = 0;
        while (offset < words.length) {
          const slice = words.slice(offset, offset + maxWords);
          chunks.push(slice.join(' '));
          offset += maxWords - overlap;
        }
        currentWords = [];
      } else {
        currentWords.push(...words);
      }
    }
  }

  if (currentWords.length > 10) {
    chunks.push(currentWords.join(' '));
  }

  return chunks;
}

async function scrapeAndIndex() {
  console.log('=== NSS Public Page Scraper & Indexer ===');
  console.log(`Starting scrape of ${TARGET_PAGES.length} pages from https://nss.gov.in/ ...\n`);

  const rawChunks = [];
  let chunkCounter = 1;

  for (const page of TARGET_PAGES) {
    process.stdout.write(`Fetching ${page.url} ... `);
    const html = await fetchUrl(page.url);
    if (!html) {
      console.log('Skipped (unreachable or empty)');
      continue;
    }

    const text = cleanHtmlToText(html);
    console.log(`Extracted ${text.length} chars`);

    const textChunks = splitIntoChunks(text);
    console.log(`  -> Split into ${textChunks.length} chunks`);

    for (const chunkText of textChunks) {
      rawChunks.push({
        id: `nss-chunk-${chunkCounter++}`,
        title: page.title,
        url: page.url,
        text: chunkText,
      });
    }
  }

  // Add supplementary essential official scheme knowledge
  console.log(`\nAdding ${ESSENTIAL_KNOWLEDGE.length} core official NSS knowledge chunks...`);
  for (const item of ESSENTIAL_KNOWLEDGE) {
    rawChunks.push({
      id: `nss-chunk-${chunkCounter++}`,
      title: item.title,
      url: item.url,
      text: item.text,
    });
  }

  console.log(`\nTotal chunks collected: ${rawChunks.length}`);
  console.log('Building dense vector embeddings and BM25 index...');

  const vectorStore = new VectorStore();
  const indexData = vectorStore.buildIndex(rawChunks);

  const outputPath = path.join(__dirname, '..', 'data', 'nss_index.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(indexData, null, 2), 'utf8');

  console.log(`\nSuccessfully created vector index with ${indexData.totalChunks} chunks!`);
  console.log(`Saved index to: ${outputPath}`);

  // Quick verification test
  console.log('\n--- Verification Test Search ---');
  const testQuery = 'What is the motto and symbol of NSS?';
  const testResults = vectorStore.search(testQuery, { topK: 2 });
  console.log(`Query: "${testQuery}"`);
  console.log(`Results found: ${testResults.length}`);
  for (const res of testResults) {
    console.log(`\n[Score: ${res.score}] ${res.title}`);
    console.log(`URL: ${res.url}`);
    console.log(`Snippet: ${res.text.slice(0, 180)}...`);
  }
  console.log('\nIndexing complete!');
}

scrapeAndIndex().catch((err) => {
  console.error('Fatal scraping error:', err);
  process.exit(1);
});
