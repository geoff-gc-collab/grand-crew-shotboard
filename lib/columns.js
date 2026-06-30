export const SHOT_TYPE_OPTIONS = [
  "Wide", "Med", "Close", "Insert", "B-roll", "Handheld", "Walking",
  "Pickup", "Drone", "Static", "Dolly", "Jib", "POV",
];
// Combined Day/Night + Int/Ext spectrum, replacing the two separate fields.
export const DAY_NIGHT_INT_EXT_OPTIONS = ["Day Int", "Day Ext", "Night Int", "Night Ext"];

// Row height drives the image box: height (108) minus cell padding (12) = 96,
// times 16/9 = 170.7 -> 171 wide, plus padding = 183 column width.
export const ROW_HEIGHT = 108;
export const IMAGE_COL_WIDTH = 183;

// width in px. type: num | text | textarea | datalist | image | link
export const COLUMN_DEFS = [
  { key: "num", label: "#", width: 50, type: "num" },
  { key: "images", label: "Reference", width: IMAGE_COL_WIDTH, type: "image" },
  { key: "title", label: "Title", width: 200, type: "text" },
  { key: "location", label: "Location", width: 180, type: "text" },
  { key: "shotType", label: "Shot Type", width: 130, type: "datalist", options: SHOT_TYPE_OPTIONS },
  { key: "dayNightIntExt", label: "Day/Night ⋅ Int/Ext", width: 110, type: "datalist", options: DAY_NIGHT_INT_EXT_OPTIONS },
  { key: "talent", label: "Talent", width: 150, type: "text" },
  { key: "notes", label: "Notes", width: 180, type: "text" },
  { key: "desc", label: "Description", width: 220, type: "textarea" },
  { key: "ref", label: "Ref Link", width: 120, type: "link" },
];

export const DEFAULT_COLUMN_ORDER = COLUMN_DEFS.map((c) => c.key);

export function columnDef(key) {
  return COLUMN_DEFS.find((c) => c.key === key);
}

// Custom column type -> { width, cellType }
const CUSTOM_TYPE_MAP = {
  image: { width: IMAGE_COL_WIDTH, cellType: "image" },
  text: { width: 220, cellType: "textarea" },
  dropdown: { width: 130, cellType: "datalist" },
};

export function buildColumnDefs(project) {
  const custom = (project.customColumns || []).map((c) => {
    const meta = CUSTOM_TYPE_MAP[c.type] || CUSTOM_TYPE_MAP.text;
    return {
      key: c.key,
      label: c.label,
      width: meta.width,
      type: meta.cellType,
      options: c.options,
      custom: true,
    };
  });
  return [...COLUMN_DEFS, ...custom];
}
