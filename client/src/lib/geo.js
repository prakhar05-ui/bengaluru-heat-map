/** Straight-line distance in km between two { lat, lng } points (haversine). */
export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const GEO_MESSAGES = {
  1: 'Location permission was denied. Allow location for this site in your browser settings.',
  2:
    'Your device could not work out its location. Check that Location Services is on for your browser ' +
    '(on a Mac: System Settings → Privacy & Security → Location Services) and that Wi-Fi is on.',
  3: 'Getting your location took too long. Please try again.',
};

function locate(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
      reject,
      options,
    );
  });
}

/**
 * Browser geolocation as a promise of { lat, lng, accuracy }.
 *
 * Tries a precise fix first. Devices without GPS (e.g. Macs, which locate via
 * Wi-Fi) often report "position unavailable" or time out on that, so it then
 * retries in network-location mode with a longer wait and accepts a recent
 * cached position. Rejects with an Error carrying a readable message and `code`
 * (1 denied, 2 unavailable, 3 timeout).
 */
export async function getCurrentPosition() {
  if (!('geolocation' in navigator)) {
    throw Object.assign(new Error('This browser does not support location.'), { code: 2 });
  }
  try {
    return await locate({ enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 });
  } catch (err) {
    if (err.code === 1) throw Object.assign(new Error(GEO_MESSAGES[1]), { code: 1 });
  }
  try {
    return await locate({ enableHighAccuracy: false, timeout: 20_000, maximumAge: 10 * 60_000 });
  } catch (err) {
    throw Object.assign(new Error(GEO_MESSAGES[err.code] ?? 'Could not get your location.'), { code: err.code ?? 2 });
  }
}

/** "080-22943470" -> "tel:08022943470" */
export const telHref = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`;
