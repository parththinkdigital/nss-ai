import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { VectorStore } from '@/lib/vector-store';
import { generateNssAnswer } from '@/lib/nvidia-nim';
import { searchWeb } from '@/lib/web-search';

// In-memory cached VectorStore instance
let cachedVectorStore = null;

function getVectorStore() {
  if (cachedVectorStore) return cachedVectorStore;

  const indexPath = path.join(process.cwd(), 'data', 'nss_index.json');
  if (!fs.existsSync(indexPath)) {
    throw new Error('NSS vector index not found. Please run: npm run scrape');
  }

  const rawData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const store = new VectorStore();
  store.loadIndex(rawData);
  cachedVectorStore = store;
  return cachedVectorStore;
}

/**
 * Clean conversational preambles to optimize search keywords
 */
function cleanSearchQuery(text) {
  return text
    .replace(/^(hi|hello|hey|namaste|pranam|good\s+(morning|afternoon|evening))\s*,?\s*/i, '')
    .replace(
      /^(can\s+you\s+(please\s+)?tell\s+me|please\s+tell\s+me|i\s+want\s+to\s+know|could\s+you\s+explain|what\s+do\s+you\s+know\s+about)\s*/i,
      ''
    )
    .trim();
}

/**
 * Check if the input is a brief greeting or pleasantry
 */
function isBriefGreeting(text) {
  const clean = text.trim().toLowerCase().replace(/[^\w\s]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  const greetings = ['hi', 'hello', 'hey', 'namaste', 'namaskar', 'pranam', 'greetings', 'hola', 'yo'];
  const timeGreetings = ['good morning', 'good afternoon', 'good evening', 'good day'];
  const thanks = ['thank you', 'thanks', 'thx', 'many thanks', 'dhanyawad', 'shukriya'];
  const identity = ['who are you', 'what are you', 'what can you do', 'tell me about yourself', 'help', 'help me'];

  if (words.length <= 4) {
    if (greetings.includes(words[0]) || timeGreetings.some((tg) => clean.startsWith(tg))) return true;
    if (thanks.some((t) => clean.includes(t))) return true;
    if (identity.some((id) => clean.includes(id))) return true;
    if (clean === 'how are you' || clean === 'how r u') return true;
  }
  return false;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { message, history = [] } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'A valid text message is required.' },
        { status: 400 }
      );
    }

    const trimmedMessage = message.trim();
    const store = getVectorStore();

    let finalChunks = [];
    let usedWebSearch = false;

    // Handle brief greetings or openers with comprehensive foundational NSS context
    if (isBriefGreeting(trimmedMessage)) {
      // Retrieve key overview chunks (Motto, Objectives, History, Regular Activities)
      const overviewResults = store.search('NSS National Service Scheme motto objectives philosophy history activities', {
        topK: 4,
        minScore: 0.1,
      });
      finalChunks = overviewResults.length > 0 ? overviewResults : store.chunks.slice(0, 4);
    } else {
      // Substantive user question: perform hybrid retrieval
      const cleanedQuery = cleanSearchQuery(trimmedMessage) || trimmedMessage;
      const effectiveVectorQuery = /\bnss\b/i.test(cleanedQuery)
        ? cleanedQuery
        : `NSS ${cleanedQuery}`;

      const retrievedChunks = store.search(effectiveVectorQuery, {
        topK: 4,
        minScore: 0.12,
      });

      const topMatch = retrievedChunks[0];
      const isLocalConfident =
        topMatch &&
        topMatch.score >= 0.55 &&
        topMatch.matchedWords >= 2 &&
        topMatch.matchedWords / (topMatch.queryWordCount || 1) >= 0.5;

      finalChunks = retrievedChunks;

      // If answer is not decisively covered in local chunks, let web search find it!
      if (!isLocalConfident || retrievedChunks.length === 0) {
        try {
          const webResults = await searchWeb(cleanedQuery || trimmedMessage);
          if (webResults && webResults.length > 0) {
            const webChunks = webResults.map((r, i) => ({
              id: `web-${i + 1}`,
              title: r.title,
              url: r.url,
              text: r.snippet,
            }));
            // Merge web chunks with any local chunks
            finalChunks = [...webChunks, ...retrievedChunks].slice(0, 5);
            usedWebSearch = true;
          }
        } catch (searchErr) {
          console.warn('[Web Search Fallback Error]:', searchErr.message);
        }
      }
    }

    // If neither local index nor live web search yielded any content
    if (!finalChunks || finalChunks.length === 0) {
      return NextResponse.json({
        answer:
          "I'm sorry, but official NSS documentation and verified public records do not provide information about this topic. My expertise is focused on the National Service Scheme (NSS), its volunteer programmes, guidelines, and youth community development.",
        sources: [
          {
            title: 'National Service Scheme (Official Portal)',
            url: 'https://nss.gov.in',
          },
        ],
        model: process.env.NVIDIA_MODEL || 'openai/gpt-oss-20b',
        isOutOfScope: true,
      });
    }

    // Call NVIDIA NIM API with the user's entire message and full context
    let response = await generateNssAnswer({
      question: trimmedMessage,
      contextChunks: finalChunks,
      history,
    });

    // Auto-recovery: If local chunks failed to answer and web search wasn't tried yet, search the web!
    const indicatesNotFound =
      response.answer.includes('could not find verified information') ||
      response.answer.includes('does not provide information') ||
      response.answer.includes('official NSS content does not provide');

    if (indicatesNotFound && !usedWebSearch) {
      try {
        const cleanedQuery = cleanSearchQuery(trimmedMessage) || trimmedMessage;
        const webResults = await searchWeb(cleanedQuery || trimmedMessage);
        if (webResults && webResults.length > 0) {
          const webChunks = webResults.map((r, i) => ({
            id: `web-${i + 1}`,
            title: r.title,
            url: r.url,
            text: r.snippet,
          }));
          const retryResponse = await generateNssAnswer({
            question: trimmedMessage,
            contextChunks: webChunks,
            history,
          });

          if (
            !retryResponse.answer.includes('could not find verified information') &&
            !retryResponse.answer.includes('does not provide information')
          ) {
            response = retryResponse;
            usedWebSearch = true;
          }
        }
      } catch (retryErr) {
        console.warn('[Web Search Auto-Recovery Error]:', retryErr.message);
      }
    }

    if (usedWebSearch) {
      response.searchSource = 'web_search';
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API /api/chat Error]:', error);
    return NextResponse.json(
      {
        error: 'Failed to process chat request.',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
