# Nagaur Rain Intelligence

Fresh rebuild focused on **Nagaur + 100 km radius**.

## Data strategy
- RainViewer radar: live/past radar frames.
- Open-Meteo: ECMWF, GFS, ICON and ECMWF AIFS model forecasts.
- IMD Rajasthan: district warnings/nowcast/rainfall endpoints where publicly accessible.
- Optional Rainbow Weather API: minute-scale precipitation nowcast requires an API key.
- Windy/Ventusky/WunderMap/Zoom Earth features are used as design/data references; their proprietary map layers are not scraped or copied.

## Accuracy
A 95% guaranteed rain forecast is not technically honest. The dashboard therefore shows model agreement/spread rather than claiming 95% accuracy. Accuracy can later be measured separately against observed rainfall and calibrated for Nagaur.

## Scope
The initial dashboard is deliberately small and robust. Later phases can add:
1. Rainbow minute-by-minute nowcast using a server-side API key.
2. IMD Jaipur radar image animation and district nowcast.
3. 100 km grid forecasts and village-level points.
4. Historical forecast-vs-observation verification.
5. Calibrated probabilistic rain prediction.
