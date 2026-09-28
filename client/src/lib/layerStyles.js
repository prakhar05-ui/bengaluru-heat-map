// Presentation for the map's point layers: colour, icon shape and popup text.
//
// Several layers can be on screen together and six colours cannot all be told
// apart (especially with colour-vision deficiency), so every layer also has its
// own icon shape / glyph. Identity never relies on colour alone.

/**
 * @typedef {Object} PointStyle
 * @property {string} color
 * @property {'circle'|'square'|'shield'} shape
 * @property {string} [glyph]        text drawn in the icon ("+", "M", "WC")
 * @property {string} [glyphColor]
 * @property {number} [size]         CSS pixels
 * @property {unknown[]} [priority]  MapLibre filter for features shown even below the layer's minzoom
 * @property {(p: Record<string, unknown>) => string[]} describe  popup lines; first is the title
 */

const yesNo = (v, yes, no) => (v === 'yes' ? yes : v === 'no' ? no : undefined);

/** @type {Record<string, PointStyle>} */
export const POINT_STYLES = {
  police: {
    color: '#1f2937',
    shape: 'shield',
    size: 20,
    describe: (p) => [p.name, 'Tap for phone number and directions'],
  },
  hospitals: {
    color: '#e34948',
    shape: 'square',
    glyph: '+',
    // Features matching this stay visible below the layer's minzoom.
    priority: ['==', ['get', 'emergency'], 'yes'],
    describe: (p) => [
      p.name ?? 'Hospital',
      yesNo(p.emergency, 'Emergency department: yes', 'No emergency department'),
      p.ownership === 'government' ? 'Government hospital' : p.ownership === 'private' ? 'Private hospital' : undefined,
      p.phone && `Phone: ${p.phone}`,
    ],
  },
  health: {
    color: '#1baf7a',
    shape: 'circle',
    glyph: '+',
    describe: (p) => [p.name ?? 'Health centre', p.kind, p.area && `Covers: ${p.area}`, p.phone && `Contact: ${p.phone}`],
  },
  metro: {
    color: '#2a78d6',
    shape: 'square',
    glyph: 'M',
    describe: (p) => [`${p.name} metro station`],
  },
  cctv: {
    color: '#eb6834',
    shape: 'circle',
    glyph: '●',
    size: 16,
    describe: (p) => ['CCTV camera', p.operator && `Operator: ${p.operator}`, p.surveyed && `Last recorded: ${p.surveyed}`],
  },
  toilets: {
    color: '#008300',
    shape: 'square',
    glyph: 'WC',
    describe: (p) => [
      'Public toilet',
      [p.name, p.road].filter(Boolean).join(', ') || undefined,
      yesNo(p.ladies, "Women's section: yes", "Women's section: no"),
    ],
  },
  'bus-stops': {
    color: '#eda100',
    shape: 'circle',
    glyph: 'B',
    glyphColor: '#2b1d00',
    size: 16,
    describe: (p) => [p.name ? `${p.name} bus stop` : 'Bus stop'],
  },
};

// Streetlights-per-km ramp: light = fewer lights per km, dark = more.
export const STREETLIGHT_RAMP = ['#fdf0c4', '#f9d77e', '#eda100', '#b77a00', '#7a5000'];

const PIXEL_RATIO = 2;

/**
 * Draw a layer icon onto a canvas.
 * @param {PointStyle} style
 * @returns {HTMLCanvasElement}
 */
function drawIcon(style) {
  const css = style.size ?? 22;
  const px = css * PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  const pad = 2 * PIXEL_RATIO;
  const s = px - pad * 2;

  ctx.beginPath();
  if (style.shape === 'circle') {
    ctx.arc(px / 2, px / 2, s / 2, 0, Math.PI * 2);
  } else if (style.shape === 'square') {
    const r = s * 0.22;
    ctx.roundRect(pad, pad, s, s, r);
  } else {
    // shield
    ctx.moveTo(px / 2, pad);
    ctx.lineTo(px - pad, pad + s * 0.18);
    ctx.lineTo(px - pad, pad + s * 0.5);
    ctx.quadraticCurveTo(px - pad, pad + s * 0.88, px / 2, px - pad);
    ctx.quadraticCurveTo(pad, pad + s * 0.88, pad, pad + s * 0.5);
    ctx.lineTo(pad, pad + s * 0.18);
    ctx.closePath();
  }
  ctx.fillStyle = style.color;
  ctx.fill();
  // White ring separates icons from each other; a thin dark ring lifts light colours off light maps.
  ctx.lineWidth = 2 * PIXEL_RATIO;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.lineWidth = 0.75 * PIXEL_RATIO;
  ctx.strokeStyle = 'rgba(11,11,11,0.55)';
  ctx.stroke();

  if (style.glyph) {
    const size = style.glyph.length > 1 ? s * 0.42 : s * 0.62;
    ctx.fillStyle = style.glyphColor ?? '#ffffff';
    ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.glyph, px / 2, px / 2 + size * 0.05);
  }
  return canvas;
}

const iconCache = new Map();

/** Icon as ImageData for map.addImage(id, image, { pixelRatio }). */
export function iconImage(id) {
  const canvas = drawIcon(POINT_STYLES[id]);
  return { image: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height), pixelRatio: PIXEL_RATIO };
}

/** Icon as a data URL, for legends and lists. */
export function iconDataUrl(id) {
  if (!iconCache.has(id)) iconCache.set(id, drawIcon(POINT_STYLES[id]).toDataURL());
  return iconCache.get(id);
}

/** Popup lines for a feature of a layer (empty values removed). */
export const describeFeature = (id, props) => POINT_STYLES[id].describe(props).filter(Boolean);
