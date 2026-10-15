/**
 * Lightweight in-memory Vector Store for Next.js NSS Chatbot
 * Uses dense hashed subword/n-gram embeddings (384-dim, L2 normalized)
 * combined with BM25 lexical scoring for hybrid retrieval.
 */

const VECTOR_DIM = 384;

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'did', 'do', 'does', 'doing', 'don',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
  'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me',
  'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  's', 'same', 'should', 'so', 'some', 'such', 't', 'than', 'that', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'you', 'your', 'yours', 'yourself', 'yourselves'
]);

// Simple deterministic hash function (FNV-1a 32-bit variant)
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0);
}

// Tokenize text into words and subword character n-grams
function tokenize(text) {
  if (!text) return [];
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = clean.split(/\s+/).filter((w) => w.length > 1);
  const tokens = [];

  for (const w of words) {
    if (!STOP_WORDS.has(w)) {
      tokens.push(w);
      // Add character 3-grams for subword matching (e.g. "volunt", "camp")
      if (w.length >= 4) {
        for (let i = 0; i <= w.length - 3; i++) {
          tokens.push(w.slice(i, i + 3));
        }
      }
    }
  }

  // Also include 2-word n-grams for phrase context (ignoring stopwords)
  const contentWords = words.filter((w) => !STOP_WORDS.has(w));
  for (let i = 0; i < contentWords.length - 1; i++) {
    tokens.push(`${contentWords[i]}_${contentWords[i + 1]}`);
  }

  return tokens;
}

// Extract content words for BM25 lexical matching
function extractContentWords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Create dense L2-normalized vector embedding
function createDenseEmbedding(text, idfMap = null) {
  const vec = new Float32Array(VECTOR_DIM);
  const tokens = tokenize(text);
  if (tokens.length === 0) return Array.from(vec);

  const tokenCounts = {};
  for (const t of tokens) {
    tokenCounts[t] = (tokenCounts[t] || 0) + 1;
  }

  for (const [token, count] of Object.entries(tokenCounts)) {
    const h = hashString(token);
    const index = h % VECTOR_DIM;
    const sign = ((h >>> 16) % 2 === 0) ? 1 : -1;
    
    // Sub-linear term frequency
    const tf = 1 + Math.log(count);
    const idf = (idfMap && idfMap[token]) ? idfMap[token] : 1.0;
    vec[index] += sign * tf * idf;
  }

  // L2 normalization
  let norm = 0;
  for (let i = 0; i < VECTOR_DIM; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < VECTOR_DIM; i++) {
      vec[i] /= norm;
    }
  }

  return Array.from(vec);
}

// Cosine similarity between two normalized vectors is their dot product
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
  }
  return dot;
}

// BM25 term overlap scoring for exact keywords
function computeBM25Score(queryWords, chunkWords, idfMap, avgDocLen) {
  if (!queryWords || queryWords.length === 0 || !chunkWords || chunkWords.length === 0) {
    return { score: 0, matchedWords: 0 };
  }
  const k1 = 1.5;
  const b = 0.75;
  const docLen = chunkWords.length;
  let score = 0;
  let matchedWords = 0;

  const chunkCounts = {};
  for (const w of chunkWords) {
    chunkCounts[w] = (chunkCounts[w] || 0) + 1;
  }

  for (const q of queryWords) {
    const tf = chunkCounts[q] || 0;
    if (tf > 0) {
      matchedWords++;
      const idf = idfMap[q] || 1.5;
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLen / avgDocLen));
      score += idf * (numerator / denominator);
    }
  }
  return { score, matchedWords };
}

const SYNONYMS = {
  motive: ['motto', 'aim', 'objective', 'purpose', 'philosophy', 'goal', 'nss'],
  motives: ['motto', 'aims', 'objectives', 'purpose', 'philosophy', 'nss'],
  started: ['launch', 'launched', 'history', '1969', 'origin', 'gandhi', 'background'],
  start: ['launch', 'history', '1969', 'origin', 'background'],
  began: ['launch', 'history', '1969'],
  origin: ['history', 'launch', '1969', 'background'],
  aim: ['objective', 'motto', 'purpose', 'philosophy', 'nss'],
  aims: ['objectives', 'motto', 'purpose', 'philosophy', 'nss'],
  goal: ['objective', 'aim', 'motto', 'purpose'],
  goals: ['objectives', 'aims', 'purpose'],
  purpose: ['aim', 'objective', 'motto', 'philosophy'],
  symbol: ['wheel', 'konark', 'sun', 'temple', 'badge', 'rath'],
  emblem: ['symbol', 'wheel', 'konark', 'badge', 'rath'],
  logo: ['symbol', 'badge', 'konark', 'wheel'],
  award: ['awards', 'cash', 'prize', 'trophy'],
  awards: ['award', 'cash', 'prize', 'trophy'],
  prize: ['award', 'cash', 'trophy'],
  join: ['enroll', 'enrollment', 'volunteer', 'eligibility', 'student'],
  joining: ['enroll', 'enrollment', 'volunteer', 'eligibility'],
  eligibility: ['volunteer', 'student', 'enroll', 'enrollment'],
  contact: ['address', 'phone', 'email', 'directorate', 'office'],
  location: ['address', 'contact', 'office', 'directorate'],
  headquarters: ['address', 'contact', 'office', 'directorate', 'delhi'],
  duration: ['hours', '120', '240', 'days', 'camp', 'year'],
};

function expandQueryWords(words) {
  const expanded = new Set(words);
  for (const w of words) {
    if (SYNONYMS[w]) {
      for (const syn of SYNONYMS[w]) {
        expanded.add(syn);
      }
    }
  }
  return Array.from(expanded);
}

class VectorStore {
  constructor() {
    this.chunks = [];
    this.idfMap = {};
    this.avgDocLen = 100;
  }

  /**
   * Initialize vector store with pre-computed chunks index
   */
  loadIndex(indexData) {
    if (!indexData || !Array.isArray(indexData.chunks)) {
      throw new Error('Invalid index data format');
    }
    this.chunks = indexData.chunks;
    this.idfMap = indexData.idfMap || {};
    this.avgDocLen = indexData.avgDocLen || 120;
    // Ensure all terms have a minimum IDF floor so domain keywords (like "nss") are not zeroed
    for (const [k, v] of Object.entries(this.idfMap)) {
      this.idfMap[k] = Math.max(0.8, v);
    }
    return this;
  }

  /**
   * Build index from raw chunk objects: [{ id, title, url, text }]
   */
  buildIndex(rawChunks) {
    const docCount = rawChunks.length;
    const dfMap = {};
    const processed = [];
    let totalLen = 0;

    // First pass: tokenization and document frequencies
    for (const chunk of rawChunks) {
      const fullText = chunk.text + ' ' + (chunk.title || '');
      const tokens = tokenize(fullText);
      const contentWords = extractContentWords(fullText);
      
      const uniqueTokens = new Set([...tokens, ...contentWords]);
      for (const t of uniqueTokens) {
        dfMap[t] = (dfMap[t] || 0) + 1;
      }
      totalLen += contentWords.length;
      processed.push({
        ...chunk,
        tokens,
        contentWords,
      });
    }

    this.avgDocLen = totalLen / (docCount || 1);

    // Compute IDF values: log((N - n + 0.5) / (n + 0.5) + 1) with minimum floor 0.8
    this.idfMap = {};
    for (const [token, df] of Object.entries(dfMap)) {
      const rawIdf = Math.log((docCount - df + 0.5) / (df + 0.5) + 1);
      this.idfMap[token] = Math.max(0.8, rawIdf);
    }

    // Second pass: compute dense embeddings
    this.chunks = processed.map((chunk) => {
      const embedding = createDenseEmbedding(
        chunk.text + ' ' + (chunk.title || ''),
        this.idfMap
      );
      return {
        id: chunk.id,
        title: chunk.title,
        url: chunk.url,
        text: chunk.text,
        embedding,
        tokens: chunk.tokens,
        contentWords: chunk.contentWords,
      };
    });

    return this.serialize();
  }

  /**
   * Serialize index for saving to JSON
   */
  serialize() {
    return {
      version: '1.1',
      totalChunks: this.chunks.length,
      createdAt: new Date().toISOString(),
      avgDocLen: this.avgDocLen,
      idfMap: this.idfMap,
      chunks: this.chunks.map((c) => ({
        id: c.id,
        title: c.title,
        url: c.url,
        text: c.text,
        embedding: c.embedding,
        tokens: c.tokens,
        contentWords: c.contentWords,
      })),
    };
  }

  /**
   * Hybrid retrieval search
   */
  search(query, options = {}) {
    const { topK = 4, minScore = 0.08 } = options;
    if (!query || this.chunks.length === 0) return [];

    const queryWords = extractContentWords(query);
    const expandedWords = expandQueryWords(queryWords);
    const queryEmbedding = createDenseEmbedding(
      query + ' ' + expandedWords.join(' '),
      this.idfMap
    );

    const scored = this.chunks.map((chunk) => {
      // Dense cosine similarity
      const cosScore = Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding));

      // BM25 lexical score using expanded words
      const chunkWords = chunk.contentWords || extractContentWords(chunk.text + ' ' + chunk.title);
      const { score: bm25Raw, matchedWords } = computeBM25Score(
        expandedWords,
        chunkWords,
        this.idfMap,
        this.avgDocLen
      );
      
      const bm25Score = expandedWords.length > 0
        ? Math.min(1.0, bm25Raw / (expandedWords.length * 1.8 + 0.1))
        : 0;

      // Hybrid combination (50% dense vector + 50% lexical)
      const combinedScore = (0.50 * cosScore) + (0.50 * bm25Score);

      return {
        chunk,
        score: combinedScore,
        cosScore,
        bm25Score,
        matchedWords,
        queryWordCount: queryWords.length,
      };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    const filtered = scored.filter((s) => s.score >= minScore);
    const topResults = (filtered.length > 0 ? filtered : scored).slice(0, topK);

    return topResults.map((r) => ({
      id: r.chunk.id,
      title: r.chunk.title,
      url: r.chunk.url,
      text: r.chunk.text,
      score: Number(r.score.toFixed(4)),
      cosScore: Number(r.cosScore.toFixed(4)),
      bm25Score: Number(r.bm25Score.toFixed(4)),
      matchedWords: r.matchedWords,
      queryWordCount: r.queryWordCount,
    }));
  }
}

module.exports = {
  VectorStore,
  createDenseEmbedding,
  cosineSimilarity,
  tokenize,
};
