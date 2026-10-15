'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';

/**
 * Lightweight, safe Markdown renderer for NSS Chatbot responses
 * Handles bold, italics, headers, lists, code, blockquotes, and [text](url) links.
 */
export default function MarkdownRenderer({ content = '' }) {
  if (!content) return null;

  // Split into paragraphs / lines
  const lines = content.split('\n');
  const renderedElements = [];
  let inList = false;
  let listItems = [];
  let inBlockquote = false;
  let blockquoteLines = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      renderedElements.push(
        <ul key={`ul-${renderedElements.length}`} className="my-2 ml-5 list-disc space-y-1 text-slate-800">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  const flushBlockquote = () => {
    if (inBlockquote && blockquoteLines.length > 0) {
      renderedElements.push(
        <blockquote
          key={`quote-${renderedElements.length}`}
          className="my-3 border-l-4 border-amber-500 bg-amber-50/70 p-3 text-slate-700 rounded-r-md text-sm italic"
        >
          {blockquoteLines.map((line, idx) => (
            <p key={idx}>{renderInline(line)}</p>
          ))}
        </blockquote>
      );
      blockquoteLines = [];
      inBlockquote = false;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Check for unordered list item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      flushBlockquote();
      inList = true;
      const textOnly = trimmed.replace(/^[-*]\s+|\d+\.\s+/, '');
      listItems.push(textOnly);
      return;
    } else {
      flushList();
    }

    // Check for blockquote
    if (trimmed.startsWith('>')) {
      inBlockquote = true;
      blockquoteLines.push(trimmed.replace(/^>\s*/, ''));
      return;
    } else {
      flushBlockquote();
    }

    // Empty line
    if (!trimmed) {
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      renderedElements.push(
        <h4 key={index} className="text-base font-bold text-slate-900 mt-4 mb-1">
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      renderedElements.push(
        <h3 key={index} className="text-lg font-bold text-slate-900 mt-4 mb-2">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      renderedElements.push(
        <h2 key={index} className="text-xl font-bold text-slate-900 mt-5 mb-2">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    // Standard paragraph
    renderedElements.push(
      <p key={index} className="my-2 leading-relaxed text-slate-800">
        {renderInline(trimmed)}
      </p>
    );
  });

  flushList();
  flushBlockquote();

  return <div className="space-y-1 text-sm md:text-base">{renderedElements}</div>;
}

// Parses inline bold, italics, code, and [links](url)
function renderInline(text) {
  if (!text) return null;

  // Regex for links [title](url)
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts = [];
  let lastIdx = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(renderFormattedText(text.substring(lastIdx, match.index)));
    }
    const linkTitle = match[1];
    const linkUrl = match[2];
    parts.push(
      <a
        key={`link-${match.index}`}
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2 transition-colors mx-0.5"
      >
        <span>{linkTitle}</span>
        <ExternalLink className="w-3 h-3 inline opacity-70" />
      </a>
    );
    lastIdx = linkRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(renderFormattedText(text.substring(lastIdx)));
  }

  return parts;
}

// Helper to format **bold**, *italics*, and `code`
function renderFormattedText(text) {
  // Simple token parser for **bold** and `code`
  const chunks = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);

  return chunks.map((chunk, i) => {
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-950">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    if (chunk.startsWith('`') && chunk.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-rose-700 border border-slate-200"
        >
          {chunk.slice(1, -1)}
        </code>
      );
    }
    if (chunk.startsWith('*') && chunk.endsWith('*')) {
      return (
        <em key={i} className="italic text-slate-800">
          {chunk.slice(1, -1)}
        </em>
      );
    }
    return chunk;
  });
}
