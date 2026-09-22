#!/usr/bin/env python3
"""
Village-level Rajasthan rainfall alert engine.

Design:
- Uses the village registry's centroid for each village.
- Queries ECMWF IFS 0.25, GFS seamless and ICON seamless in batches.
- Uses model agreement + weighted ensemble.
- Sends only materially wet/high-confidence villages to WhatsApp.
- Does not claim certainty and does not turn district warnings into village measurements.

Open-Meteo supports multi-location forecast requests; the engine batches the
Rajasthan village registry to stay inside API/location limits.
"""
from __future__ import annotations
import hashlib, json, os, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

API = "https://api.open-meteo.com/v1/forecast"
REGISTRY = Path("data/rajasthan-village-registry.json")
STATE = Path("data/village_rain_alert_state.json")
ACCURACY = Path("regional-accuracy-database.json")

BATCH = 900
SIGNAL_MM = 5.0
HIGH_MM = 10.0
VERY_HIGH_MM = 25.0
HIGH_PROB = 70.0
VERY_HIGH_PROB = 85.0
MAX_WHATSAPP_ROWS = 20

MODELS = {
    "ECMWF": "ecmwf_ifs025",
    "GFS": "ncep_gfs_seamless",
    "ICON": "icon_seamless",
}

def get_json(url, payload=None):
    if payload is None:
        req = Request(url, headers={"User-Agent": "Rajasthan-Rain-Predictor/2.0"})
    else:
        body = json.dumps(payload).encode()
        req = Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Rajasthan-Rain-Predictor/2.0",
            },
            method="POST",
        )
    with urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())

def chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i:i+size]

def load_registry():
    p = json.loads(REGISTRY.read_text(encoding="utf-8"))
    villages = p.get("villages", [])
    valid = [
        v for v in villages
        if v.get("name") and isinstance(v.get("latitude"), (int,float))
        and isinstance(v.get("longitude"), (int,float))
    ]
    return p, valid

def fetch_model(villages, model_name):
    output = {}
    for batch in chunks(villages, BATCH):
        payload = {
            "latitude": [str(v["latitude"]) for v in batch],
            "longitude": [str(v["longitude"]) for v in batch],
            "hourly": ["precipitation", "precipitation_probability", "rain", "showers"],
            "daily": ["precipitation_sum", "precipitation_probability_max"],
            "forecast_hours": 24,
            "forecast_days": 3,
            "timezone": "Asia/Kolkata",
            "models": model_name,
        }
        data = get_json(API, payload)
        records = data if isinstance(data, list) else [data]
        if len(records) != len(batch):
            raise RuntimeError(f"{model_name}: API returned {len(records)} records for {len(batch)} villages")
        for village, rec in zip(batch, records):
            h = rec.get("hourly", {})
            d = rec.get("daily", {})
            p24 = sum(float(x or 0) for x in h.get("precipitation", [])[:24])
            prob = max([float(x or 0) for x in h.get("precipitation_probability", [])[:24]] or [0])
            daily = [float(x or 0) for x in d.get("precipitation_sum", [])[:3]]
            p72 = sum(daily)
            output[village["id"]] = {
                "mm24": p24,
                "mm72": p72,
                "prob": prob,
            }
        time.sleep(0.25)
    return output

def load_weights():
    # Existing accuracy DB is ERA5/reanalysis-based, so this is a calibration aid,
    # not independent rain-gauge truth.
    try:
        data = json.loads(ACCURACY.read_text(encoding="utf-8"))
    except Exception:
        return {}
    locations = data.get("locations") or data.get("regions") or {}
    out = {}
    if isinstance(locations, list):
        for row in locations:
            name = str(row.get("name") or row.get("location") or "").strip().lower()
            if name:
                out[name] = row
    elif isinstance(locations, dict):
        for k, row in locations.items():
            out[str(k).strip().lower()] = row
    return out

def weight_for(village, weights):
    row = weights.get(str(village.get("district","")).strip().lower())
    if not isinstance(row, dict):
        return {"ECMWF":1/3,"GFS":1/3,"ICON":1/3}
    scores = {}
    for model in MODELS:
        key = model.lower()
        mae = None
        # Accept several shapes used by previous regional accuracy versions.
        candidates = row.get(model) or row.get(key) or row.get(f"{key}_lead_day_1")
        if isinstance(candidates, dict):
            mae = candidates.get("mae") or candidates.get("lead_day_1_mae")
        elif isinstance(candidates, (int,float)):
            mae = candidates
        if mae is not None:
            try:
                scores[model] = 1 / max(float(mae), 0.5)
            except Exception:
                pass
    if len(scores) < 2:
        return {"ECMWF":1/3,"GFS":1/3,"ICON":1/3}
    total = sum(scores.values())
    return {m: scores.get(m, 0) / total for m in MODELS}

def rank(villages, model_data, weights):
    rows = []
    for v in villages:
        per = {}
        for model in MODELS:
            per[model] = model_data[model].get(v["id"], {"mm24":0,"mm72":0,"prob":0})
        active = [m for m in MODELS if per[m]["mm24"] >= SIGNAL_MM or per[m]["prob"] >= HIGH_PROB]
        if len(active) < 2:
            continue
        w = weight_for(v, weights)
        mm24 = sum(w[m] * per[m]["mm24"] for m in MODELS)
        mm72 = sum(w[m] * per[m]["mm72"] for m in MODELS)
        prob = sum(w[m] * per[m]["prob"] for m in MODELS)
        if mm24 < SIGNAL_MM and prob < HIGH_PROB:
            continue
        tier = "VERY_HIGH" if mm24 >= VERY_HIGH_MM and prob >= VERY_HIGH_PROB and len(active) >= 2 else (
            "HIGH" if mm24 >= HIGH_MM or prob >= HIGH_PROB else "SIGNAL"
        )
        if tier == "SIGNAL":
            continue
        rows.append({
            "id": v["id"],
            "name": v["name"],
            "district": v.get("district",""),
            "tehsil": v.get("tehsil",""),
            "mm24": round(mm24,1),
            "mm72": round(mm72,1),
            "prob": round(prob),
            "agreement": len(active),
            "tier": tier,
        })
    rows.sort(key=lambda x: (x["tier"] != "VERY_HIGH", -x["mm24"], -x["prob"]))
    return rows

def send_whatsapp(message):
    token = os.getenv("WHATSAPP_TOKEN")
    phone_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    to = os.getenv("WHATSAPP_TO")
    template = os.getenv("WHATSAPP_TEMPLATE_NAME", "rajasthan_rain_alert")
    language = os.getenv("WHATSAPP_TEMPLATE_LANGUAGE", "hi")
    if not (token and phone_id and to):
        print("WhatsApp secrets not configured; alert will be logged only.")
        print(message)
        return False
    url = f"https://graph.facebook.com/v23.0/{phone_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": language},
            "components": [{"type":"body","parameters":[{"type":"text","text":message}]}],
        },
    }
    req = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type":"application/json"},
        method="POST",
    )
    with urlopen(req, timeout=45) as r:
        print("WhatsApp:", r.status, r.read().decode()[:500])
    return True

def main():
    if not REGISTRY.exists():
        raise SystemExit("Village registry missing. Run the village registry refresh workflow first.")
    meta, villages = load_registry()
    if len(villages) < 40000:
        raise SystemExit(f"Refusing village-wide alert: only {len(villages)} geocoded villages available.")
    print("Village coverage:", len(villages))

    model_data = {}
    for name, model in MODELS.items():
        print("Fetching", name)
        model_data[name] = fetch_model(villages, model)

    rows = rank(villages, model_data, load_weights())
    high = [r for r in rows if r["tier"] in ("HIGH","VERY_HIGH")]
    if not high:
        print("No high-confidence village rainfall signal.")
        STATE.write_text(json.dumps({
            "last_checked_at": datetime.now(timezone.utc).isoformat(),
            "last_alert_sent_at": None,
            "last_alert_key": None,
            "candidate_count": 0
        }, indent=2), encoding="utf-8")
        return

    top = high[:MAX_WHATSAPP_ROWS]
    lines = [
        "🌧️ राजस्थान गाँव-स्तरीय वर्षा अलर्ट",
        "अगले 24 घंटे में कई गाँवों के लिए उच्च-भरोसे वाला multi-model वर्षा संकेत मिला है।",
        "",
    ]
    for r in top:
        place = r["name"]
        if r["tehsil"]:
            place += f", {r['tehsil']}"
        if r["district"]:
            place += f", {r['district']}"
        lines.append(f"📍 {place}: ~{r['mm24']} mm | 72h ~{r['mm72']} mm | भरोसा: {r['tier']} | मॉडल: {r['agreement']}/3")
    lines += [
        "",
        f"कुल high-confidence candidate villages: {len(high)}",
        "नोट: यह ECMWF + GFS + ICON आधारित forecast है। गाँव में वास्तविक बारिश इससे अलग हो सकती है; इसे पक्की गारंटी न मानें।",
    ]
    message = "\n".join(lines)

    key = hashlib.sha256(
        "|".join(f"{r['id']}:{r['tier']}:{r['mm24']}" for r in top).encode()
    ).hexdigest()
    old = {}
    if STATE.exists():
        try: old = json.loads(STATE.read_text(encoding="utf-8"))
        except Exception: pass

    sent = False
    if old.get("last_alert_key") != key:
        sent = send_whatsapp(message)

    STATE.write_text(json.dumps({
        "last_checked_at": datetime.now(timezone.utc).isoformat(),
        "last_alert_sent_at": datetime.now(timezone.utc).isoformat() if sent else old.get("last_alert_sent_at"),
        "last_alert_key": key,
        "candidate_count": len(high),
        "top_villages": top,
        "coverage_records": len(villages)
    }, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
