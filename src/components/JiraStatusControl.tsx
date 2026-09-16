import { useEffect, useState } from "react";
import type { JiraTransition } from "../lib/jira";

interface JiraStatusControlProps {
  issueKey: string | null;
  status?: string | null;
  onLoad: (issueKey: string) => Promise<JiraTransition[]>;
  onTransition: (issueKey: string, transition: JiraTransition) => Promise<void>;
}

export function JiraStatusControl({
  issueKey,
  status,
  onLoad,
  onTransition,
}: JiraStatusControlProps) {
  const [transitions, setTransitions] = useState<JiraTransition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [currentStatus, setCurrentStatus] = useState(status ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrentStatus(status ?? "");
  }, [status]);

  useEffect(() => {
    let active = true;
    setTransitions([]);
    setSelectedId("");
    setMessage("");
    if (!issueKey) return;
    setBusy(true);
    const timer = window.setTimeout(() => {
      onLoad(issueKey)
        .then((items) => {
          if (active) setTransitions(items);
        })
        .catch((cause) => {
          if (active) setMessage(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [issueKey, onLoad]);

  if (!issueKey) return null;

  async function updateStatus() {
    const transition = transitions.find(({ id }) => id === selectedId);
    if (!transition) return;
    setBusy(true);
    setMessage("");
    try {
      await onTransition(issueKey!, transition);
      setCurrentStatus(transition.status);
      setSelectedId("");
      setTransitions(await onLoad(issueKey!));
      setMessage(`Updated ${issueKey} to ${transition.status}.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="jira-status-control" aria-label={`Jira status for ${issueKey}`}>
      <div>
        <span>Jira status</span>
        <strong>{currentStatus || "Current status unavailable"}</strong>
      </div>
      <select
        aria-label={`Change ${issueKey} status`}
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        disabled={busy || !transitions.length}
      >
        <option value="">{busy ? "Loading transitions…" : "Choose next status…"}</option>
        {transitions.map((transition) => (
          <option value={transition.id} key={transition.id}>
            {transition.status}{transition.name !== transition.status ? ` — ${transition.name}` : ""}
          </option>
        ))}
      </select>
      <button
        className="secondary-button"
        type="button"
        disabled={busy || !selectedId}
        onClick={() => void updateStatus()}
      >
        Update status
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
