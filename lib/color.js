export function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function dayAccentStyle(color) {
  return {
    "--accent": color,
    "--accent-border": hexToRgba(color, 0.35),
    "--accent-soft": hexToRgba(color, 0.16),
  };
}
