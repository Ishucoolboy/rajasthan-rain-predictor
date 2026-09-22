"""
Phase G — Village Bias Calibration Builder.

Builds a transparent calibration layer from the existing verification database.
Important: the current regional database uses ERA5/Open-Meteo reanalysis, not
independent village rain gauges. Therefore these are priors, not ground truth.
Village-specific observations can override the district prior when available.
"""
import json
from pathlib import Path
from datetime import datetime, timezone

REGIONAL=Path("regional-accuracy-database.json")
OUT=Path("data/village-bias-calibration.json")
REGISTRY=Path("data/rajasthan-village-registry.json")

def main():
    if not REGIONAL.exists():
        raise SystemExit("regional-accuracy-database.json missing")
    db=json.loads(REGIONAL.read_text(encoding="utf-8"))
    locations=db.get("locations",[])
    districts={}
    for item in locations:
        loc=item.get("location",{})
        name=loc.get("name") or loc.get("id")
        models={}
        for model in item.get("models",[]):
            leads=model.get("leads",[])
            l1=next((x for x in leads if x.get("lead_day")==1),None)
            if not l1: continue
            m=l1.get("metrics",{})
            bias=float(m.get("bias_mm",0) or 0)
            mae=float(m.get("mae_mm",0) or 0)
            if mae>0:
                models[model.get("model_id")]={
                    "biasMm":round(bias,4),
                    "maeMm":round(mae,4),
                    "samples":int(m.get("samples",0) or 0)
                }
        if name and models:
            districts[str(name).strip().lower()]={
                "name":name,
                "source":"district reanalysis verification",
                "models":models
            }

    registry_count=0
    if REGISTRY.exists():
        try:
            reg=json.loads(REGISTRY.read_text(encoding="utf-8"))
            registry_count=int(reg.get("coordinate_records",len(reg.get("villages",[]))))
        except Exception:
            registry_count=0

    payload={
        "version":1,
        "generatedAtUtc":datetime.now(timezone.utc).isoformat(),
        "phase":"G",
        "method":"hierarchical calibration: village observation override -> district prior -> no correction",
        "observationPolicy":{
            "independentVillageObservation": "preferred",
            "districtReanalysis": "current fallback prior only",
            "minimumVillageSamples":30,
            "minimumDistrictSamples":30
        },
        "coverage":{
            "registryCoordinateRecords":registry_count,
            "districtPriors":len(districts)
        },
        "districtPriors":districts,
        "villageOverrides":{},
        "warning":"Current district priors are based on ERA5/Open-Meteo reanalysis and must not be presented as independent rain-gauge accuracy."
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("Wrote",OUT,"district priors",len(districts),"registry records",registry_count)

if __name__=="__main__":
    main()
