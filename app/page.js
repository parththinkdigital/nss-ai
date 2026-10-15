'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Trash2,
  ExternalLink,
  BookOpen,
  Award,
  Users,
  Compass,
  Phone,
  Clock,
  Check,
  Copy,
  AlertCircle,
} from 'lucide-react';
import MarkdownRenderer from '@/components/MarkdownRenderer';

const LOCAL_STORAGE_KEY = 'nss_chatbot_messages_v1';

const SUGGESTED_QUESTIONS = [
  {
    icon: Compass,
    label: 'Motto & Symbol',
    query: 'What is the motto, symbol, and badge of the NSS?',
  },
  {
    icon: Clock,
    label: '120-Hour Rule',
    query: 'What is the 120-hour requirement for NSS regular activities?',
  },
  {
    icon: Users,
    label: '7-Day Special Camp',
    query: 'How does the 7-day NSS Special Camping Programme work?',
  },
  {
    icon: Award,
    label: 'NSS Awards',
    query: 'What are the categories and cash prizes for National NSS Awards?',
  },
  {
    icon: BookOpen,
    label: 'Aims & Objectives',
    query: 'What are the main aims and objectives of the National Service Scheme?',
  },
  {
    icon: Phone,
    label: 'Directorate Contact',
    query: 'What is the contact address and email of the NSS Directorate?',
  },
];

const LOADING_WORDS = ['Thinking...', 'Gathering information...', 'Searching records...'];

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingWordIndex, setLoadingWordIndex] = useState(0);
  const [statusInfo, setStatusInfo] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Cycle loading words while waiting for response
  useEffect(() => {
    if (!isLoading) {
      setLoadingWordIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingWordIndex((prev) => (prev + 1) % LOADING_WORDS.length);
    }, 1200);
    return () => clearInterval(timer);
  }, [isLoading]);

  // Load chat history from localStorage on initial render
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load localStorage chat history:', e);
    }

    // Fetch system status
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => setStatusInfo(data))
      .catch((err) => console.warn('Status fetch error:', err));
  }, []);

  // Save chat history to localStorage whenever messages change
  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(messages));
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to save chat history to localStorage:', e);
    }
  }, [messages]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    setInput('');

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Build lightweight conversation history for API
      const historyPayload = newMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned error ${res.status}`);
      }

      const data = await res.json();

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'No response generated.',
        sources: data.sources || [],
        model: data.model || 'openai/gpt-oss-20b',
        mode: data.mode || 'default',
        isOutOfScope: Boolean(data.isOutOfScope),
        warning: data.warning || null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      const errorMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Connection Error:** Unable to connect to the NSS Chatbot service (${err.message}). Please check your connection or Railway deployment status.`,
        sources: [],
        isError: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setShowClearConfirm(false);
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Top National Header Bar */}
      <header className="sticky top-0 z-30 bg-[#0B2545] text-white shadow-md border-b border-amber-500/30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* NSS Logo / Emblem Badge */}
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 via-rose-600 to-blue-900 p-0.5 flex items-center justify-center shadow">
              <div className="w-full h-full bg-[#0B2545] rounded-full flex items-center justify-center text-amber-400 font-bold text-xs tracking-wider border border-amber-400/30">
                NSS
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base md:text-lg leading-tight tracking-tight text-white flex items-center gap-1.5">
                  NSS AI Chatbot
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-900/80 text-blue-200 border border-blue-700/60">
                  Govt. of India
                </span>
              </div>
              <p className="text-xs text-slate-300 hidden sm:block">
                National Service Scheme • Ministry of Youth Affairs & Sports
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                title="Clear Chat History"
                className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-rose-300 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-strip with official scheme status */}
        <div className="bg-[#081C33] border-t border-slate-800 text-[11px] text-slate-300 py-1.5 px-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>National Service Scheme (NSS)</span>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="hidden sm:inline">Motto: &quot;NOT ME BUT YOU&quot;</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <a
                href="https://nss.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-300 transition-colors flex items-center gap-1"
              >
                <span>nss.gov.in</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col justify-between">
        {/* Messages List Area */}
        <div className="flex-1 space-y-4 pb-4">
          {messages.length === 0 ? (
            /* Welcome / Zero State View */
            <div className="my-6 space-y-6">
              {/* Civic Hero Card */}
              <div className="bg-gradient-to-br from-white via-slate-50 to-blue-50/40 border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                <div className="flex items-center gap-3.5 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-blue-900 text-amber-400 flex items-center justify-center font-bold text-sm shadow">
                    NSS
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-[#0B2545]">
                      Welcome to the NSS AI Chatbot
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600">
                      Official information assistant for students, volunteers, and programme officers.
                    </p>
                  </div>
                </div>

                {/* Suggested Questions Grid */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Frequently Asked NSS Questions:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SUGGESTED_QUESTIONS.map((q, idx) => {
                      const IconComponent = q.icon;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(q.query)}
                          className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/50 text-left transition-all group shadow-xs"
                        >
                          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center shrink-0 group-hover:bg-[#0B2545] group-hover:text-amber-400 transition-colors">
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block text-xs font-semibold text-[#0B2545]">
                              {q.label}
                            </span>
                            <span className="block text-xs text-slate-500 truncate">
                              {q.query}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Message Thread */
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {/* Assistant Avatar */}
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-[#0B2545] text-amber-400 flex items-center justify-center text-xs font-bold shrink-0 shadow-sm border border-amber-400/20">
                    NSS
                  </div>
                )}

                {/* Message Bubble Container */}
                <div
                  className={`flex flex-col max-w-[88%] sm:max-w-[80%] rounded-2xl p-4 shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-[#0B2545] text-white rounded-tr-none'
                      : msg.isOutOfScope
                      ? 'bg-rose-50/90 border border-rose-200 text-slate-900 rounded-tl-none'
                      : msg.isError
                      ? 'bg-amber-50 border border-amber-300 text-slate-900 rounded-tl-none'
                      : 'bg-white border border-slate-200/90 text-slate-900 rounded-tl-none'
                  }`}
                >
                  {/* Role Header & Actions */}
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-black/5 text-xs text-slate-400">
                    <span className="font-semibold text-slate-500">
                      {msg.role === 'user' ? 'You' : 'NSS AI Chatbot'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]">{msg.timestamp}</span>
                      {msg.role === 'assistant' && (
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          title="Copy Answer"
                          className="hover:text-slate-700 p-0.5 transition-colors"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Body Content */}
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                  ) : (
                    <div className="space-y-3">
                      {/* Notice if out of scope */}
                      {msg.isOutOfScope && (
                        <div className="flex items-center gap-2 text-rose-700 text-xs font-semibold mb-1">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>Official Content Scope Notice</span>
                        </div>
                      )}

                      <MarkdownRenderer content={msg.content} />

                      {/* Source Citation Links */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <BookOpen className="w-3 h-3 text-blue-700" />
                            Official Sources & Citations:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.map((src, i) => (
                              <a
                                key={i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs transition-colors"
                              >
                                <span className="font-medium truncate max-w-[240px]">
                                  {src.title}
                                </span>
                                <ExternalLink className="w-3 h-3 text-blue-700 opacity-70 shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* User Avatar */}
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                    You
                  </div>
                )}
              </div>
            ))
          )}
          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-8 h-8 rounded-full bg-[#0B2545] text-amber-400 flex items-center justify-center text-xs font-bold shrink-0 shadow-sm animate-pulse">
                NSS
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-xs flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-2 h-2 rounded-full bg-blue-800 animate-bounce"></span>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {LOADING_WORDS[loadingWordIndex]}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="sticky bottom-0 pt-2 pb-1 bg-slate-50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 p-1.5 bg-white border border-slate-300 rounded-2xl shadow-sm focus-within:border-blue-700 focus-within:ring-2 focus-within:ring-blue-100 transition-all"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder="Ask any question about NSS (e.g. 120-hour rule, special camp, awards)..."
              className="flex-1 px-3 py-2 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#0B2545] text-white hover:bg-blue-900 disabled:opacity-40 disabled:hover:bg-[#0B2545] transition-all shadow-sm shrink-0"
              title="Send Message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Bottom Information Subtitle */}
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 px-2">
            <span>
              Official Portal:{' '}
              <a
                href="https://nss.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:text-blue-800 underline font-medium"
              >
                nss.gov.in
              </a>
            </span>
            <span>Ministry of Youth Affairs & Sports, Govt. of India</span>
          </div>
        </div>
      </main>

      {/* Confirmation Modal for Clearing History */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-slate-200">
            <h3 className="font-bold text-slate-900 text-base mb-1">Clear Chat History?</h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              This will remove all stored messages from your browser’s localStorage. This action cannot be
              undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors"
              >
                Yes, Clear History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
