"use client";
import { useState } from "react";
import Link from "next/link";

export default function ProjectList({ initialProjects }) {
  const [projects, setProjects] = useState(initialProjects);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function createProject(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (json.project) {
      window.location.href = `/board/${json.project.id}`;
    }
  }

  async function deleteProject(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this project and all its scenes? This can't be undone.")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="wrap">
      <div className="head">
        <div className="head-title-row">
          <Slate />
          <div>
            <h1>Grand Crew</h1>
            <div className="sub">Shot Boards</div>
          </div>
        </div>
      </div>

      <div className="project-grid">
        {projects.map((p) => (
          <Link key={p.id} href={`/board/${p.id}`} className="project-card">
            <button className="delete-project" onClick={(e) => deleteProject(p.id, e)}>✕</button>
            <h3>{p.name}</h3>
            <div className="meta">{p.sceneCount} scene{p.sceneCount === 1 ? "" : "s"}</div>
            <div className="day-dots">
              {p.days.map((d) => (
                <span key={d.id} className="day-dot" style={{ background: d.color }} title={d.label} />
              ))}
            </div>
          </Link>
        ))}

        {creating ? (
          <form onSubmit={createProject} className="project-card" style={{ gap: 10 }}>
            <input
              autoFocus
              placeholder="Project name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => { if (!name.trim()) setCreating(false); }}
              style={{
                background: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 6,
                color: "var(--paper)", padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none",
              }}
            />
            <button type="submit" className="btn primary small">Create</button>
          </form>
        ) : (
          <button className="new-project-card" onClick={() => setCreating(true)}>+ New project</button>
        )}
      </div>

      <div className="footer-note">
        Shared with anyone who has access to this tool — changes sync for everyone.
      </div>
    </div>
  );
}

function Slate() {
  return (
    <svg className="slate-icon" viewBox="0 0 60 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="11" width="58" height="32" rx="3" fill="#1C222C" stroke="#5B616C" strokeWidth="1.5" />
      <path d="M1 14L13 1H21L11 14H1Z" fill="#F1EEE7" stroke="#5B616C" strokeWidth="1.2" />
      <path d="M19 14L31 1H39L29 14H19Z" fill="#1C222C" stroke="#5B616C" strokeWidth="1.2" />
      <path d="M37 14L49 1H57L47 14H37Z" fill="#F1EEE7" stroke="#5B616C" strokeWidth="1.2" />
    </svg>
  );
}
