"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { currencySymbol } from "@/lib/currency";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function DashboardChat({ locale = DEFAULT_LOCALE, variant = "business", currency = "EUR" }: { locale?: Locale; variant?: "business" | "personal"; currency?: string }) {
  const tr = translator(locale);
  const SUGGEST = variant === "personal"
    ? [tr("chat.psuggest1"), tr("chat.psuggest2"), tr("chat.psuggest3"), tr("chat.psuggest4")]
    : [tr("chat.suggest1"), tr("chat.suggest2"), tr("chat.suggest3"), tr("chat.suggest4")];
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.messages)) setMessages(d.messages as Msg[]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages, loading]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    const history = messages;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setRemaining(0);
        setMessages((m) => [
          ...m,
          { role: "assistant", content: tr("chat.limitReached") },
        ]);
        return;
      }
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer ?? data.error ?? tr("chat.error") },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: tr("chat.netError") }]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  async function newChat() {
    if (loading) return;
    try {
      await fetch("/api/chat", { method: "DELETE" });
    } catch {
    }
    setMessages([]);
    setInput("");
    setRemaining(null);
  }

  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  });
  useEffect(() => {
    const handler = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q === "string") void askRef.current(q);
    };
    window.addEventListener("zori:ask", handler);
    return () => window.removeEventListener("zori:ask", handler);
  }, []);

  return (
    <>
      <div className="chat-bar">
        <button
          type="button"
          className="chat-new"
          onClick={() => void newChat()}
          disabled={loading || messages.length === 0}
          title={tr("chat.newChatTitle")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          {tr("chat.newChat")}
        </button>
      </div>

      <div className="chat-scroll">
        <div className="chat" ref={chatRef}>
          {historyLoaded && messages.length === 0 && (
            <div className="chat-intro">
              <span className="chat-intro-ic">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5V6" /><circle cx="12" cy="2.6" r="1.15" fill="currentColor" stroke="none" /><rect x="4" y="6" width="16" height="12" rx="3.5" /><path d="M2 11v3M22 11v3" /><circle cx="9.2" cy="12.2" r="1.25" fill="currentColor" stroke="none" /><circle cx="14.8" cy="12.2" r="1.25" fill="currentColor" stroke="none" /></svg>
              </span>
              <div className="chat-intro-title">{tr("chat.introTitle")}</div>
              <div className="chat-intro-body">{tr("chat.emptyHint")}</div>
              <span className="chat-intro-cur" title={tr("chat.currencyLabel")}>
                <b>{currencySymbol(currency)}</b> {currency}
              </span>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`bubble ${m.role === "user" ? "b-user" : "b-ai"}`}
              style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}
            >
              {m.role === "assistant" && <div className="who"><span className="d" />Zori</div>}
              {m.content}
            </div>
          ))}
          {loading && (
            <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>{tr("chat.typing")}</div>
          )}
        </div>
      </div>

      <div className="suggest">
        {SUGGEST.map((s) => (
          <button key={s} type="button" onClick={() => void ask(s)} disabled={loading}>
            {s}
          </button>
        ))}
      </div>

      <form className="chat-input" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tr("chat.placeholder")}
        />
        <button type="submit" className="send" disabled={loading || !input.trim()} aria-label={tr("chat.send")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4z" /></svg>
        </button>
      </form>

      {remaining !== null && remaining >= 0 && (
        <div className="cap" style={{ marginTop: 8 }}>
          {remaining > 0
            ? tr("chat.remaining", { n: remaining })
            : tr("chat.exhausted")}
        </div>
      )}
    </>
  );
}
