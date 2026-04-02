const modelInfo = {
  ecmwf: {
    label: 'ECMWF',
    apiModel: 'ecmwf_ifs04',
    description: 'ECMWF IFS (0.4°): strong medium-range skill and synoptic guidance.'
  },
  gfs: {
    label: 'GFS',
    apiModel: 'gfs_global',
    description: 'NOAA GFS: frequent updates and broad global coverage.'
  },
  icon: {
    label: 'ICON',
    apiModel: 'icon_global',
    description: 'DWD ICON: high-quality global dynamical forecast model.'
  }
};

const layerInfo = {
  precipitation: {
    label: 'Precipitation',
    variable: 'precipitation',
    unit: 'mm',
    legend: {
      gradient: 'linear-gradient(90deg, #1f2fff, #3ea5ff, #5be56b, #f5e14f, #ff4b4b)',
      ticks: ['0', '1', '3', '8', '20 mm']
    },
    colorScale: [
      [0, '#1f2fff'],
      [1, '#3ea5ff'],
      [3, '#5be56b'],
      [8, '#f5e14f'],
      [20, '#ff4b4b']
    ]
  },
  temperature: {
    label: 'Temperature',
    variable: 'temperature_2m',
    unit: '°C',
    legend: {
      gradient: 'linear-gradient(90deg, #4c33ff, #3796ff, #79f07d, #f6d45d, #ff5a3f)',
      ticks: ['-20', '-5', '10', '25', '40°C']
    },
    colorScale: [
      [-20, '#4c33ff'],
      [-5, '#3796ff'],
      [10, '#79f07d'],
      [25, '#f6d45d'],
      [40, '#ff5a3f']
    ]
  },
  wind: {
    label: 'Wind',
    variable: 'wind_speed_10m',
    unit: 'km/h',
    legend: {
      gradient: 'linear-gradient(90deg, #d8e9ff, #83c2ff, #6285ff, #7d46ff, #cc2f8b)',
      ticks: ['0', '10', '25', '50', '90 km/h']
    },
    colorScale: [
      [0, '#d8e9ff'],
      [10, '#83c2ff'],
      [25, '#6285ff'],
      [50, '#7d46ff'],
      [90, '#cc2f8b']
    ]
  }
};

const map = L.map('map', { zoomControl: true }).setView([21.6, 78.9], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const INDIA_BOUNDS = {
  latMin: 8,
  latMax: 32,
  lonMin: 68,
  lonMax: 95
};
const GRID_STEP = 2.5;

const weatherLayerGroups = {
  precipitation: L.layerGroup().addTo(map),
  temperature: L.layerGroup().addTo(map),
  wind: L.layerGroup().addTo(map)
};

const cycloneTrack = [[9.2, 92.4], [10.1, 90.8], [11.3, 88.9], [13.5, 86.4], [16.1, 84.3], [19.2, 83.4]];
const cycloneLine = L.polyline(cycloneTrack, { color: '#ff5b82', weight: 3, opacity: 0.9, dashArray: '6 5' }).addTo(map);
const cycloneMarkers = cycloneTrack.map(([lat, lon], i) =>
  L.marker([lat, lon], { icon: L.divIcon({ className: 'cyclone-dot', iconSize: [14, 14] }) })
    .bindTooltip(`Cyclone forecast point T+${i * 12}h`)
    .addTo(map)
);

const modelGrid = document.getElementById('modelGrid');
const modelDescription = document.getElementById('modelDescription');
const banner = document.getElementById('overlayBanner');
const hourRange = document.getElementById('hourRange');
const hourValue = document.getElementById('hourValue');
const forecastTime = document.getElementById('forecastTime');
const legendScale = document.getElementById('legendScale');
const legendTicks = document.getElementById('legendTicks');
const pointValues = document.getElementById('pointValues');

let activeModel = 'ecmwf';
let activeLegend = 'precipitation';
let clickMarker;
let fieldData = null;
let requestNonce = 0;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function colorFromScale(scale, value) {
  if (value <= scale[0][0]) return scale[0][1];
  if (value >= scale[scale.length - 1][0]) return scale[scale.length - 1][1];

  for (let i = 0; i < scale.length - 1; i += 1) {
    const [v1, c1] = scale[i];
    const [v2, c2] = scale[i + 1];
    if (value >= v1 && value <= v2) {
      const t = (value - v1) / (v2 - v1);
      const rgb1 = hexToRgb(c1);
      const rgb2 = hexToRgb(c2);
      return rgbToHex([
        Math.round(lerp(rgb1[0], rgb2[0], t)),
        Math.round(lerp(rgb1[1], rgb2[1], t)),
        Math.round(lerp(rgb1[2], rgb2[2], t))
      ]);
    }
  }
  return scale[0][1];
}

function buildGrid() {
  const cells = [];
  for (let lat = INDIA_BOUNDS.latMin; lat <= INDIA_BOUNDS.latMax; lat += GRID_STEP) {
    for (let lon = INDIA_BOUNDS.lonMin; lon <= INDIA_BOUNDS.lonMax; lon += GRID_STEP) {
      cells.push({
        lat,
        lon,
        bounds: [
          [lat - GRID_STEP / 2, lon - GRID_STEP / 2],
          [lat + GRID_STEP / 2, lon + GRID_STEP / 2]
        ]
      });
    }
  }
  return cells;
}

const gridCells = buildGrid();

function updateBanner() {
  const enabledLayers = [...document.querySelectorAll('[data-layer]:checked')]
    .map((i) => i.dataset.layer)
    .join(', ') || 'No Layers';
  banner.textContent = `${modelInfo[activeModel].label} · ${enabledLayers} · +${hourRange.value}h`;
}

function setForecastTime() {
  const future = new Date(Date.now() + Number(hourRange.value) * 3600000);
  forecastTime.textContent = future.toUTCString().replace('GMT', 'UTC');
}

function renderLegend(type) {
  activeLegend = type;
  const definition = layerInfo[type].legend;
  legendScale.style.background = definition.gradient;
  legendTicks.innerHTML = definition.ticks.map((tick) => `<span>${tick}</span>`).join('');
}

function getHourIndex() {
  return Number(hourRange.value) / 6;
}

function clearFieldLayers() {
  Object.values(weatherLayerGroups).forEach((group) => group.clearLayers());
}

function drawFieldLayer(layerKey) {
  const checkbox = document.querySelector(`[data-layer='${layerKey}']`);
  if (!checkbox?.checked || !fieldData) return;

  const group = weatherLayerGroups[layerKey];
  const scale = layerInfo[layerKey].colorScale;
  const variableData = fieldData[layerKey];
  const hourIndex = getHourIndex();

  group.clearLayers();

  gridCells.forEach((cell, idx) => {
    const series = variableData[idx] || [];
    const value = Number(series[hourIndex]);
    if (!Number.isFinite(value)) return;

    const fillColor = colorFromScale(scale, value);
    const rect = L.rectangle(cell.bounds, {
      stroke: false,
      fillColor,
      fillOpacity: 0.42
    }).bindTooltip(`${layerInfo[layerKey].label}: ${value.toFixed(1)} ${layerInfo[layerKey].unit}`);

    group.addLayer(rect);
  });
}

function redrawAllFieldLayers() {
  ['precipitation', 'temperature', 'wind'].forEach(drawFieldLayer);
}

function setLoadingState(isLoading) {
  banner.classList.toggle('loading', isLoading);
  if (isLoading) banner.textContent = `Loading ${modelInfo[activeModel].label} fields...`;
}

async function fetchModelFields() {
  requestNonce += 1;
  const nonce = requestNonce;
  setLoadingState(true);

  const latitudes = gridCells.map((c) => c.lat.toFixed(2)).join(',');
  const longitudes = gridCells.map((c) => c.lon.toFixed(2)).join(',');

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitudes);
  url.searchParams.set('longitude', longitudes);
  url.searchParams.set('hourly', 'temperature_2m,wind_speed_10m,precipitation');
  url.searchParams.set('forecast_days', '6');
  url.searchParams.set('models', modelInfo[activeModel].apiModel);

  try {
    const response = await fetch(url);
    const payload = await response.json();

    if (nonce !== requestNonce) return;

    const records = Array.isArray(payload) ? payload : [payload];
    fieldData = {
      precipitation: records.map((r) => r.hourly?.precipitation || []),
      temperature: records.map((r) => r.hourly?.temperature_2m || []),
      wind: records.map((r) => r.hourly?.wind_speed_10m || [])
    };

    clearFieldLayers();
    redrawAllFieldLayers();
    setForecastTime();
    updateBanner();
  } catch {
    if (nonce !== requestNonce) return;
    banner.textContent = 'Unable to load model fields currently. Check network/API limits.';
  } finally {
    if (nonce === requestNonce) setLoadingState(false);
  }
}

modelGrid.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-model]');
  if (!button) return;

  activeModel = button.dataset.model;
  document.querySelectorAll('button[data-model]').forEach((btn) => btn.classList.remove('active'));
  button.classList.add('active');
  modelDescription.textContent = modelInfo[activeModel].description;

  fetchModelFields();
});

document.querySelectorAll('[data-layer]').forEach((input) => {
  input.addEventListener('change', () => {
    const name = input.dataset.layer;

    if (name === 'cyclone') {
      if (input.checked) {
        cycloneLine.addTo(map);
        cycloneMarkers.forEach((marker) => marker.addTo(map));
      } else {
        map.removeLayer(cycloneLine);
        cycloneMarkers.forEach((marker) => map.removeLayer(marker));
      }
    } else if (input.checked) {
      drawFieldLayer(name);
    } else {
      weatherLayerGroups[name].clearLayers();
    }

    updateBanner();
  });
});

document.querySelectorAll('.legend-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.legend-tab').forEach((btn) => btn.classList.remove('active'));
    tab.classList.add('active');
    renderLegend(tab.dataset.legend);
  });
});

hourRange.addEventListener('input', () => {
  hourValue.textContent = hourRange.value;
  setForecastTime();
  redrawAllFieldLayers();
  updateBanner();
});

async function samplePoint(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('current', 'temperature_2m,wind_speed_10m,precipitation');
  url.searchParams.set('models', modelInfo[activeModel].apiModel);

  try {
    const response = await fetch(url);
    const data = await response.json();
    const current = data.current || {};
    pointValues.innerHTML = `
      <li>Temperature (${modelInfo[activeModel].label}): ${current.temperature_2m ?? '--'} °C</li>
      <li>Wind speed (${modelInfo[activeModel].label}): ${current.wind_speed_10m ?? '--'} km/h</li>
      <li>Precipitation (${modelInfo[activeModel].label}): ${current.precipitation ?? '--'} mm</li>
    `;
  } catch {
    pointValues.innerHTML = '<li>Unable to fetch point forecast now.</li>';
  }
}

map.on('click', (event) => {
  const { lat, lng } = event.latlng;
  if (clickMarker) clickMarker.remove();
  clickMarker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup(`Sampled point<br>${lat.toFixed(2)}, ${lng.toFixed(2)}`)
    .openPopup();

  samplePoint(lat.toFixed(4), lng.toFixed(4));
});

renderLegend(activeLegend);
setForecastTime();
updateBanner();
fetchModelFields();
