/**
 * Client for NVIDIA NIM Muse Glimmer API (meta/muse-glimmer-30b)
 * Supports OpenAI-compatible endpoint with strict NSS grounding.
 */

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

const SYSTEM_PROMPT = `You are the official NSS (National Service Scheme, Government of India) Information Assistant.
Your sole purpose is to provide accurate, factual, and helpful information about the National Service Scheme (Ministry of Youth Affairs & Sports) based STRICTLY and ONLY on the provided NSS context chunks.

MANDATORY RULES:
1. ONLY answer using facts provided in the "Official NSS Context" section below.
2. If the user question CANNOT be answered from the provided context, or if the question is unrelated to the National Service Scheme (NSS), you MUST respond with:
"I'm sorry, but the official NSS content does not provide information about this topic. My knowledge is limited to official National Service Scheme documentation and public portals."
3. Do NOT invent, assume, or extrapolate information beyond what is stated in the context.
4. When you provide an answer, cite the relevant sources in markdown format using the provided Titles and URLs, for example: [Page Title](https://nss.gov.in/...).
5. Keep your tone polite, formal, encouraging, and clear. Format key points using bullet points for readability.`;

/**
 * Generate answer using NVIDIA NIM Muse Glimmer API
 * @param {Object} params
 * @param {string} params.question User question
 * @param {Array} params.contextChunks Retrieved vector store chunks
 * @param {Array} params.history Previous conversation messages
 */
async function generateNssAnswer({ question, contextChunks, history = [] }) {
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

  // If no API key is configured in Railway environment variables, provide direct retrieval synthesis
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
    content: `Official NSS Context:
====================
${contextText}
====================

User Question: ${question}

Please answer the user question based strictly on the official NSS context provided above. Always include markdown source links with the exact URLs from the context. If the context does not contain the answer, reply with the standard fallback message.`,
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
        max_tokens: 2048,
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
        "I'm sorry, but the official NSS content does not provide information about this topic. My knowledge is limited to official National Service Scheme documentation and public portals.",
      sources: [],
      model: `${model} (Direct Retrieval)`,
      mode: 'no_match',
    };
  }

  // Synthesize answer directly from highest-scoring chunks
  const topChunk = contextChunks[0];
  const otherChunks = contextChunks.slice(1, 3);

  let synthesized = `According to the official **${topChunk.title}** ([Source](${topChunk.url})):\n\n${topChunk.text}`;

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
