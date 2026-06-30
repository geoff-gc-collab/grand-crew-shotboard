"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { dayAccentStyle } from "@/lib/color";

const PALETTE = ["#5A8AC0", "#DD8A4D", "#6FAE8C", "#9B7FC7", "#D9714E", "#4FB3B0"];

function isImageUrl(url) {
  return /\.(jpe?g|png|gif|webp|avif)(\?.*)?$/i.test(url || "");
}

async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export default function ShotBoard({ initialProject, initialScenes }) {
  const [project, setProject] = useState(initialProject);
  const [scenes, setScenes] = useState(initialScenes);
  const [filter, setFilter] = useState("all");
  const [openIds, setOpenIds] = useState(new Set());
  const [collapsedDays, setCollapsedDays] = useState(new Set());
  const [swatchOpenFor, setSwatchOpenFor] = useState(null);
  const [status, setStatus] = useState("saved");
  const [toast, setToast] = useState(null);
  const [dragId, setDragId] = useState(null);
  const lastDeletedRef = useRef(null);
  const toastTimerRef = useRef(null);
  const patchTimers = useRef({});
  const pendingFields = useRef({});

  const projectId = project.id;

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }

  function toggleOpen(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleDayCollapsed(dayId) {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      next.has(dayId) ? next.delete(dayId) : next.add(dayId);
      return next;
    });
  }

  // ---- Scene field edits (debounced PATCH per scene) ----
  function updateSceneField(sceneId, field, value) {
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, [field]: value } : s)));
    pendingFields.current[sceneId] = { ...(pendingFields.current[sceneId] || {}), [field]: value };
    setStatus("saving");
    clearTimeout(patchTimers.current[sceneId]);
    patchTimers.current[sceneId] = setTimeout(() => flushScene(sceneId), 500);
  }

  async function flushScene(sceneId) {
    const fields = pendingFields.current[sceneId];
    if (!fields) return;
    delete pendingFields.current[sceneId];
    try {
      await fetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      setStatus("saved");
    } catch (e) {
      setStatus("error");
    }
  }

  async function moveScene(scene, dir) {
    const dayScenes = scenes.filter((s) => s.dayId === scene.dayId).sort((a, b) => a.order - b.order);
    const idx = dayScenes.findIndex((s) => s.id === scene.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= dayScenes.length) return;
    const a = dayScenes[idx];
    const b = dayScenes[swapIdx];
    setScenes((prev) =>
      prev.map((s) => {
        if (s.id === a.id) return { ...s, order: b.order };
        if (s.id === b.id) return { ...s, order: a.order };
        return s;
      })
    );
    setStatus("saving");
    try {
      await fetch(`/api/projects/${projectId}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moveDir: dir }),
      });
      setStatus("saved");
    } catch (e) {
      setStatus("error");
    }
  }

  // ---- Drag-and-drop reorder ----
  async function reorderDay(dayId, orderedIds) {
    setScenes((prev) => {
      const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
      return prev.map((s) => (orderMap.has(s.id) ? { ...s, dayId, order: orderMap.get(s.id) } : s));
    });
    setStatus("saving");
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorderDay: { dayId, orderedIds } }),
      });
      setStatus("saved");
    } catch (e) {
      setStatus("error");
    }
  }

  function handleDragStart(e, sceneId) {
    setDragId(sceneId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", sceneId);
  }

  function handleDropOnScene(e, targetScene, dayId, daySceneList) {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === targetScene.id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const currentIds = daySceneList.map((s) => s.id).filter((id) => id !== draggedId);
    const targetIdx = currentIds.indexOf(targetScene.id);
    const insertAt = before ? targetIdx : targetIdx + 1;
    currentIds.splice(insertAt, 0, draggedId);
    reorderDay(dayId, currentIds);
    setDragId(null);
  }

  function handleDropOnDayEnd(e, dayId, daySceneList) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    const currentIds = daySceneList.map((s) => s.id).filter((id) => id !== draggedId);
    currentIds.push(draggedId);
    reorderDay(dayId, currentIds);
    setDragId(null);
  }

  async function changeSceneDay(scene, dayId) {
    setScenes((prev) => prev.map((s) => (s.id === scene.id ? { ...s, dayId } : s)));
    setStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId }),
      });
      const json = await res.json();
      if (json.scene) {
        setScenes((prev) => prev.map((s) => (s.id === scene.id ? json.scene : s)));
      }
      setStatus("saved");
    } catch (e) {
      setStatus("error");
    }
  }

  async function addScene(dayId) {
    setStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId }),
      });
      const json = await res.json();
      if (json.scene) {
        setScenes((prev) => [...prev, json.scene]);
        setOpenIds((prev) => new Set(prev).add(json.scene.id));
        setCollapsedDays((prev) => {
          const next = new Set(prev);
          next.delete(dayId);
          return next;
        });
      }
      setStatus("saved");
    } catch (e) {
      setStatus("error");
    }
  }

  async function deleteScene(scene) {
    setScenes((prev) => prev.filter((s) => s.id !== scene.id));
    lastDeletedRef.current = scene;
    showToast("Scene removed");
    setStatus("saving");
    try {
      await fetch(`/api/projects/${projectId}/scenes/${scene.id}`, { method: "DELETE" });
      setStatus("saved");
    } catch (e) {
      setStatus("error");
    }
  }

  async function undoDelete() {
    const scene = lastDeletedRef.current;
    if (!scene) return;
    lastDeletedRef.current = null;
    setToast(null);
    setStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId: scene.dayId, restore: scene }),
      });
      const json = await res.json();
      if (json.scene) setScenes((prev) => [...prev, json.scene]);
      setStatus("saved");
    } catch (e) {
      setStatus("error");
    }
  }

  // ---- Project / day edits ----
  async function patchProject(body) {
    setStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.project) setProject(json.project);
      setStatus("saved");
    } catch (e) {
      setStatus("error");
    }
  }

  function renameProject(name) {
    setProject((prev) => ({ ...prev, name }));
  }
  function renameProjectBlur(name) {
    patchProject({ name });
  }

  function renameDay(dayId, label) {
    setProject((prev) => ({
      ...prev,
      days: prev.days.map((d) => (d.id === dayId ? { ...d, label } : d)),
    }));
  }
  function renameDayBlur(dayId, label) {
    patchProject({ renameDay: { dayId, label } });
  }

  function recolorDay(dayId, color) {
    setProject((prev) => ({
      ...prev,
      days: prev.days.map((d) => (d.id === dayId ? { ...d, color } : d)),
    }));
    setSwatchOpenFor(null);
    patchProject({ recolorDay: { dayId, color } });
  }

  async function addDay() {
    await patchProject({ addDay: `Day ${project.days.length + 1}` });
  }

  async function removeDay(dayId) {
    const hasScenes = scenes.some((s) => s.dayId === dayId);
    if (hasScenes) {
      showToast("Move or delete that day's scenes first");
      return;
    }
    if (!confirm("Remove this day from the board?")) return;
    await patchProject({ removeDay: dayId });
  }

  function copySummary() {
    let text = `${project.name.toUpperCase()} — SHOT BOARD\n\n`;
    project.days.forEach((day) => {
      const daySceneList = scenes.filter((s) => s.dayId === day.id).sort((a, b) => a.order - b.order);
      text += `${day.label.toUpperCase()}\n${"—".repeat(40)}\n`;
      daySceneList.forEach((s) => {
        text += `[${s.num}] ${s.title}\n`;
        text += `  Location: ${s.location} · ${s.shotType}\n`;
        if (s.talent) text += `  Talent: ${s.talent}\n`;
        if (s.extras) text += `  Extras: ${s.extras}\n`;
        if (s.notes) text += `  Notes: ${s.notes}\n`;
        if (s.desc) text += `  ${s.desc}\n`;
        text += "\n";
      });
    });
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("Copied to clipboard"))
      .catch(() => showToast("Could not copy — select and copy manually"));
  }

  const visibleDays = project.days.filter((d) => filter === "all" || filter === d.id);

  return (
    <div className="wrap">
      <Link href="/" className="back-link">&larr; All projects</Link>

      <div className="head">
        <div className="head-title-row">
          <div>
            <input
              className="head-name-input"
              value={project.name}
              onChange={(e) => renameProject(e.target.value)}
              onBlur={(e) => renameProjectBlur(e.target.value)}
              style={{
                fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em", background: "transparent",
                border: "none", color: "var(--paper)", outline: "none", fontFamily: "inherit", padding: 0, width: "100%",
              }}
            />
            <div className="sub">Shot Board</div>
          </div>
        </div>
        <div className="head-actions">
          <div className="status">
            <span className={`dot ${status}`} />
            <span>{status === "saving" ? "Saving…" : status === "error" ? "Save failed" : "Saved"}</span>
          </div>
          <button className="btn small" onClick={copySummary}>Copy summary</button>
        </div>
      </div>

      <div className="filters">
        <button className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          All scenes
        </button>
        {project.days.map((d) => (
          <button key={d.id} className={`chip ${filter === d.id ? "active" : ""}`} onClick={() => setFilter(d.id)}>
            {d.label}
          </button>
        ))}
      </div>

      {visibleDays.map((day) => {
        const daySceneList = scenes.filter((s) => s.dayId === day.id).sort((a, b) => a.order - b.order);
        const collapsed = collapsedDays.has(day.id);
        return (
          <div key={day.id} className={`day ${collapsed ? "collapsed" : ""}`} style={dayAccentStyle(day.color)}>
            <div className="day-header" onClick={() => toggleDayCollapsed(day.id)}>
              <div className="day-header-left">
                <span className="day-tag">{day.label.split(" ")[0] === "Day" ? day.label.split(" ").slice(0, 2).join(" ") : "Day"}</span>
                <input
                  className="day-title"
                  value={day.label}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => renameDay(day.id, e.target.value)}
                  onBlur={(e) => renameDayBlur(day.id, e.target.value)}
                />
                <span className="day-count">{daySceneList.length} scene{daySceneList.length === 1 ? "" : "s"}</span>
              </div>
              <div className="day-controls" onClick={(e) => e.stopPropagation()}>
                <div style={{ position: "relative" }}>
                  <button
                    className="icon-btn"
                    title="Recolor"
                    onClick={() => setSwatchOpenFor(swatchOpenFor === day.id ? null : day.id)}
                  >
                    ●
                  </button>
                  {swatchOpenFor === day.id && (
                    <div
                      className="swatch-row"
                      style={{
                        position: "absolute", top: 28, right: 0, background: "var(--ink-3)",
                        border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", zIndex: 5,
                      }}
                    >
                      {PALETTE.map((c) => (
                        <button
                          key={c}
                          className={`color-swatch ${day.color === c ? "active" : ""}`}
                          style={{ background: c }}
                          onClick={() => recolorDay(day.id, c)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <button className="icon-btn danger" title="Remove day" onClick={() => removeDay(day.id)}>✕</button>
                <span className="chev">▾</span>
              </div>
            </div>

            <div
              className="cards"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnDayEnd(e, day.id, daySceneList)}
            >
              {daySceneList.map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  isOpen={openIds.has(scene.id)}
                  days={project.days}
                  isDragging={dragId === scene.id}
                  onToggle={() => toggleOpen(scene.id)}
                  onField={(field, value) => updateSceneField(scene.id, field, value)}
                  onMove={(dir) => moveScene(scene, dir)}
                  onDayChange={(dayId) => changeSceneDay(scene, dayId)}
                  onDelete={() => deleteScene(scene)}
                  onDragStart={(e) => handleDragStart(e, scene.id)}
                  onDragEnd={() => setDragId(null)}
                  onDropOnCard={(e) => handleDropOnScene(e, scene, day.id, daySceneList)}
                  canMoveUp={daySceneList.indexOf(scene) > 0}
                  canMoveDown={daySceneList.indexOf(scene) < daySceneList.length - 1}
                />
              ))}
              {daySceneList.length === 0 && (
                <div className="empty-state">No scenes yet on this day. Drag a card here.</div>
              )}
            </div>

            <div className="add-row">
              <button className="add-scene-btn" onClick={() => addScene(day.id)}>
                + Add scene to {day.label}
              </button>
            </div>
          </div>
        );
      })}

      <button className="add-day-btn" onClick={addDay}>+ Add another day</button>

      <div className="footer-note">
        Shared with anyone who has access to this tool — edits sync for everyone.<br />
        Click a scene to expand it. Fields save automatically.
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>
        <span>{toast}</span>
        {toast === "Scene removed" && <button onClick={undoDelete}>Undo</button>}
      </div>
    </div>
  );
}

const TAG_COLORS = ["#5A8AC0", "#DD8A4D", "#6FAE8C", "#9B7FC7", "#D9714E", "#4FB3B0", "#D9B65A", "#E899B8"];

function SceneCard({
  scene, isOpen, days, isDragging, onToggle, onField, onMove, onDayChange, onDelete,
  onDragStart, onDragEnd, onDropOnCard, canMoveUp, canMoveDown,
}) {
  const [local, setLocal] = useState(scene);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  useEffect(() => {
    setLocal(scene);
  }, [scene.id]);

  function change(field, value) {
    setLocal((prev) => ({ ...prev, [field]: value }));
    onField(field, value);
  }

  function setColorTag(color) {
    const next = { label: local.colorTag?.label || "", color };
    change("colorTag", next);
  }

  function setColorTagLabel(label) {
    if (!local.colorTag) return;
    change("colorTag", { ...local.colorTag, label });
  }

  function clearColorTag() {
    setLocal((prev) => ({ ...prev, colorTag: null }));
    onField("colorTag", null);
    setTagPickerOpen(false);
  }

  return (
    <div
      className={`card ${isDragging ? "dragging" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOnCard}
    >
      <div className="card-row" onClick={(e) => {
        if (e.target.closest(".card-title") || e.target.closest(".card-controls") || e.target.closest(".tag-picker-wrap")) return;
        onToggle();
      }}>
        <span
          className="drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder"
        >
          ⠿
        </span>
        <span className={`scene-tag ${local.num === "—" ? "empty" : ""}`}>{local.num}</span>
        <div className="card-title">
          <input
            value={local.title}
            placeholder="Untitled scene"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => change("title", e.target.value)}
          />
        </div>
        <div className="tag-picker-wrap" style={{ position: "relative" }}>
          <button
            className="color-tag-chip"
            style={local.colorTag ? { background: local.colorTag.color, color: "#0E1116" } : undefined}
            onClick={(e) => { e.stopPropagation(); setTagPickerOpen((v) => !v); }}
            title="Set color tag"
          >
            {local.colorTag ? (local.colorTag.label || "Tag") : "+ Tag"}
          </button>
          {tagPickerOpen && (
            <div className="tag-picker" onClick={(e) => e.stopPropagation()}>
              <input
                className="tag-label-input"
                placeholder="Label, e.g. Neutral"
                value={local.colorTag?.label || ""}
                onChange={(e) => setColorTagLabel(e.target.value)}
              />
              <div className="swatch-row">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`color-swatch ${local.colorTag?.color === c ? "active" : ""}`}
                    style={{ background: c }}
                    onClick={() => setColorTag(c)}
                  />
                ))}
              </div>
              {local.colorTag && (
                <button className="tag-clear" onClick={clearColorTag}>Clear tag</button>
              )}
            </div>
          )}
        </div>
        <div className="card-meta">
          {local.location && <span className="pill">{truncate(local.location, 22)}</span>}
          {local.shotType && <span className="pill">{local.shotType}</span>}
        </div>
        <div className="card-controls">
          <button className="icon-btn" disabled={!canMoveUp} onClick={() => onMove(-1)} title="Move up">↑</button>
          <button className="icon-btn" disabled={!canMoveDown} onClick={() => onMove(1)} title="Move down">↓</button>
          <button className="icon-btn danger" onClick={onDelete} title="Remove scene">✕</button>
        </div>
      </div>

      {isOpen && (
        <div className="card-body">
          <div className="grid2">
            <div className="field">
              <label>Scene #</label>
              <input value={local.num} onChange={(e) => change("num", e.target.value)} />
            </div>
            <div className="field">
              <label>Shot type</label>
              <input value={local.shotType} onChange={(e) => change("shotType", e.target.value)} />
            </div>
            <div className="field full">
              <label>Location</label>
              <input value={local.location} onChange={(e) => change("location", e.target.value)} />
            </div>
            {days.length > 1 && (
              <div className="field full">
                <label>Day</label>
                <select value={scene.dayId} onChange={(e) => onDayChange(e.target.value)}>
                  {days.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>Talent</label>
              <input value={local.talent} onChange={(e) => change("talent", e.target.value)} />
            </div>
            <div className="field">
              <label>Extras</label>
              <input value={local.extras} onChange={(e) => change("extras", e.target.value)} />
            </div>
            <div className="field">
              <label>Wardrobe</label>
              <input value={local.wardrobe} onChange={(e) => change("wardrobe", e.target.value)} />
            </div>
            <div className="field">
              <label>Notes</label>
              <input value={local.notes} onChange={(e) => change("notes", e.target.value)} />
            </div>
            <div className="field full">
              <label>Shot description</label>
              <textarea value={local.desc} onChange={(e) => change("desc", e.target.value)} />
            </div>
            <div className="field full">
              <label>Reference images</label>
              <ImageGallery
                images={local.images || []}
                onChange={(images) => change("images", images)}
              />
            </div>
            <div className="field">
              <label>Shot reference (link)</label>
              <div className="ref-row">
                <input
                  placeholder="https://…"
                  value={local.ref}
                  onChange={(e) => change("ref", e.target.value)}
                />
                {local.ref && (
                  <a className="ref-link" href={local.ref} target="_blank" rel="noopener noreferrer">open ↗</a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function ImageGallery({ images, onChange }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(uploadFile));
      onChange([...images, ...uploaded.map((u) => ({ id: u.publicId, url: u.url }))]);
    } catch (e) {
      // upload failed silently; user can retry
    } finally {
      setUploading(false);
    }
  }

  function removeImage(id) {
    onChange(images.filter((img) => img.id !== id));
  }

  return (
    <div>
      <div
        className={`gallery-drop ${dragOver ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        onPaste={(e) => handleFiles(e.clipboardData?.files)}
        tabIndex={0}
      >
        {uploading ? "Uploading…" : "Drop images or GIFs here, or click to choose"}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>
      {images.length > 0 && (
        <div className="gallery-grid">
          {images.map((img) => (
            <div key={img.id} className="gallery-thumb">
              <img src={img.url} alt="" />
              <button
                className="gallery-remove"
                onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                title="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
