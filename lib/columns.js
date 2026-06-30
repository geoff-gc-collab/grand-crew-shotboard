export const SHOT_TYPE_OPTIONS = [
  "Wide", "Med", "Close", "Insert", "B-roll", "Handheld", "Walking",
  "Pickup", "Drone", "Static", "Dolly", "Jib", "POV",
];
export const INT_EXT_OPTIONS = ["INT", "EXT", "INT/EXT"];
export const DAY_NIGHT_OPTIONS = ["DAY", "NIGHT", "DAWN", "DUSK"];

// width in px. type: text | textarea | datalist | images | colorTag | link
export const COLUMN_DEFS = [
  { key: "num", label: "#", width: 50, type: "text" },
  { key: "colorTag", label: "Tag", width: 96, type: "colorTag" },
  { key: "images", label: "Reference", width: 220, type: "images" },
  { key: "title", label: "Title", width: 200, type: "text" },
  { key: "location", label: "Location", width: 180, type: "text" },
  { key: "shotType", label: "Shot Type", width: 130, type: "datalist", options: SHOT_TYPE_OPTIONS },
  { key: "intExt", label: "Int/Ext", width: 90, type: "datalist", options: INT_EXT_OPTIONS },
  { key: "dayNight", label: "Day/Night", width: 100, type: "datalist", options: DAY_NIGHT_OPTIONS },
  { key: "talent", label: "Talent", width: 150, type: "text" },
  { key: "extras", label: "Extras", width: 130, type: "text" },
  { key: "wardrobe", label: "Wardrobe", width: 130, type: "text" },
  { key: "notes", label: "Notes", width: 180, type: "text" },
  { key: "desc", label: "Description", width: 220, type: "textarea" },
  { key: "ref", label: "Ref Link", width: 120, type: "link" },
];

export const DEFAULT_COLUMN_ORDER = COLUMN_DEFS.map((c) => c.key);

export function columnDef(key) {
  return COLUMN_DEFS.find((c) => c.key === key);
}
