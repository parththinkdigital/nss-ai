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

const NSS_DOMAIN_REGEX = /\b(nss|national service scheme|scheme|programme|program|motto|motive|motives|aim|aims|objective|objectives|symbol|badge|camp|camping|volunteer|volunteers|volunteering|activity|activities|hours|award|awards|prize|trophy|advisory|directorate|gandhi|ministry|youth|service|enroll|enrollment|tenure|certificate|wheel|konark|sun temple)\b/i;

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

    // Check domain relevance
    const isDomainQuery = NSS_DOMAIN_REGEX.test(trimmedMessage);
    const hasHistory = Array.isArray(history) && history.length > 0;

    // Guardrail: If message does not mention any NSS domain terms and is not a conversational follow-up
    if (!isDomainQuery && !hasHistory) {
      return NextResponse.json({
        answer:
          "I'm sorry, but the official NSS content does not provide information about this topic. My knowledge is limited to official National Service Scheme documentation and public portals.",
        sources: [],
        model: process.env.NVIDIA_MODEL || 'openai/gpt-oss-20b',
        isOutOfScope: true,
      });
    }

    // Enhance search query for vector retrieval if needed
    const effectiveSearchQuery = isDomainQuery
      ? (/\bnss\b/i.test(trimmedMessage) ? trimmedMessage : `NSS ${trimmedMessage}`)
      : `NSS ${trimmedMessage}`;

    // Perform hybrid vector + BM25 retrieval
    const retrievedChunks = store.search(effectiveSearchQuery, {
      topK: 4,
      minScore: 0.12,
    });

    const topMatch = retrievedChunks[0];
    const isLocalConfident = topMatch && topMatch.score >= 0.45;

    let finalChunks = retrievedChunks;
    let usedWebSearch = false;

    // If answer is not clearly found or covered in local index, search the live web!
    if (!isLocalConfident) {
      try {
        const webResults = await searchWeb(trimmedMessage);
        if (webResults && webResults.length > 0) {
          const webChunks = webResults.map((r, i) => ({
            id: `web-${i + 1}`,
            title: r.title,
            url: r.url,
            text: r.snippet,
          }));
          finalChunks = [...webChunks, ...retrievedChunks].slice(0, 5);
          usedWebSearch = true;
        }
      } catch (searchErr) {
        console.warn('[Web Search Fallback Error]:', searchErr.message);
      }
    }

    // If query has no domain terms and neither local nor web returned relevant NSS content, reject
    if (!isDomainQuery && (!topMatch || topMatch.matchedWords === 0 || topMatch.score < 0.22) && !usedWebSearch) {
      return NextResponse.json({
        answer:
          "I'm sorry, but the official NSS content does not provide information about this topic. My knowledge is limited to official National Service Scheme documentation and public portals.",
        sources: [],
        model: process.env.NVIDIA_MODEL || 'openai/gpt-oss-20b',
        isOutOfScope: true,
      });
    }

    if (finalChunks.length === 0) {
      return NextResponse.json({
        answer:
          "I'm sorry, but the official NSS content does not provide information about this topic. My knowledge is limited to official National Service Scheme documentation and public portals.",
        sources: [],
        model: process.env.NVIDIA_MODEL || 'openai/gpt-oss-20b',
        isOutOfScope: true,
      });
    }

    // Call NVIDIA NIM API
    const response = await generateNssAnswer({
      question: trimmedMessage,
      contextChunks: finalChunks,
      history,
    });

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
