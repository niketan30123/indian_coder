# Weather Fusion (Windy-style Model Viewer)

Weather Fusion is a Windy-inspired weather web app that visualizes forecast layers from real forecast models (ECMWF, GFS, ICON) using Open-Meteo data.

## What this app does

- Displays a Leaflet map with weather layers for:
  - Precipitation
  - Temperature
  - Wind speed
  - Cyclone track (demo path)
- Lets users switch model source between **ECMWF**, **GFS**, and **ICON**.
- Re-renders map grid colors based on selected model and forecast lead time (+0h to +120h).
- Shows dynamic legends for precipitation, temperature, and wind.
- Supports map click point sampling for current model values.

## Run locally

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>.

## Quick preview link (local)

After starting the server, open:

- http://localhost:8080
- http://127.0.0.1:8080

## Data source

- Forecast data API: [Open-Meteo Forecast API](https://open-meteo.com/)
- Basemap: OpenStreetMap tiles.

## Production guidance (if you want Windy-level scale)

For a full production platform with global multi-resolution tiles and animation at Windy scale, add a backend pipeline:

1. Ingest model files (GRIB2/NetCDF).
2. Build tiled caches (raster/vector and time-indexed layers).
3. Serve low-latency tile APIs with CDN caching.
4. Add user auth, billing, observability, and model licensing compliance.

