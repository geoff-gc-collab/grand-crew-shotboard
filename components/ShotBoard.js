"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { dayAccentStyle } from "@/lib/color";
import { DEFAULT_COLUMN_ORDER, FIXED_COLUMN_TYPES, buildColumnDefs } from "@/lib/columns";

const PALETTE = ["#5A8AC0", "#DD8A4D", "#6FAE8C", "#9B7FC7", "#D9714E", "#4FB3B0"];
const TAG_COLORS = ["#5A8AC0", "#DD8A4D", "#6FAE8C", "#9B7FC7", "#D9714E", "#4FB3B0", "#D9B65A", "#E899B8"];
const COLUMN_TYPE_OPTIONS = [
  { value: "image", label: "Visual (16:9 image)" },
  { value: "text", label: "Long text" },
  { value: "dropdown", label: "Dropdown" },
];

async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

function columnFlexStyle(col) {
  if (FIXED_COLUMN_TYPES.includes(col.type)) {
    return { flex: `0 0 ${col.width}px`, width: col.width };
  }
  return { flex: `1 1 ${col.width}px`, minWidth: Math.round(col.width * 0.55) };
}

// ---- Timing helpers ("9:00 AM" / "9:00" <-> minutes since midnight) ----
function timeToMinutes(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})(?::?(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function minutesToLabel(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatRange(start, end) {
  if (start == null) return "—";
  return end != null && end !== start ? `${minutesToLabel(start)} – ${minutesToLabel(end)}` : minutesToLabel(start);
}

// Walks a day's rows in order, cascading start times forward: each row's
// start = previous row's end, unless the row has a pinned timeAnchor, which
// resets the cascade from that point. A row's own timeDuration (default 20)
// determines its end, and therefore the next row's start — so editing any
// row's duration (or pinning a new start) live-recalculates everything after
// it on the next render, without a one-shot bulk-fill action.
function computeTimingForDay(daySceneList) {
  let cursor = null;
  const map = new Map();
  daySceneList.forEach((s) => {
    if (s.timeAnchor) {
      const t = timeToMinutes(s.timeAnchor);
      if (t != null) cursor = t;
    }
    const start = cursor;
    const duration = typeof s.timeDuration === "number" ? s.timeDuration : 20;
    const end = start != null ? start + duration : null;
    map.set(s.id, { start, end });
    if (end != null) cursor = end;
  });
  return map;
}

const MARKER_TYPE_META = {
  call: { label: "Crew Call", color: "#5A8AC0" },
  meal: { label: "Meal", color: "#6FAE8C" },
  move: { label: "Location Move", color: "#DD8A4D" },
  note: { label: "Note", color: "#8B9099" },
};

export default function ShotBoard({ initialProject, initialScenes }) {
  const [project, setProject] = useState(initialProject);
  const [scenes, setScenes] = useState(initialScenes);
  const [filter, setFilter] = useState("all");
  const [collapsedDays, setCollapsedDays] = useState(new Set());
  const [swatchOpenFor, setSwatchOpenFor] = useState(null);
  const [status, setStatus] = useState("saved");
  const [toast, setToast] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [colFormOpen, setColFormOpen] = useState(false);
  const [colLabel, setColLabel] = useState("");
  const [colType, setColType] = useState("text");
  const [colOptions, setColOptions] = useState("");
  const lastDeletedRef = useRef(null);
  const toastTimerRef = useRef(null);
  const patchTimers = useRef({});
  const pendingFields = useRef({});

  const projectId = project.id;
  const allColumns = buildColumnDefs(project);
  const columnByKey = new Map(allColumns.map((c) => [c.key, c]));
  const columnOrder = project.columnOrder && project.columnOrder.length ? project.columnOrder : DEFAULT_COLUMN_ORDER;
  const visibleColumns = columnOrder.map((k) => columnByKey.get(k)).filter(Boolean);

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
  function updateSceneField(sceneId, field, value, custom) {
    setScenes((prev) =>
      prev.map((s) => {
        if (s.id !== sceneId) return s;
        return custom ? { ...s, customFields: { ...(s.customFields || {}), [field]: value } } : { ...s, [field]: value };
      })
    );
    const entry = pendingFields.current[sceneId] || {};
    if (custom) {
      entry.customFields = { ...(entry.customFields || {}), [field]: value };
    } else {
      entry[field] = value;
    }
    pendingFields.current[sceneId] = entry;
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

  // Rows accept two kinds of drops: another row (reorder) or a color swatch
  // dragged from the legend (recolor that row, overriding the day color).
  function handleRowDrop(e, scene, dayId, daySceneList) {
    if (e.dataTransfer.types.includes("application/x-tag-color")) {
      e.preventDefault();
      e.stopPropagation();
      const val = e.dataTransfer.getData("application/x-tag-color");
      if (val === "__clear__") {
        updateSceneField(scene.id, "colorTag", null);
      } else {
        updateSceneField(scene.id, "colorTag", { label: "", color: val });
      }
      return;
    }
    handleDropOnScene(e, scene, dayId, daySceneList);
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
    if (e.dataTransfer.types.includes("application/x-tag-color")) return;
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    const currentIds = daySceneList.map((s) => s.id).filter((id) => id !== draggedId);
    currentIds.push(draggedId);
    reorderDay(dayId, currentIds);
    setDragId(null);
  }

  // New rows have no pinned anchor, so they automatically continue the
  // day's cascade from wherever the previous row left off — no manual fill needed.
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

  async function addMarker(dayId) {
    setStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, kind: "marker" }),
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

  function pinStartTime(scene, timingInfo) {
    const guess = timingInfo?.start != null ? minutesToLabel(timingInfo.start) : "9:00 AM";
    const input = window.prompt("Start time for this row (e.g. 9:00 AM):", guess);
    if (input === null) return;
    if (input.trim() === "") {
      updateSceneField(scene.id, "timeAnchor", "", false);
      return;
    }
    const mins = timeToMinutes(input);
    if (mins == null) {
      showToast("Couldn't read that time — try e.g. 9:00 AM");
      return;
    }
    updateSceneField(scene.id, "timeAnchor", minutesToLabel(mins), false);
  }

  function clearStartTime(scene) {
    updateSceneField(scene.id, "timeAnchor", "", false);
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

  function toggleAutoNumber() {
    const next = !project.autoNumber;
    setProject((prev) => ({ ...prev, autoNumber: next }));
    patchProject({ autoNumber: next });
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

  // Every pinned row breaks the cascade at that point — pin too many and
  // duration edits stop propagating. This resets a day back to one cascade.
  function clearAllPins(dayId, daySceneList) {
    const pinned = daySceneList.filter((s) => s.timeAnchor);
    if (!pinned.length) {
      showToast("No pinned times on this day");
      return;
    }
    if (!confirm(`Clear ${pinned.length} pinned start time${pinned.length === 1 ? "" : "s"} on this day? The schedule will cascade from the first row only.`)) return;
    pinned.forEach((s) => updateSceneField(s.id, "timeAnchor", "", false));
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

  function submitAddColumn() {
    if (!colLabel.trim()) return;
    const body = { addColumn: { label: colLabel.trim(), type: colType } };
    if (colType === "dropdown") {
      body.addColumn.options = colOptions.split(",").map((s) => s.trim()).filter(Boolean);
    }
    patchProject(body);
    setColLabel("");
    setColType("text");
    setColOptions("");
    setColFormOpen(false);
  }

  function removeColumn(key) {
    if (!confirm("Remove this column? Its data will no longer be shown (existing values are kept on each scene, but hidden).")) return;
    patchProject({ removeColumn: { key } });
  }

  function copySummary() {
    let text = `${project.name.toUpperCase()} — SHOT BOARD\n\n`;
    project.days.forEach((day) => {
      const daySceneList = scenes.filter((s) => s.dayId === day.id).sort((a, b) => a.order - b.order);
      const timingMap = computeTimingForDay(daySceneList);
      text += `${day.label.toUpperCase()}\n${"—".repeat(40)}\n`;
      daySceneList.forEach((s) => {
        const t = timingMap.get(s.id);
        const timeLabel = t ? formatRange(t.start, t.end) : "";
        if (s.kind === "marker") {
          const meta = MARKER_TYPE_META[s.markerType] || MARKER_TYPE_META.note;
          text += `\n— ${timeLabel !== "—" ? timeLabel + " " : ""}${meta.label.toUpperCase()}${s.label ? ": " + s.label : ""} —\n\n`;
          return;
        }
        text += `[${s.num}]${timeLabel !== "—" ? " " + timeLabel : ""} ${s.title}\n`;
        text += `  Location: ${s.location} · ${s.shotType}${s.dayNightIntExt ? " · " + s.dayNightIntExt : ""}\n`;
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

  const autoNumberMap = new Map();
  if (project.autoNumber) {
    let n = 1;
    project.days.forEach((day) => {
      scenes
        .filter((s) => s.dayId === day.id)
        .sort((a, b) => a.order - b.order)
        .forEach((s) => autoNumberMap.set(s.id, n++));
    });
  }

  const datalistColumns = visibleColumns.filter((c) => c.type === "datalist" && c.options && c.options.length);

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
          <button
            className={`btn small ${project.autoNumber ? "primary" : ""}`}
            onClick={() => toggleAutoNumber()}
            title="Auto-number renumbers scenes by row position. Off lets you set scene numbers manually (e.g. matching a script's non-sequential numbering)."
          >
            Auto #: {project.autoNumber ? "On" : "Off"}
          </button>
          <button className="btn small" onClick={copySummary}>Copy summary</button>
          <button className="btn small" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <div className="filters-row">
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

        <div className="tag-legend">
          <span className="tag-legend-label">Color key — drag onto a row:</span>
          {TAG_COLORS.map((c) => (
            <div
              key={c}
              className="tag-swatch-drag"
              style={{ background: c }}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("application/x-tag-color", c)}
              title="Drag onto a row to recolor it"
            />
          ))}
          <div
            className="tag-swatch-drag clear"
            draggable
            onDragStart={(e) => e.dataTransfer.setData("application/x-tag-color", "__clear__")}
            title="Drag onto a row to reset it to the day color"
          >
            ⊘
          </div>
        </div>
      </div>

      {datalistColumns.map((col) => (
        <datalist key={col.key} id={`dl-${col.key}`}>
          {col.options.map((o) => <option key={o} value={o} />)}
        </datalist>
      ))}

      <div className="grid-wrap">
        <div className="grid-header-row">
          <div className="gcell gpin-left" />
          {visibleColumns.map((col) => (
            <div
              key={col.key}
              className="gcell gcell-header"
              style={columnFlexStyle(col)}
              draggable
              onDragStart={(e) => handleColDragStart(e, col.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleColDrop(e, col.key)}
              title="Drag to reorder column"
            >
              <span>{col.label}</span>
              {col.custom && (
                <button
                  className="col-remove"
                  onClick={(e) => { e.stopPropagation(); removeColumn(col.key); }}
                  title="Remove column"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="gcell gpin-right" style={{ position: "relative" }}>
            <button className="icon-btn" title="Add column" onClick={() => setColFormOpen((v) => !v)}>+</button>
            {colFormOpen && (
              <div className="col-form">
                <input
                  className="tag-label-input"
                  placeholder="Column name"
                  value={colLabel}
                  onChange={(e) => setColLabel(e.target.value)}
                  autoFocus
                />
                <select className="col-form-select" value={colType} onChange={(e) => setColType(e.target.value)}>
                  {COLUMN_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {colType === "dropdown" && (
                  <input
                    className="tag-label-input"
                    placeholder="Options, comma separated"
                    value={colOptions}
                    onChange={(e) => setColOptions(e.target.value)}
                  />
                )}
                <button className="btn small primary" onClick={submitAddColumn}>Add column</button>
              </div>
            )}
          </div>
        </div>

        {visibleDays.map((day) => {
          const daySceneList = scenes.filter((s) => s.dayId === day.id).sort((a, b) => a.order - b.order);
          const timingMap = computeTimingForDay(daySceneList);
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
                  <button
                    className="icon-btn"
                    title="Clear all pinned start times on this day, so the schedule cascades from the first row"
                    onClick={() => clearAllPins(day.id, daySceneList)}
                  >
                    📍✕
                  </button>
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
                  scene.kind === "marker" ? (
                    <MarkerRow
                      key={scene.id}
                      scene={scene}
                      timing={timingMap.get(scene.id)}
                      isDragging={dragId === scene.id}
                      onField={(field, value) => updateSceneField(scene.id, field, value, false)}
                      onPinStart={() => pinStartTime(scene, timingMap.get(scene.id))}
                      onClearStart={() => clearStartTime(scene)}
                      onDelete={() => deleteScene(scene)}
                      onDragStart={(e) => handleDragStart(e, scene.id)}
                      onDragEnd={() => setDragId(null)}
                      onDropOnCard={(e) => handleRowDrop(e, scene, day.id, daySceneList)}
                    />
                  ) : (
                    <GridRow
                      key={scene.id}
                      scene={scene}
                      columns={visibleColumns}
                      isDragging={dragId === scene.id}
                      autoNumber={project.autoNumber ? autoNumberMap.get(scene.id) : null}
                      timing={timingMap.get(scene.id)}
                      onField={(field, value) => updateSceneField(scene.id, field, value, false)}
                      onCustomField={(key, value) => updateSceneField(scene.id, key, value, true)}
                      onPinStart={() => pinStartTime(scene, timingMap.get(scene.id))}
                      onClearStart={() => clearStartTime(scene)}
                      onDelete={() => deleteScene(scene)}
                      onDragStart={(e) => handleDragStart(e, scene.id)}
                      onDragEnd={() => setDragId(null)}
                      onDropOnCard={(e) => handleRowDrop(e, scene, day.id, daySceneList)}
                    />
                  )
                ))}
                {daySceneList.length === 0 && (
                  <div className="empty-state">No scenes yet on this day. Drag a row here.</div>
                )}
              </div>

              <div className="add-row">
                <button className="add-scene-btn" onClick={() => addScene(day.id)}>
                  + Add scene to {day.label}
                </button>
                <button className="add-marker-btn" onClick={() => addMarker(day.id)}>
                  + Add production row (call, meal, move…)
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button className="add-day-btn" onClick={addDay}>+ Add another day</button>

      <div className="footer-note">
        Shared with anyone who has access to this tool — edits sync for everyone.<br />
        Drag the ⠿ handle to reorder rows, drag a column header to reorder columns, drag a color swatch onto a row to tag it.
        Pin a start time on any row to reset the schedule from there — everything after it recalculates automatically.
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>
        <span>{toast}</span>
        {toast === "Scene removed" && <button onClick={undoDelete}>Undo</button>}
      </div>
    </div>
  );
}

// Reads/writes go straight through the live `scene` prop (the parent updates
// its `scenes` array synchronously on every edit), so every row always shows
// current data even when another row's action changes it (auto-fill timing,
// drag-and-drop color tags, etc.) — no local mirror to go stale.
// Shared by GridRow and MarkerRow: shows the computed start–end (cascaded
// from prior rows), an editable duration in minutes, and pin/clear controls
// for anchoring this row's start time and breaking the cascade from here.
function TimingCell({ scene, timing, onField, onPinStart, onClearStart }) {
  const [menuPos, setMenuPos] = useState(null); // {top, left} in viewport coords, or null when closed
  const pinned = !!scene.timeAnchor;

  function openMenuAt(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.left });
  }

  return (
    <div className="timing-cell" onContextMenu={(e) => { e.preventDefault(); openMenuAt(e); }}>
      {pinned && <span className="timing-pin" title={`Pinned to ${scene.timeAnchor}`}>📍</span>}
      <button
        className="timing-range"
        onClick={(e) => (menuPos ? setMenuPos(null) : openMenuAt(e))}
        title="Click to pin/clear this row's start time, or right-click anywhere in the cell"
      >
        {formatRange(timing?.start, timing?.end)}
      </button>
      <input
        className="timing-duration"
        type="number"
        min={0}
        step={5}
        value={typeof scene.timeDuration === "number" ? scene.timeDuration : 20}
        title="Duration in minutes — changing it reflows every row after this one"
        onChange={(e) => onField("timeDuration", Math.max(0, parseInt(e.target.value, 10) || 0))}
      />
      <span className="timing-duration-suffix">m</span>
      {menuPos && (
        <>
          <div className="timing-menu-backdrop" onClick={() => setMenuPos(null)} />
          <div className="timing-menu" style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}>
            <button onClick={() => { setMenuPos(null); onPinStart(); }}>
              {pinned ? "Edit pinned start time…" : "Pin start time here…"}
            </button>
            {pinned && (
              <button onClick={() => { setMenuPos(null); onClearStart(); }}>
                Clear pin (rejoin cascade)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function GridRow({ scene, columns, isDragging, autoNumber, timing, onField, onCustomField, onPinStart, onClearStart, onDelete, onDragStart, onDragEnd, onDropOnCard }) {
  function renderCell(col) {
    switch (col.type) {
      case "textarea": {
        const val = col.custom ? (scene.customFields?.[col.key] || "") : (scene[col.key] || "");
        const onChangeVal = (v) => (col.custom ? onCustomField(col.key, v) : onField(col.key, v));
        return (
          <textarea
            className="gcell-textarea"
            value={val}
            onChange={(e) => onChangeVal(e.target.value)}
          />
        );
      }
      case "datalist": {
        const val = col.custom ? (scene.customFields?.[col.key] || "") : (scene[col.key] || "");
        const onChangeVal = (v) => (col.custom ? onCustomField(col.key, v) : onField(col.key, v));
        return (
          <input
            className="gcell-input"
            list={`dl-${col.key}`}
            value={val}
            placeholder={col.label}
            onChange={(e) => onChangeVal(e.target.value)}
          />
        );
      }
      case "timing":
        return (
          <TimingCell scene={scene} timing={timing} onField={onField} onPinStart={onPinStart} onClearStart={onClearStart} />
        );
      case "image": {
        const isCustom = !!col.custom;
        const value = isCustom ? (scene.customFields?.[col.key] || null) : ((scene.images && scene.images[0]) || null);
        const setValue = (img) => (isCustom ? onCustomField(col.key, img) : onField("images", img ? [img] : []));
        return <SingleImageCell image={value} onChange={setValue} />;
      }
      case "num":
        if (autoNumber != null) {
          return <div className="gcell-readonly" title="Auto-numbered by row position">{autoNumber}</div>;
        }
        return (
          <input
            className="gcell-input"
            value={scene.num || ""}
            onChange={(e) => onField("num", e.target.value)}
          />
        );
      default:
        // Plain text fields wrap onto multiple lines within the fixed row
        // height (and scroll internally) instead of clipping at one line.
        return (
          <textarea
            className="gcell-textarea"
            value={scene[col.key] || ""}
            placeholder={col.key === "title" ? "Untitled scene" : ""}
            onChange={(e) => onField(col.key, e.target.value)}
          />
        );
    }
  }

  return (
    <div
      className={`grow ${isDragging ? "dragging" : ""}`}
      style={{ borderLeftColor: scene.colorTag?.color || "transparent" }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOnCard}
    >
      <div className="gcell gpin-left">
        <span className="drag-handle" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} title="Drag to reorder">
          ⠿
        </span>
      </div>
      {columns.map((col) => (
        <div key={col.key} className={`gcell gcell-${col.type}`} style={columnFlexStyle(col)}>
          {renderCell(col)}
        </div>
      ))}
      <div className="gcell gpin-right">
        <button className="icon-btn danger" onClick={onDelete} title="Remove scene">✕</button>
      </div>
    </div>
  );
}

// Full-width production banner (crew call, meals, location moves, notes) —
// a quick-read line for the whole crew, distinct from the per-shot grid rows.
function MarkerRow({ scene, timing, isDragging, onField, onPinStart, onClearStart, onDelete, onDragStart, onDragEnd, onDropOnCard }) {
  const meta = MARKER_TYPE_META[scene.markerType] || MARKER_TYPE_META.note;
  return (
    <div
      className={`marker-row ${isDragging ? "dragging" : ""}`}
      style={{ "--marker-color": meta.color }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOnCard}
    >
      <span className="drag-handle" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} title="Drag to reorder">
        ⠿
      </span>
      <select
        className="marker-type-select"
        value={scene.markerType}
        onChange={(e) => onField("markerType", e.target.value)}
      >
        {Object.entries(MARKER_TYPE_META).map(([key, m]) => (
          <option key={key} value={key}>{m.label}</option>
        ))}
      </select>
      <TimingCell scene={scene} timing={timing} onField={onField} onPinStart={onPinStart} onClearStart={onClearStart} />
      <input
        className="marker-label-input"
        value={scene.label || ""}
        placeholder={`${meta.label}…`}
        onChange={(e) => onField("label", e.target.value)}
      />
      <button className="icon-btn danger" onClick={onDelete} title="Remove row">✕</button>
    </div>
  );
}

function SingleImageCell({ image, onChange }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFiles(fileList) {
    const file = Array.from(fileList || []).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadFile(file);
      onChange({ id: uploaded.publicId, url: uploaded.url });
    } catch (e) {
      // upload failed silently; user can retry
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className={`image-slot ${dragOver ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {image ? (
        <>
          <img src={image.url} alt="" onClick={() => setLightbox(true)} />
          <div className="image-slot-actions">
            <button onClick={() => fileInputRef.current?.click()} title="Replace image">⟳</button>
            <button onClick={() => onChange(null)} title="Remove image">✕</button>
          </div>
        </>
      ) : (
        <button className="image-slot-empty" onClick={() => fileInputRef.current?.click()} title="Add image or GIF">
          {uploading ? "…" : "+"}
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
      />
      {lightbox && image && (
        <div className="lightbox-overlay" onClick={() => setLightbox(false)}>
          <button className="lightbox-close" onClick={() => setLightbox(false)}>✕</button>
          <img src={image.url} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
