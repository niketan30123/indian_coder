const API_KEY = "878539f19cad30f95de9ef53741716f6";
const API_BASE = "https://api.openweathermap.org/data/2.5";
const TILE_BASE = "https://tile.openweathermap.org/map";

const indianCities = [
  { name: "Delhi", lat: 28.6139, lon: 77.209 },
  { name: "Mumbai", lat: 19.076, lon: 72.8777 },
  { name: "Kolkata", lat: 22.5726, lon: 88.3639 },
  { name: "Chennai", lat: 13.0827, lon: 80.2707 },
  { name: "Bengaluru", lat: 12.9716, lon: 77.5946 },
  { name: "Hyderabad", lat: 17.385, lon: 78.4867 },
  { name: "Ahmedabad", lat: 23.0225, lon: 72.5714 },
  { name: "Guwahati", lat: 26.1445, lon: 91.7362 }
];

const coastalStations = [
  "Mumbai", "Chennai", "Visakhapatnam", "Kolkata", "Puri", "Kochi", "Mangaluru"
];

const citySelect = document.getElementById("citySelect");
const metricsGrid = document.getElementById("metricsGrid");
const fogSummary = document.getElementById("fogSummary");
const fogTimeline = document.getElementById("fogTimeline");
const cycloneAlert = document.getElementById("cycloneAlert");
const cycloneGrid = document.getElementById("cycloneGrid");
const newsList = document.getElementById("newsList");
const errorList = document.getElementById("errorList");

let map;
let overlayLayer;
let activeLayerName = "precipitation_new";
const appErrors = [];

function renderErrors() {
  if (!errorList) return;
  if (!appErrors.length) {
    errorList.innerHTML = "<li>No errors recorded.</li>";
    return;
  }

  errorList.innerHTML = appErrors
    .slice(-12)
    .reverse()
    .map((item) => `<li>[${item.time}] ${item.context}: ${item.message}</li>`)
    .join("");
}

function collectError(context, error) {
  const entry = {
    time: new Date().toLocaleTimeString("en-IN"),
    context,
    message: error?.message || String(error)
  };
  appErrors.push(entry);
  console.error(`[${entry.time}] ${entry.context}`, error);
  renderErrors();
}

function renderCityOptions() {
  citySelect.innerHTML = indianCities
    .map((city) => `<option value="${city.name}">${city.name}</option>`)
    .join("");
}

async function fetchJSON(url, params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${url}?${query}`);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} (${url})`);
  }

  return response.json();
}

function metricCard(label, value) {
  return `<article class="metric"><div class="label">${label}</div><div class="value">${value}</div></article>`;
}

function renderMetrics(weather) {
  const rainfallLastHour = weather.rain?.["1h"] ?? 0;
  metricsGrid.innerHTML = [
    metricCard("Temperature", `${weather.main.temp.toFixed(1)} °C`),
    metricCard("Humidity", `${weather.main.humidity} %`),
    metricCard("Feels Like", `${weather.main.feels_like.toFixed(1)} °C`),
    metricCard("Rainfall (1h)", `${rainfallLastHour.toFixed(1)} mm`),
    metricCard("Wind", `${(weather.wind.speed * 3.6).toFixed(0)} km/h`),
    metricCard("Visibility", `${(weather.visibility / 1000).toFixed(1)} km`)
  ].join("");
}

function renderFogForecast(forecast) {
  const next24h = forecast.list.slice(0, 8);
  const riskySlots = next24h.filter((slot) => {
    const visibility = slot.visibility ?? 10000;
    const weatherText = slot.weather?.[0]?.main?.toLowerCase() ?? "";
    return visibility < 1000 || ["fog", "mist", "haze", "smoke"].includes(weatherText);
  });

  const severe = riskySlots.some((slot) => (slot.visibility ?? 10000) < 500);

  if (!riskySlots.length) {
    fogSummary.textContent = "Low fog risk in next 24 hours";
    fogSummary.style.borderColor = "#2f7d31";
    fogSummary.style.background = "#173d1a";
  } else if (severe) {
    fogSummary.textContent = `High fog risk (${riskySlots.length} intervals)`;
    fogSummary.style.borderColor = "#8a1f27";
    fogSummary.style.background = "#4f1519";
  } else {
    fogSummary.textContent = `Moderate fog risk (${riskySlots.length} intervals)`;
    fogSummary.style.borderColor = "#8a6f1f";
    fogSummary.style.background = "#4e3f14";
  }

  fogTimeline.innerHTML = next24h
    .map((slot) => {
      const date = new Date(slot.dt * 1000);
      const visibility = slot.visibility ?? 10000;
      const fogClass = visibility < 500 ? "high-risk" : visibility < 1000 ? "risk" : "";
      return `
        <article class="timeline-item ${fogClass}">
          <span>${date.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", weekday: "short" })}</span>
          <span>${slot.weather?.[0]?.description ?? "n/a"} • ${(visibility / 1000).toFixed(1)} km</span>
        </article>
      `;
    })
    .join("");
}

function setupMap(lat, lon) {
  if (!map) {
    map = L.map("weatherMap").setView([lat, lon], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  } else {
    map.setView([lat, lon], 5);
  }

  if (overlayLayer) {
    map.removeLayer(overlayLayer);
  }

  overlayLayer = L.tileLayer(`${TILE_BASE}/${activeLayerName}/{z}/{x}/{y}.png?appid=${API_KEY}`, {
    opacity: 0.65,
    attribution: '&copy; OpenWeather'
  }).addTo(map);
}

function setLayerButtonState() {
  document.querySelectorAll(".layer-toggle button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.layer === activeLayerName);
  });
}

async function renderCycloneTracker() {
  const checks = await Promise.all(
    coastalStations.map(async (city) => {
      try {
        const weather = await fetchJSON(`${API_BASE}/weather`, {
          q: `${city},IN`,
          appid: API_KEY,
          units: "metric"
        });

        const windKmh = weather.wind.speed * 3.6;
        const pressure = weather.main.pressure;
        const stormTag = ["thunderstorm", "squall"].includes((weather.weather?.[0]?.main || "").toLowerCase());
        const riskScore = (windKmh >= 62 ? 1 : 0) + (pressure <= 1000 ? 1 : 0) + (stormTag ? 1 : 0);

        return {
          city,
          windKmh,
          pressure,
          weather: weather.weather?.[0]?.description || "unknown",
          riskScore
        };
      } catch (error) {
        collectError(`Cyclone station fetch (${city})`, error);
        return { city, error: "Data unavailable", riskScore: 0 };
      }
    })
  );

  const flagged = checks.filter((item) => item.riskScore >= 2);
  cycloneGrid.innerHTML = checks
    .map((item) => {
      if (item.error) {
        return `<article class="cyclone-item"><strong>${item.city}</strong><div class="small">${item.error}</div></article>`;
      }
      return `
        <article class="cyclone-item">
          <strong>${item.city}</strong>
          <div class="small">Wind: ${item.windKmh.toFixed(0)} km/h | Pressure: ${item.pressure} hPa</div>
          <div class="small">Condition: ${item.weather}</div>
        </article>
      `;
    })
    .join("");

  cycloneAlert.className = "alert-box";
  if (!flagged.length) {
    cycloneAlert.textContent = "No strong cyclone signatures detected on monitored coastal cities.";
  } else if (flagged.length <= 2) {
    cycloneAlert.classList.add("warn");
    cycloneAlert.textContent = `Watch: ${flagged.length} coastal station(s) show cyclone-like patterns. Stay updated with IMD advisories.`;
  } else {
    cycloneAlert.classList.add("danger");
    cycloneAlert.textContent = `Alert: ${flagged.length} coastal station(s) show high cyclone potential patterns. Follow disaster response guidance.`;
  }
}

async function renderNews() {
  newsList.innerHTML = "<li>Loading latest weather news…</li>";
  const rssURL = encodeURIComponent(
    "https://news.google.com/rss/search?q=India+weather+forecast+cyclone&hl=en-IN&gl=IN&ceid=IN:en"
  );

  try {
    const data = await fetchJSON("https://api.rss2json.com/v1/api.json", {
      rss_url: rssURL,
      count: 8
    });

    if (!data.items?.length) {
      throw new Error("No news items found");
    }

    newsList.innerHTML = data.items
      .slice(0, 6)
      .map(
        (item) =>
          `<li><a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a><div class="small">${new Date(item.pubDate).toLocaleString("en-IN")}</div></li>`
      )
      .join("");
  } catch (error) {
    collectError("News fetch", error);
    newsList.innerHTML = "<li>Unable to load live weather news feed at the moment.</li>";
  }
}

async function loadCityDashboard(cityName) {
  const city = indianCities.find((item) => item.name === cityName) || indianCities[0];

  try {
    const [weather, forecast] = await Promise.all([
      fetchJSON(`${API_BASE}/weather`, {
        q: `${city.name},IN`,
        appid: API_KEY,
        units: "metric"
      }),
      fetchJSON(`${API_BASE}/forecast`, {
        q: `${city.name},IN`,
        appid: API_KEY,
        units: "metric"
      })
    ]);

    renderMetrics(weather);
    renderFogForecast(forecast);
    setupMap(city.lat, city.lon);
  } catch (error) {
    collectError(`Dashboard city load (${city.name})`, error);
    metricsGrid.innerHTML = `<p>Failed to load weather data for ${city.name}. Please verify API key and quota.</p>`;
    fogSummary.textContent = "Fog forecast unavailable.";
    fogTimeline.innerHTML = "";
  }
}

function attachEvents() {
  citySelect.addEventListener("change", (event) => {
    loadCityDashboard(event.target.value);
  });

  document.querySelectorAll(".layer-toggle button").forEach((button) => {
    button.addEventListener("click", () => {
      activeLayerName = button.dataset.layer;
      setLayerButtonState();
      loadCityDashboard(citySelect.value);
    });
  });
}

async function init() {
  renderErrors();
  window.addEventListener("error", (event) => {
    collectError("Runtime error", event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    collectError("Unhandled promise rejection", event.reason);
  });

  renderCityOptions();
  attachEvents();
  setLayerButtonState();
  try {
    await Promise.all([
      loadCityDashboard(indianCities[0].name),
      renderCycloneTracker(),
      renderNews()
    ]);
  } catch (error) {
    collectError("Initialization", error);
  }
}

init();
