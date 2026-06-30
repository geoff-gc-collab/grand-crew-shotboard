"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { dayAccentStyle } from "@/lib/color";
import { COLUMN_DEFS, DEFAULT_COLUMN_ORDER, columnDef } from "@/lib/columns";

const PALETTE = ["#5A8AC0", "#DD8A4D", "#6FAE8C", "#9B7FC7", "#D9714E", "#4FB3B0"];
const TAG_COLORS = ["#5A8AC0", "#DD8A4D", "#6FAE8C", "#9B7FC7", "#D9714E", "#4FB3B0", "#D9B65A", "#E899B8"];

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
  const columnOrder = project.columnOrder && project.columnOrder.length ? project.columnOrder : DEFAULT_COLUMN_ORDER;
  const visibleColumns = columnOrder.map(columnDef).filter(Boolean);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
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

  // ---- Row drag-and-drop reorder ----
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

  // ---- Project / day / column edits ----
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

  function handleColDragStart(e, key) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-column", key);
  }

  function handleColDrop(e, targetKey) {
    e.preventDefault();
    const draggedKey = e.dataTransfer.getData("application/x-column");
    if (!draggedKey || draggedKey === targetKey) return;
    const order = [...columnOrder];
    const from = order.indexOf(draggedKey);
    const to = order.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, draggedKey);
    setProject((prev) => ({ ...prev, columnOrder: order }));
    patchProject({ columnOrder: order });
  }

  function copySummary() {
    let text = `${project.name.toUpperCase()} — SHOT BOARD\n\n`;
    project.days.forEach((day) => {
      const daySceneList = scenes.filter((s) => s.dayId === day.id).sort((a, b) => a.order - b.order);
      text += `${day.label.toUpperCase()}\n${"—".repeat(40)}\n`;
      daySceneList.forEach((s) => {
        text += `[${s.num}] ${s.title}\n`;
        text += `  Location: ${s.location} · ${s.shotType}${s.intExt ? " · " + s.intExt : ""}${s.dayNight ? " · " + s.dayNight : ""}\n`;
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
    <div className="wrap wide">
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
          <button className="btn small" onClick={() => window.print()}>Print</button>
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

      <datalist id="dl-shotType">
        {columnDef("shotType").options.map((o) => <option key={o} value={o} />)}
      </datalist>
      <datalist id="dl-intExt">
        {columnDef("intExt").options.map((o) => <option key={o} value={o} />)}
      </datalist>
      <datalist id="dl-dayNight">
        {columnDef("dayNight").options.map((o) => <option key={o} value={o} />)}
      </datalist>

      <div className="grid-wrap">
        <div className="grid-header-row">
          <div className="gcell gpin-left" />
          {visibleColumns.map((col) => (
            <div
              key={col.key}
              className="gcell gcell-header"
              style={{ width: col.width }}
              draggable
              onDragStart={(e) => handleColDragStart(e, col.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleColDrop(e, col.key)}
              title="Drag to reorder column"
            >
              {col.label}
            </div>
          ))}
          <div className="gcell gpin-right" />
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
                className="grows"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDropOnDayEnd(e, day.id, daySceneList)}
              >
                {daySceneList.map((scene) => (
                  <GridRow
                    key={scene.id}
                    scene={scene}
                    columns={visibleColumns}
                    isDragging={dragId === scene.id}
                    onField={(field, value) => updateSceneField(scene.id, field, value)}
                    onDelete={() => deleteScene(scene)}
                    onDragStart={(e) => handleDragStart(e, scene.id)}
                    onDragEnd={() => setDragId(null)}
                    onDropOnCard={(e) => handleDropOnScene(e, scene, day.id, daySceneList)}
                  />
                ))}
                {daySceneList.length === 0 && (
                  <div className="empty-state">No scenes yet on this day. Drag a row here.</div>
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
      </div>

      <button className="add-day-btn" onClick={addDay}>+ Add another day</button>

      <div className="footer-note">
        Shared with anyone who has access to this tool — edits sync for everyone.<br />
        Drag the ⠿ handle to reorder rows, drag a column header to reorder columns.
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>
        <span>{toast}</span>
        {toast === "Scene removed" && <button onClick={undoDelete}>Undo</button>}
      </div>
    </div>
  );
}

function GridRow({ scene, columns, isDragging, onField, onDelete, onDragStart, onDragEnd, onDropOnCard }) {
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
    change("colorTag", { label: local.colorTag?.label || "", color });
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

  function renderCell(col) {
    switch (col.type) {
      case "textarea":
        return (
          <textarea
            className="gcell-textarea"
            value={local[col.key] || ""}
            onChange={(e) => change(col.key, e.target.value)}
            rows={2}
          />
        );
      case "datalist":
        return (
          <input
            className="gcell-input"
            list={`dl-${col.key}`}
            value={local[col.key] || ""}
            placeholder={col.label}
            onChange={(e) => change(col.key, e.target.value)}
          />
        );
      case "link":
        return (
          <div className="gcell-link-row">
            <input
              className="gcell-input"
              placeholder="https://…"
              value={local.ref || ""}
              onChange={(e) => change("ref", e.target.value)}
            />
            {local.ref && (
              <a className="gcell-link-open" href={local.ref} target="_blank" rel="noopener noreferrer">↗</a>
            )}
          </div>
        );
      case "images":
        return (
          <ImageGallery
            compact
            images={local.images || []}
            onChange={(images) => change("images", images)}
          />
        );
      case "colorTag":
        return (
          <div className="tag-picker-wrap" style={{ position: "relative" }}>
            <button
              className={`color-tag-chip ${local.colorTag ? "tag-set" : ""}`}
              style={local.colorTag ? { background: local.colorTag.color, color: "#0E1116" } : undefined}
              onClick={() => setTagPickerOpen((v) => !v)}
              title="Set color tag"
            >
              {local.colorTag ? (local.colorTag.label || "Tag") : "+ Tag"}
            </button>
            {tagPickerOpen && (
              <div className="tag-picker">
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
        );
      default:
        return (
          <input
            className="gcell-input"
            value={local[col.key] || ""}
            placeholder={col.key === "title" ? "Untitled scene" : ""}
            onChange={(e) => change(col.key, e.target.value)}
          />
        );
    }
  }

  return (
    <div
      className={`grow ${isDragging ? "dragging" : ""}`}
      style={{ borderLeftColor: local.colorTag?.color || "transparent" }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOnCard}
    >
      <div className="gcell gpin-left">
        <span className="drag-handle" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} title="Drag to reorder">
          ⠿
        </span>
      </div>
      {columns.map((col) => (
        <div key={col.key} className={`gcell gcell-${col.type}`} style={{ width: col.width }}>
          {renderCell(col)}
        </div>
      ))}
      <div className="gcell gpin-right">
        <button className="icon-btn danger" onClick={onDelete} title="Remove scene">✕</button>
      </div>
    </div>
  );
}

function ImageGallery({ images, onChange, compact }) {
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

  if (compact) {
    return (
      <div
        className={`gallery-compact ${dragOver ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {images.map((img) => (
          <div key={img.id} className="gallery-compact-thumb">
            <img src={img.url} alt="" />
            <button className="gallery-remove" onClick={() => removeImage(img.id)} title="Remove image">✕</button>
          </div>
        ))}
        <button
          className="gallery-compact-add"
          onClick={() => fileInputRef.current?.click()}
          title="Add image or GIF"
        >
          {uploading ? "…" : "+"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>
    );
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
