/* =========================================================
   Rajasthan Rain Predictor
   Actual Rainfall Observation Engine
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY =
    "rrp_actual_observations_v1";

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function loadObservations() {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY);

      if (!raw) return [];

      const data = JSON.parse(raw);

      return Array.isArray(data)
        ? data
        : [];

    } catch (error) {
      console.warn(
        "Observation storage error:",
        error
      );

      return [];
    }
  }

  function saveObservations(data) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(data)
    );
  }

  function getLocation() {
    let latitude = null;
    let longitude = null;
    let name = "Selected Location";

    if (window.latestWeatherData) {

      const data =
        window.latestWeatherData;

      latitude =
        data.latitude ??
        data.lat ??
        data.location?.latitude ??
        data.location?.lat;

      longitude =
        data.longitude ??
        data.lon ??
        data.lng ??
        data.location?.longitude ??
        data.location?.lon ??
        data.location?.lng;

      name =
        data.locationName ??
        data.name ??
        data.location?.name ??
        name;
    }

    if (
      latitude === null &&
      window.RRP_BACKTEST
    ) {

      const location =
        window.RRP_BACKTEST
          .getLocation();

      if (location) {

        latitude =
          location.latitude;

        longitude =
          location.longitude;

        name =
          location.name ||
          name;
      }
    }

    return {
      latitude:
        Number(latitude),

      longitude:
        Number(longitude),

      name
    };
  }

  function getContainer() {

    let container =
      document.getElementById(
        "actualObservation"
      );

    if (container) {
      return container;
    }

    const accuracy =
      document.getElementById(
        "accuracy"
      );

    if (!accuracy) {
      return null;
    }

    container =
      document.createElement("div");

    container.id =
      "actualObservation";

    container.style.marginTop =
      "20px";

    accuracy.appendChild(
      container
    );

    return container;
  }

  function render() {

    const container =
      getContainer();

    if (!container) {
      return;
    }

    const observations =
      loadObservations();

    const location =
      getLocation();

    container.innerHTML = `

      <div style="
        padding:20px;
        border-radius:18px;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);
      ">

        <h3 style="
          margin:0 0 8px;
        ">
          📝 Actual Rainfall Observation
        </h3>

        <p style="
          margin:0 0 18px;
          font-size:13px;
          opacity:.75;
          line-height:1.6;
        ">
          Yahan manually verified rainfall
          observation record kar sakte hain.
          Ye data future accuracy calculation
          ke liye use hoga.
        </p>


        <div style="
          display:grid;
          grid-template-columns:
          repeat(auto-fit,minmax(180px,1fr));
          gap:12px;
          margin-bottom:14px;
        ">


          <div>

            <label style="
              display:block;
              font-size:12px;
              margin-bottom:6px;
            ">
              Date
            </label>

            <input
              id="observationDate"
              type="date"
              style="
                width:100%;
                box-sizing:border-box;
                padding:10px;
                border-radius:10px;
                border:1px solid rgba(255,255,255,.18);
                background:rgba(0,0,0,.2);
                color:inherit;
              "
            >

          </div>


          <div>

            <label style="
              display:block;
              font-size:12px;
              margin-bottom:6px;
            ">
              Rainfall (mm)
            </label>

            <input
              id="observationRain"
              type="number"
              min="0"
              step="0.1"
              placeholder="Example: 24.5"
              style="
                width:100%;
                box-sizing:border-box;
                padding:10px;
                border-radius:10px;
                border:1px solid rgba(255,255,255,.18);
                background:rgba(0,0,0,.2);
                color:inherit;
              "
            >

          </div>


          <div>

            <label style="
              display:block;
              font-size:12px;
              margin-bottom:6px;
            ">
              Source
            </label>

            <select
              id="observationSource"
              style="
                width:100%;
                box-sizing:border-box;
                padding:10px;
                border-radius:10px;
                border:1px solid rgba(255,255,255,.18);
                background:rgba(0,0,0,.2);
                color:inherit;
              "
            >

              <option value="Manual">
                Manual
              </option>

              <option value="Rain Gauge">
                Rain Gauge
              </option>

              <option value="IMD">
                IMD
              </option>

              <option value="Other">
                Other
              </option>

            </select>

          </div>

        </div>


        <div style="
          font-size:12px;
          opacity:.65;
          margin-bottom:14px;
        ">

          📍 Current location:
          ${escapeHTML(
            location.name
          )}

        </div>


        <button
          id="saveObservationBtn"
          type="button"
          style="
            width:100%;
            padding:13px;
            border:0;
            border-radius:12px;
            cursor:pointer;
            font-weight:700;
            font-size:14px;
          "
        >
          💾 Save Actual Rainfall
        </button>


        <div
          id="observationStatus"
          style="
            margin-top:12px;
            font-size:13px;
          "
        ></div>


        <div style="
          margin-top:22px;
        ">

          <h4 style="
            margin:0 0 12px;
          ">
            Saved Observations
          </h4>

          <div
            id="observationList"
          ></div>

        </div>

      </div>
    `;


    /*
      Default date = yesterday
    */

    const dateInput =
      document.getElementById(
        "observationDate"
      );

    if (dateInput) {

      const yesterday =
        new Date();

      yesterday.setDate(
        yesterday.getDate() - 1
      );

      const year =
        yesterday.getFullYear();

      const month =
        String(
          yesterday.getMonth() + 1
        ).padStart(2, "0");

      const day =
        String(
          yesterday.getDate()
        ).padStart(2, "0");

      dateInput.value =
        `${year}-${month}-${day}`;
    }


    const button =
      document.getElementById(
        "saveObservationBtn"
      );

    if (button) {

      button.addEventListener(
        "click",
        saveObservation
      );

    }


    renderList();
  }


  function saveObservation() {

    const date =
      document.getElementById(
        "observationDate"
      )?.value;

    const rain =
      Number(
        document.getElementById(
          "observationRain"
        )?.value
      );

    const source =
      document.getElementById(
        "observationSource"
      )?.value ||
      "Manual";


    const status =
      document.getElementById(
        "observationStatus"
      );


    if (!date) {

      if (status) {
        status.innerHTML =
          "❌ Date select karo.";
      }

      return;
    }


    if (
      !Number.isFinite(rain) ||
      rain < 0
    ) {

      if (status) {
        status.innerHTML =
          "❌ Rainfall mm mein valid number dalo.";
      }

      return;
    }


    const location =
      getLocation();


    if (
      !Number.isFinite(
        location.latitude
      ) ||
      !Number.isFinite(
        location.longitude
      )
    ) {

      if (status) {
        status.innerHTML =
          "❌ Pehle website par location search karo.";
      }

      return;
    }


    const observations =
      loadObservations();


    const record = {

      id:
        Date.now(),

      date,

      rainfall_mm:
        Math.round(
          rain * 10
        ) / 10,

      source,

      locationName:
        location.name,

      latitude:
        location.latitude,

      longitude:
        location.longitude,

      createdAt:
        new Date().toISOString()

    };


    /*
      Prevent duplicate record for the
      exact same location + date.
    */

    const filtered =
      observations.filter(
        function (item) {

          const sameDate =
            item.date === date;

          const sameLat =
            Math.abs(
              Number(item.latitude) -
              location.latitude
            ) < 0.01;

          const sameLon =
            Math.abs(
              Number(item.longitude) -
              location.longitude
            ) < 0.01;

          return !(
            sameDate &&
            sameLat &&
            sameLon
          );
        }
      );


    filtered.unshift(
      record
    );


    saveObservations(
      filtered
    );


    if (status) {

      status.innerHTML = `
        ✅ Actual rainfall saved:
        <strong>
          ${record.rainfall_mm} mm
        </strong>
      `;

    }


    const rainInput =
      document.getElementById(
        "observationRain"
      );

    if (rainInput) {
      rainInput.value = "";
    }


    renderList();


    /*
      Notify accuracy system.
    */

    window.dispatchEvent(
      new CustomEvent(
        "rrp:observation-saved",
        {
          detail: record
        }
      )
    );
  }


  function deleteObservation(id) {

    const observations =
      loadObservations();

    const updated =
      observations.filter(
        item =>
          item.id !== id
      );

    saveObservations(
      updated
    );

    renderList();
  }


  function renderList() {

    const list =
      document.getElementById(
        "observationList"
      );

    if (!list) {
      return;
    }

    const observations =
      loadObservations();


    if (!observations.length) {

      list.innerHTML = `
        <div style="
          padding:14px;
          border-radius:10px;
          background:rgba(255,255,255,.04);
          font-size:12px;
          opacity:.7;
        ">
          Abhi koi actual rainfall observation
          saved nahi hai.
        </div>
      `;

      return;
    }


    list.innerHTML =
      observations
        .slice(0, 20)
        .map(function (item) {

          return `

            <div style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:10px;
              padding:12px;
              margin-bottom:8px;
              border-radius:10px;
              background:rgba(255,255,255,.04);
              font-size:12px;
            ">

              <div>

                <strong>
                  ${escapeHTML(
                    item.date
                  )}
                </strong>

                <br>

                ${escapeHTML(
                  item.locationName
                )}

                <br>

                🌧️
                <strong>
                  ${item.rainfall_mm} mm
                </strong>

                ·
                ${escapeHTML(
                  item.source
                )}

              </div>


              <button
                type="button"
                data-delete-observation="${item.id}"
                style="
                  padding:7px 9px;
                  border:0;
                  border-radius:8px;
                  cursor:pointer;
                "
              >
                🗑️
              </button>

            </div>

          `;

        })
        .join("");


    list
      .querySelectorAll(
        "[data-delete-observation]"
      )
      .forEach(function (button) {

        button.addEventListener(
          "click",
          function () {

            const id =
              Number(
                this.dataset
                  .deleteObservation
              );

            deleteObservation(
              id
            );

          }
        );

      });
  }


  window.RRP_OBSERVATION = {

    getAll:
      loadObservations,

    save:
      saveObservation,

    render,

    delete:
      deleteObservation

  };


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      render
    );

  } else {

    render();

  }

})();
