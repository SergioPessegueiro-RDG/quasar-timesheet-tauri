import { useEffect } from "react";
import type { OutlookEvent } from "../lib/outlook";

interface OutlookGuideDialogProps {
  event: OutlookEvent;
  onClose: () => void;
}

function linkedText(value: string) {
  return value.split(/(https?:\/\/[^\s]+)/g).map((part, index) => (
    /^https?:\/\//.test(part)
      ? <a href={part} target="_blank" rel="noreferrer" key={`${part}-${index}`}>{part}</a>
      : part
  ));
}

export function OutlookGuideDialog({ event, onClose }: OutlookGuideDialogProps) {
  useEffect(() => {
    const close = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(mouseEvent) => {
      if (mouseEvent.target === mouseEvent.currentTarget) onClose();
    }}>
      <section className="dialog compact-dialog outlook-guide-dialog" role="dialog" aria-modal="true">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Outlook calendar guide</p>
            <h2>{event.title}</h2>
          </div>
        </div>
        <dl>
          <div>
            <dt>Date</dt>
            <dd>{event.date}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{event.startTime}–{event.endTime}</dd>
          </div>
        </dl>
        <div className="outlook-guide-notes">
          <strong>Meeting information</strong>
          <p>{event.notes ? linkedText(event.notes) : "No additional meeting information was included."}</p>
        </div>
        <footer className="dialog-actions">
          <span />
          <span />
          <span />
          <button className="primary-button" type="button" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>
  );
}
