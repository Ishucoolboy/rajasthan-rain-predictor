"""
Rajasthan Rain Predictor — proactive rainfall alert engine.

Purpose:
- Compare ECMWF, GFS and ICON forecasts for the 41 Rajasthan monitoring locations.
- Produce a conservative ensemble rainfall signal.
- Add IMD district-warning context when the public endpoint is available.
- Send a WhatsApp Cloud API template only when a material alert threshold is met.
- De-duplicate alerts using data/rain_alert_state.json.

Important:
A weather forecast can never guarantee that rain "will definitely happen".
The engine therefore uses "high-confidence signal" language instead of certainty.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from urllib.parse import urlencode
import urllib.request
import urllib.error

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
IMD_WARNINGS = "https://mausam.imd.gov.in/api/warnings_district_api.php"
LOCATIONS_FILE = Path("regional-monitoring-locations.json")
STATE_FILE = Path("data/rain_alert_state.json")

MODELS = {
    "ECMWF": "ecmwf_ifs025",
    "GFS": "gfs_seamless",
    "ICON": "icon_seamless",
}

# Alert only for meaningful rainfall. Values are deliberately conservative.
SIGNAL_MM = 5.0
HIGH_CONF_MM = 10.0
VERY_HIGH_MM = 25.0
HIGH_PROB = 70
VERY_HIGH_PROB = 85
MIN_MODEL_AGREEMENT = 2

# To keep WhatsApp useful, send the highest-rainfall locations only.
MAX_ALERT_LOCATIONS = 10

USER_AGENT = "RajasthanRainPredictor/1.0"


def http_json(url: str, params: dict | None = None, headers: dict | None = None):
    if params:
        url += ("&" if "?" in url else "?") + urlencode(params)

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            **(headers or {}),
        },
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def load_locations():
    data = json.loads(LOCATIONS_FILE.read_text(encoding="utf-8"))
    return data.get("locations", [])


def load_state():
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def fetch_model(location, model_id):
    params = {
        "latitude": location["latitude"],
        "longitude": location["longitude"],
        "hourly": ",".join([
            "precipitation",
            "rain",
            "showers",
            "precipitation_probability",
            "weather_code",
            "cloud_cover",
            "cape",
        ]),
        "daily": ",".join([
            "precipitation_sum",
            "rain_sum",
            "precipitation_probability_max",
            "weather_code",
        ]),
        "forecast_days": 3,
        "timezone": "Asia/Kolkata",
        "models": model_id,
        "precipitation_unit": "mm",
    }
    return http_json(OPEN_METEO, params)


def safe_num(value, default=0.0):
    try:
        value = float(value)
        return value if value == value else default
    except Exception:
        return default


def model_summary(data):
    hourly = data.get("hourly", {})
    daily = data.get("daily", {})

    rain = [safe_num(x) for x in hourly.get("precipitation", [])]
    prob = [safe_num(x) for x in hourly.get("precipitation_probability", [])]

    # Forecast is returned in local time and starts close to the current hour.
    # First 24 values are therefore the practical next-24h window.
    next24_rain = sum(rain[:24])
    peak_prob = max(prob[:24], default=0)

    daily_rain = [safe_num(x) for x in daily.get("precipitation_sum", [])]
    next72_rain = sum(daily_rain[:3])

    return {
        "next24_mm": next24_rain,
        "next72_mm": next72_rain,
        "peak_probability": peak_prob,
    }


def combine_model_results(results):
    valid = list(results.values())
    if not valid:
        return None

    rains24 = [x["next24_mm"] for x in valid]
    rains72 = [x["next72_mm"] for x in valid]
    probs = [x["peak_probability"] for x in valid]

    # Median is deliberately used instead of the mean so one outlier model
    # cannot dominate the alert.
    median24 = median(rains24)
    median72 = median(rains72)
    median_prob = median(probs)

    agreeing = sum(
        1 for x in valid
        if x["next24_mm"] >= SIGNAL_MM or x["peak_probability"] >= HIGH_PROB
    )

    spread = max(rains24) - min(rains24) if rains24 else 0
    agreement = agreeing / len(valid)

    if median72 >= VERY_HIGH_MM and agreeing >= MIN_MODEL_AGREEMENT and median_prob >= VERY_HIGH_PROB:
        level = "very_high"
    elif median24 >= HIGH_CONF_MM and agreeing >= MIN_MODEL_AGREEMENT and median_prob >= HIGH_PROB:
        level = "high"
    elif median24 >= SIGNAL_MM and agreeing >= MIN_MODEL_AGREEMENT:
        level = "moderate"
    else:
        level = "none"

    return {
        "next24_mm": median24,
        "next72_mm": median72,
        "peak_probability": median_prob,
        "model_rain_mm": rains24,
        "model_probability": probs,
        "agreeing_models": agreeing,
        "agreement_ratio": agreement,
        "spread_mm": spread,
        "level": level,
    }


def fetch_imd_warning_count():
    """
    Best-effort public IMD warning context.
    The quantitative mm forecast remains model-derived; IMD is an additional
    warning signal and is never treated as a rainfall-mm observation.
    """
    try:
        data = http_json(IMD_WARNINGS, {"id": 1})
        text = json.dumps(data, ensure_ascii=False).lower()
        warning_words = ["warning", "heavy", "very heavy", "extremely heavy", "thunderstorm"]
        return {
            "available": True,
            "warning_signal": any(word in text for word in warning_words),
            "raw_hint": text[:500],
        }
    except Exception as exc:
        return {
            "available": False,
            "warning_signal": False,
            "error": str(exc),
        }


def classify_location(location):
    model_results = {}
    errors = {}

    for name, model_id in MODELS.items():
        try:
            model_results[name] = model_summary(
                fetch_model(location, model_id)
            )
        except Exception as exc:
            errors[name] = str(exc)

    combined = combine_model_results(model_results)

    if not combined:
        return None

    return {
        "id": location.get("id"),
        "name": location.get("name"),
        "query": location.get("query"),
        "forecast": combined,
        "models": model_results,
        "errors": errors,
    }


def build_alert(results, imd):
    candidates = [
        x for x in results
        if x and x["forecast"]["level"] in {"high", "very_high"}
    ]

    # Sort by the conservative 24h ensemble estimate.
    candidates.sort(
        key=lambda x: (
            x["forecast"]["next24_mm"],
            x["forecast"]["next72_mm"],
        ),
        reverse=True,
    )

    candidates = candidates[:MAX_ALERT_LOCATIONS]

    if not candidates:
        return None

    now = datetime.now(timezone.utc)
    date_label = now.astimezone().strftime("%d-%m-%Y %I:%M %p")

    lines = [
        "🌧️ राजस्थान वर्षा अलर्ट",
        f"अपडेट: {date_label}",
        "",
        "अगले 24 घंटे के लिए उच्च-भरोसे वाला वर्षा संकेत मिला है:",
    ]

    for item in candidates:
        f = item["forecast"]
        lines.append(
            f"📍 {item['name']}: लगभग {f['next24_mm']:.1f} mm "
            f"(72 घंटे: {f['next72_mm']:.1f} mm, "
            f"मॉडल सहमति: {f['agreeing_models']}/{len(MODELS)})"
        )

    lines += [
        "",
        "यह अनुमान ECMWF + GFS + ICON के ensemble signal पर आधारित है।",
        "यह निश्चित गारंटी नहीं है; स्थानीय बादल/आंधी की स्थिति तेजी से बदल सकती है।",
    ]

    if imd.get("warning_signal"):
        lines.append("⚠️ IMD warning signal भी उपलब्ध है; स्थानीय चेतावनी देखें।")

    return {
        "key": "|".join(
            f"{x['id']}:{round(x['forecast']['next24_mm'], 1)}"
            for x in candidates
        ),
        "text": "\n".join(lines),
        "locations": candidates,
    }


def send_whatsapp(message: str):
    token = os.environ.get("WHATSAPP_TOKEN")
    phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
    recipient = os.environ.get("WHATSAPP_TO")
    template_name = os.environ.get("WHATSAPP_TEMPLATE_NAME", "rajasthan_rain_alert")
    language = os.environ.get("WHATSAPP_TEMPLATE_LANGUAGE", "hi")

    if not token or not phone_number_id or not recipient:
        print("WhatsApp secrets are not configured; alert will be logged only.")
        return False

    url = f"https://graph.facebook.com/v23.0/{phone_number_id}/messages"

    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": message[:3500]}
                    ],
                }
            ],
        },
    }

    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read().decode("utf-8")
        print("WhatsApp API response:", body)
        return 200 <= response.status < 300


def main():
    locations = load_locations()
    print(f"Monitoring {len(locations)} Rajasthan locations with {len(MODELS)} models.")

    results = []
    for location in locations:
        result = classify_location(location)
        if result:
            results.append(result)

    imd = fetch_imd_warning_count()
    alert = build_alert(results, imd)

    state = load_state()
    now = datetime.now(timezone.utc).isoformat()

    if not alert:
        print("No high-confidence rainfall alert.")
        state["last_checked_at"] = now
        state["last_alert_key"] = None
        save_state(state)
        return

    print(alert["text"])

    # Do not send the same alert every 3 hours.
    previous_key = state.get("last_alert_key")
    if previous_key == alert["key"]:
        print("Duplicate alert suppressed.")
        state["last_checked_at"] = now
        save_state(state)
        return

    sent = send_whatsapp(alert["text"])

    state["last_checked_at"] = now
    state["last_alert_key"] = alert["key"] if sent else previous_key
    state["last_alert_sent_at"] = now if sent else state.get("last_alert_sent_at")
    state["last_alert"] = {
        "key": alert["key"],
        "locations": [
            {
                "name": x["name"],
                "next24_mm": round(x["forecast"]["next24_mm"], 1),
                "next72_mm": round(x["forecast"]["next72_mm"], 1),
                "agreement": x["forecast"]["agreeing_models"],
            }
            for x in alert["locations"]
        ],
    }
    save_state(state)


if __name__ == "__main__":
    main()
