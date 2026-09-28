# Nagaur Rain Intelligence

Fresh rebuild for **Nagaur + 100 km**. This version is designed as a mobile-first rain intelligence dashboard rather than a copy of any one weather website.

## What is implemented
- Nagaur current weather with rain, probability, temperature, wind, humidity, gusts, cloud and CAPE.
- 10-hour local timeline.
- Four independent model views: ECMWF IFS, GFS, DWD ICON and ECMWF AIFS through Open-Meteo.
- 81-point regional forecast grid inside a 100 km circle, with an hour slider and map popups.
- Model spread / agreement indicator (agreement is **not** forecast accuracy).
- RainViewer observed radar history with frame playback. The current public RainViewer API provides past radar frames; this app does not pretend that future nowcast frames are available when they are not.
- IMD district warning, district nowcast and district rainfall feed attempts.
- Forecast verification section reserved for measured forecast-vs-observation statistics.
- Graceful degradation when any one external feed fails.

## Data and product references
The feature set was researched against Windy, RainViewer, Ventusky, Weather Underground/WunderMap, Zoom Earth and Rainbow Weather. The app uses accessible official/public data sources rather than scraping proprietary products.

### Sources
- India Meteorological Department (IMD) APIs and warning/nowcast products.
- Open-Meteo model APIs.
- RainViewer Weather Maps API.
- Optional Rainbow Weather API can be added later with a server-side secret.

## Accuracy policy
No weather service can honestly guarantee a universal **95% correct** rain forecast. The correct path is to collect forecasts and observations, then publish measured metrics such as Brier score, probability calibration, POD, FAR, CSI and MAE for defined thresholds and time windows.

## pySTEPS radar nowcasting

The repository now includes a real pySTEPS integration:
- `scripts/pysteps_nowcast.py` reads quantitative radar frames in ODIM/OPERA HDF5, BoM Rainfields3 NetCDF or FMI GeoTIFF formats.
- It estimates motion with Lucas-Kanade and generates a deterministic extrapolation nowcast for up to 2 hours.
- `.github/workflows/pysteps-nowcast.yml` installs pySTEPS and publishes a compact `data/pysteps-nowcast.json` result.
- The web dashboard displays the pySTEPS status/short-term intensity when radar frames are available.

Important: RainViewer's public map tiles are colorized display tiles. The integration deliberately does not reverse-engineer those colors into quantitative precipitation because that would make the nowcast scientifically unreliable. RainViewer currently exposes past radar tiles and separate source-radar data files; quantitative radar input must be available in a supported format.

## Next engineering phase
1. Add a small server/GitHub Action to save forecast snapshots every hour.
2. Pair snapshots with observed IMD/AWS/ARG rainfall.
3. Calculate rolling verification by lead time (0–1h, 1–3h, 3–6h, 6–10h).
4. Calibrate probabilities for Nagaur using the local history.
5. Add Rainbow Weather server-side minute nowcast if an API key is supplied.
6. Connect a stable quantitative Indian radar source (IMD/source-radar file or another licensed feed) to `radar-input/` so the pySTEPS workflow can run automatically.

## Attribution
RainViewer requires visible attribution for its public API. Open-Meteo data should also be attributed according to its terms.
