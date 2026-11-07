// US map geometry for the Home Of flyover.
// data/us-states-albers.json is us-atlas@3 (ISC, US Census boundaries), pre-projected to Albers USA in a
// 975×610 space. We decode its quantized TopoJSON arcs directly (no library) and project stadium
// coordinates with the identical conic equal-area projection d3.geoAlbersUsa uses for the lower 48
// (scale 1300, translate [487.5, 305]), so stadiums land exactly on the map.

const RAD = Math.PI / 180;
// d3.geoAlbers(): parallels [29.5, 45.5], rotate [96, 0], center [-0.6, 38.7]
const PHI0 = 29.5 * RAD;
const PHI1 = 45.5 * RAD;
const N = (Math.sin(PHI0) + Math.sin(PHI1)) / 2;
const C = 1 + Math.sin(PHI0) * (2 * N - Math.sin(PHI0));
const R0 = Math.sqrt(C) / N;
const SCALE = 1300;
const TX = 487.5;
const TY = 305;

function conic(lambda, phi) {
  const r = Math.sqrt(Math.max(0, C - 2 * N * Math.sin(phi))) / N;
  return [r * Math.sin(lambda * N), R0 - r * Math.cos(lambda * N)];
}
const CENTER = conic(-0.6 * RAD, 38.7 * RAD);

// [lng, lat] → [x, y] in the us-atlas 975×610 space.
export function albers(lng, lat) {
  let lambda = (lng + 96) * RAD;
  if (lambda > Math.PI) lambda -= 2 * Math.PI;
  if (lambda < -Math.PI) lambda += 2 * Math.PI;
  const [x, y] = conic(lambda, lat * RAD);
  return [TX + SCALE * (x - CENTER[0]), TY - SCALE * (y - CENTER[1])];
}

// Lower 48 roughly: venues outside it are drawn as edge beacons instead of map points.
export function onMainland(lat, lng) {
  return lat > 24 && lat < 50 && lng > -125.5 && lng < -66;
}

let mapPromise;
export function loadUsMap() {
  if (mapPromise) return mapPromise;
  mapPromise = fetch(new URL('../../data/us-states-albers.json', import.meta.url))
    .then(response => { if (!response.ok) throw new Error('Map unavailable'); return response.json(); })
    .then(topology => {
      const [sx, sy] = topology.transform.scale;
      const [tx, ty] = topology.transform.translate;
      const arcs = topology.arcs.map(arc => {
        let x = 0;
        let y = 0;
        const points = new Float32Array(arc.length * 2);
        arc.forEach(([dx, dy], index) => { x += dx; y += dy; points[index * 2] = x * sx + tx; points[index * 2 + 1] = y * sy + ty; });
        return points;
      });
      // Arcs on the nation outline (coastline/borders) vs. interior state lines.
      const coast = new Set();
      const walk = value => { if (Array.isArray(value)) value.forEach(walk); else if (typeof value === 'number') coast.add(value < 0 ? ~value : value); };
      topology.objects.nation.geometries.forEach(geometry => walk(geometry.arcs));
      // Polygons of the nation (for land fill and the city-light mask).
      const rings = [];
      const ringPoints = ring => {
        const out = [];
        ring.forEach(index => {
          const arc = arcs[index < 0 ? ~index : index];
          const count = arc.length / 2;
          for (let step = 0; step < count; step += 1) {
            const k = index < 0 ? count - 1 - step : step;
            out.push(arc[k * 2], arc[k * 2 + 1]);
          }
        });
        return out;
      };
      topology.objects.nation.geometries.forEach(geometry => {
        const polygons = geometry.type === 'MultiPolygon' ? geometry.arcs : [geometry.arcs];
        polygons.forEach(polygon => polygon.forEach(ring => rings.push(ringPoints(ring))));
      });
      return { arcs, coast, rings, width: 975, height: 610 };
    })
    .catch(error => { mapPromise = null; throw error; });
  return mapPromise;
}

// Major US metros (approximate centers, population in millions) for the night-lights layer.
export const METROS = [
  [-74.006, 40.713, 19.5], [-118.244, 34.052, 12.8], [-87.630, 41.878, 9.4], [-96.797, 32.777, 7.8], [-95.369, 29.760, 7.3],
  [-77.037, 38.907, 6.4], [-80.192, 25.762, 6.1], [-75.165, 39.953, 6.2], [-84.388, 33.749, 6.2], [-112.074, 33.448, 5.0],
  [-71.059, 42.360, 4.9], [-122.419, 37.775, 4.7], [-117.396, 33.954, 4.6], [-83.046, 42.331, 4.4], [-122.332, 47.606, 4.0],
  [-93.265, 44.978, 3.7], [-117.161, 32.716, 3.3], [-82.458, 27.951, 3.3], [-104.990, 39.739, 3.0], [-76.612, 39.290, 2.8],
  [-90.199, 38.627, 2.8], [-81.379, 28.538, 2.7], [-80.843, 35.227, 2.7], [-98.494, 29.425, 2.6], [-122.676, 45.523, 2.5],
  [-121.494, 38.582, 2.4], [-79.996, 40.441, 2.4], [-97.743, 30.267, 2.4], [-115.140, 36.170, 2.3], [-84.512, 39.103, 2.2],
  [-94.578, 39.100, 2.2], [-82.999, 39.961, 2.1], [-86.158, 39.768, 2.1], [-81.694, 41.499, 2.1], [-121.886, 37.338, 2.0],
  [-86.781, 36.163, 2.0], [-76.286, 36.847, 1.8], [-71.413, 41.824, 1.7], [-87.906, 43.039, 1.6], [-81.656, 30.332, 1.6],
  [-97.516, 35.468, 1.4], [-78.639, 35.780, 1.4], [-90.049, 35.149, 1.3], [-77.436, 37.541, 1.3], [-90.071, 29.951, 1.3],
  [-85.759, 38.253, 1.3], [-111.891, 40.761, 1.3], [-72.685, 41.764, 1.2], [-78.878, 42.886, 1.1], [-86.802, 33.521, 1.1],
  [-77.612, 43.157, 1.1], [-85.668, 42.963, 1.1], [-110.975, 32.222, 1.0], [-95.993, 36.154, 1.0], [-157.858, 21.307, 0],
  [-106.650, 35.084, 0.9], [-73.756, 42.653, 0.9], [-119.787, 36.738, 1.0], [-95.935, 41.257, 1.0], [-83.920, 35.961, 0.9],
  [-79.932, 32.777, 0.8], [-81.035, 34.000, 0.8], [-89.401, 43.073, 0.7], [-96.700, 40.814, 0.3], [-100.783, 46.808, 0.1],
  [-116.202, 43.615, 0.8], [-117.426, 47.659, 0.6], [-108.500, 45.783, 0.2], [-106.488, 31.762, 0.9], [-97.330, 37.687, 0.6],
  [-92.290, 34.746, 0.7], [-90.185, 32.299, 0.6], [-88.040, 30.695, 0.4], [-84.280, 30.438, 0.4], [-76.876, 40.273, 0.6]
];
