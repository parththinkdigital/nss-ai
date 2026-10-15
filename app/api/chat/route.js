import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { VectorStore } from '@/lib/vector-store';
import { generateNssAnswer } from '@/lib/nvidia-nim';

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

    // Perform hybrid vector + BM25 retrieval
    const retrievedChunks = store.search(trimmedMessage, {
      topK: 4,
      minScore: 0.10,
    });

    // Guardrail: Check domain relevance
    // If no chunks match, or matched words ratio is very low, or score is too low
    const topMatch = retrievedChunks[0];
    const queryWordCount = topMatch ? (topMatch.queryWordCount || 1) : 1;
    const matchedWords = topMatch ? (topMatch.matchedWords || 0) : 0;
    const matchRatio = matchedWords / Math.max(1, queryWordCount);

    // Unrelated query detection:
    // 1. Zero matched content words
    // 2. Query has 3+ content words but matched ratio is < 40% (e.g. only matched common word like "home") and score < 0.35
    // 3. Top match score is below 0.20 and bm25Score is below 0.30
    const isOutOfDomain =
      !topMatch ||
      matchedWords === 0 ||
      (queryWordCount >= 3 && matchRatio < 0.40 && topMatch.score < 0.35) ||
      (queryWordCount >= 2 && matchedWords <= 1 && topMatch.score < 0.22 && topMatch.bm25Score < 0.30) ||
      topMatch.score < 0.16;

    if (isOutOfDomain) {
      return NextResponse.json({
        answer:
          "I'm sorry, but the official NSS content does not provide information about this topic. My knowledge is limited to official National Service Scheme documentation and public portals.",
        sources: [],
        model: process.env.NVIDIA_MODEL || 'openai/gpt-oss-20b',
        isOutOfScope: true,
      });
    }

    // Call NVIDIA NIM Muse Glimmer API
    const response = await generateNssAnswer({
      question: trimmedMessage,
      contextChunks: retrievedChunks,
      history,
    });

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
