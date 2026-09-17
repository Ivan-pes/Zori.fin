import type { FeedEvent } from "@/lib/metrics/calendar";
import { translator } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

const ICONS: Record<FeedEvent["tone"], React.ReactNode> = {
  green: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>,
  amber: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>,
  red: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>,
  gray: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="9" /></svg>,
};

export function EventFeed({ events, locked, locale = DEFAULT_LOCALE }: { events: FeedEvent[]; locked?: boolean; locale?: Locale }) {
  const tr = translator(locale);
  return (
    <div className="panel feed">
      <div className="panel-head"><h3>{tr("feed.title")}</h3><span className="mut">{tr("feed.realtime")}</span></div>
      {locked ? (
        <div className="note info">
          <svg className="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span>{tr("feed.locked")}</span>
        </div>
      ) : events.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: 13.5 }}>{tr("feed.empty")}</p>
      ) : (
        events.map((e, i) => (
          <div className="alert" key={i}>
            <div className={`ai ${e.tone}`}>{ICONS[e.tone]}</div>
            <div className="ac">
              <b>{e.title}</b>
              <p>{e.body}</p>
              <div className="t">{e.when}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
