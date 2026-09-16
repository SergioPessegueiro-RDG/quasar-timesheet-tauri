import { useEffect, useState } from "react";
import { PROJECT_COLORS } from "../lib/constants";
import type { Project } from "../lib/types";

interface ProjectDialogProps {
  project: Project;
  onClose: () => void;
  onSave: (project: Project) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function ProjectDialog({ project, onClose, onSave, onDelete }: ProjectDialogProps) {
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ ...project, name: name.trim(), color });
    onClose();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="dialog project-dialog" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Edit project</p>
            <h2>{project.name}</h2>
          </div>
        </header>
        <label>
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
        </label>
        <fieldset className="color-picker">
          <legend>Colour</legend>
          {PROJECT_COLORS.map((option) => (
            <button
              type="button"
              key={option}
              className={color === option ? "is-selected" : ""}
              style={{ background: option }}
              aria-label={`Use ${option}`}
              onClick={() => setColor(option)}
            />
          ))}
        </fieldset>
        <footer className="dialog-actions">
          <button className="danger-button" type="button" onClick={onDelete}>Delete project</button>
          <span />
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save project"}</button>
        </footer>
      </form>
    </div>
  );
}
