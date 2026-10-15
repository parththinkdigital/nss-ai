/**
 * Client for NVIDIA NIM API (openai/gpt-oss-20b)
 * Fast, grounded responses with official NSS documentation and live web search.
 */

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

const SYSTEM_PROMPT = `You are the official NSS (National Service Scheme, Government of India) AI Chatbot.
Your purpose is to provide accurate, helpful, friendly, and swift responses to students, volunteers, programme officers, and citizens.

INSTRUCTIONS:
1. Read the user's entire message carefully and address all parts of their query.
2. If the user includes a greeting, pleasantry, or introductory comment, acknowledge it warmly and naturally before providing the substantive answer.
3. Use the provided context (official NSS pages and verified public records) to give factually accurate, structured, and insightful answers.
4. Use bullet points, bold key terms, and concise paragraphs so information is easy and fast to read.
5. Always cite relevant sources using clickable markdown links with the exact URLs provided in the context (e.g. [Page Title](URL)).
6. If the provided context does not contain sufficient details to answer, politely explain what is known from NSS records or state that verified records do not cover that topic.`;

function ensureEnvLoaded() {
  if (!process.env.NVIDIA_API_KEY) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match && !process.env[match[1]]) {
            process.env[match[1]] = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
          }
        }
      }
    } catch (_) {}
  }
}

/**
 * Generate answer using NVIDIA NIM API
 * @param {Object} params
 * @param {string} params.question User question
 * @param {Array} params.contextChunks Retrieved vector store chunks & web results
 * @param {Array} params.history Previous conversation messages
 */
async function generateNssAnswer({ question, contextChunks, history = [] }) {
  ensureEnvLoaded();
  const apiKey = process.env.NVIDIA_API_KEY;
  const baseUrl = (process.env.NVIDIA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.NVIDIA_MODEL || DEFAULT_MODEL;

  // Format context block with source URLs
  const contextText = contextChunks
    .map(
      (c, i) =>
        `[Chunk ${i + 1}] Source: "${c.title}"\nURL: ${c.url}\nContent:\n${c.text}`
    )
    .join('\n\n---\n\n');

  // If no API key is configured, provide direct retrieval synthesis
  if (!apiKey || apiKey === 'YOUR_NVIDIA_API_KEY_HERE') {
    return generateFallbackRetrievalAnswer({ question, contextChunks, model });
  }

  // Format messages array
  const formattedMessages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
  ];

  // Include recent history (last 4 turns) for conversational continuity
  if (Array.isArray(history) && history.length > 0) {
    const recent = history.slice(-4);
    for (const msg of recent) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        formattedMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }
  }

  // Add the current user prompt with context
  formattedMessages.push({
    role: 'user',
    content: `Official NSS Context & Verified Records:
====================
${contextText}
====================

User Message: ${question}

Instructions:
Please address the user's entire message thoroughly and quickly based on the official context above.
- Acknowledge any greeting warmly and naturally.
- Deliver clear, well-structured facts using bullet points and bold highlights.
- Include markdown source links with the exact URLs from the context.`,
  });

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'NSS-Chatbot/1.0 (Next.js; Railway)',
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        temperature: 0.2,
        max_tokens: 1024,
        top_p: 0.95,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[NVIDIA NIM Error] Status ${res.status}:`, errText);
      throw new Error(`NVIDIA NIM API responded with ${res.status}: ${errText}`);
    }

    const json = await res.json();
    const msg = json?.choices?.[0]?.message;
    const answer =
      msg?.content && msg.content.trim()
        ? msg.content.trim()
        : msg?.reasoning_content?.trim() || msg?.reasoning?.trim() || '';

    // Collect distinct sources
    const sources = getDistinctSources(contextChunks);

    return {
      answer,
      sources,
      model,
      mode: 'nvidia_nim_live',
    };
  } catch (err) {
    console.warn(`[NVIDIA NIM Fallback] Falling back due to API error: ${err.message}`);
    const fallback = generateFallbackRetrievalAnswer({ question, contextChunks, model });
    fallback.warning = `NVIDIA NIM API call failed (${err.message}). Displaying grounded retrieval answer.`;
    return fallback;
  }
}

/**
 * Direct grounded retrieval answer synthesis when NVIDIA_API_KEY is not yet supplied
 */
function generateFallbackRetrievalAnswer({ question, contextChunks, model }) {
  const sources = getDistinctSources(contextChunks);

  if (!contextChunks || contextChunks.length === 0) {
    return {
      answer:
        "I'm sorry, but official NSS documentation and verified public records do not provide information about this topic. My expertise is focused on the National Service Scheme (NSS), its volunteer programmes, guidelines, and youth community development.",
      sources: [
        {
          title: 'National Service Scheme (Official Portal)',
          url: 'https://nss.gov.in',
        },
      ],
      model: `${model} (Direct Retrieval)`,
      mode: 'no_match',
    };
  }

  // Synthesize answer directly from highest-scoring chunks
  const topChunk = contextChunks[0];
  const otherChunks = contextChunks.slice(1, 3);

  let synthesized = `According to official **${topChunk.title}** ([Source](${topChunk.url})):\n\n${topChunk.text}`;

  if (otherChunks.length > 0) {
    for (const c of otherChunks) {
      synthesized += `\n\n**Additional details from [${c.title}](${c.url}):**\n${c.text}`;
    }
  }

  return {
    answer: synthesized,
    sources,
    model,
    mode: 'retrieval_direct',
  };
}

function getDistinctSources(chunks) {
  const seen = new Set();
  const sources = [];
  for (const c of chunks) {
    if (c.url && !seen.has(c.url)) {
      seen.add(c.url);
      sources.push({
        title: c.title,
        url: c.url,
      });
    }
  }
  return sources;
}

module.exports = {
  generateNssAnswer,
  SYSTEM_PROMPT,
};
