/* =========================================================
   Rajasthan Rain Predictor
   Historical Backtest Dashboard
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "rrp_backtest_results_v1";

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function number(value, fallback = null) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function getResults() {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return [];
      }

      const data = JSON.parse(raw);

      return Array.isArray(data)
        ? data
        : [];
    } catch (error) {
      console.warn(
        "Backtest dashboard storage error:",
        error
      );

      return [];
    }
  }

  function getLatestResults() {
    const all =
      getResults();

    if (!all.length) {
      return [];
    }

    /*
      Group by:
      location + start date + end date + lead day
    */

    const groups = {};

    all.forEach(function (item) {

      const key =
        [
          item.locationName || "",
          item.startDate || "",
          item.endDate || "",
          item.leadDay || ""
        ].join("|");

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(item);

    });

    const keys =
      Object.keys(groups);

    if (!keys.length) {
      return [];
    }

    /*
      First group is the most recent because
      backtest-engine stores newest first.
    */

    return groups[keys[0]];
  }

  function metricValue(value, suffix = "") {
    const n =
      number(value);

    if (n === null) {
      return "--";
    }

    return `${n}${suffix}`;
  }

  function createContainer() {
    let container =
      document.getElementById(
        "backtestDashboard"
      );

    if (container) {
      return container;
    }

    const backtest =
      document.getElementById(
        "historicalBacktest"
      );

    if (!backtest) {
      return null;
    }

    container =
      document.createElement("div");

    container.id =
      "backtestDashboard";

    container.style.marginTop =
      "20px";

    backtest.appendChild(
      container
    );

    return container;
  }

  function renderEmpty() {
    const container =
      createContainer();

    if (!container) {
      return;
    }

    container.innerHTML = `
      <div style="
        padding:18px;
        border-radius:14px;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.08);
      ">

        <h3 style="
          margin:0 0 8px;
        ">
          📊 Backtest Dashboard
        </h3>

        <p style="
          margin:0;
          opacity:.75;
          font-size:13px;
          line-height:1.6;
        ">
          Abhi historical backtest result available nahi hai.
          Pehle <strong>Run Historical Backtest</strong>
          button press karein.
        </p>

      </div>
    `;
  }

  function renderDashboard() {

    const container =
      createContainer();

    if (!container) {
      return;
    }

    const results =
      getLatestResults();

    if (!results.length) {
      renderEmpty();
      return;
    }

    const location =
      results[0].locationName ||
      "Selected Location";

    const startDate =
      results[0].startDate ||
      "--";

    const endDate =
      results[0].endDate ||
      "--";

    const leadDay =
      results[0].leadDay ||
      "--";

    const validResults =
      results.filter(function (item) {
        return (
          number(item.pairs, 0) > 0
        );
      });

    const models =
      validResults.map(function (item) {

        return {
          name:
            item.model || "Unknown",

          mae:
            number(item.mae),

          rmse:
            number(item.rmse),

          bias:
            number(item.bias),

          accuracy:
            number(item.rainAccuracy),

          samples:
            number(item.pairs, 0)
        };

      });

    container.innerHTML = `

      <div style="
        padding:20px;
        border-radius:18px;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);
      ">

        <!-- HEADER -->

        <div style="
          margin-bottom:20px;
        ">

          <h3 style="
            margin:0 0 6px;
            font-size:21px;
          ">
            📊 Backtest Dashboard
          </h3>

          <div style="
            font-size:13px;
            opacity:.75;
            line-height:1.6;
          ">

            📍 ${escapeHTML(location)}
            <br>

            📅 ${escapeHTML(startDate)}
            →
            ${escapeHTML(endDate)}

            <br>

            🎯 Forecast Lead:
            <strong>
              D+${escapeHTML(leadDay)}
            </strong>

          </div>

        </div>


        <!-- MODEL CARDS -->

        <div style="
          display:grid;
          grid-template-columns:
          repeat(auto-fit,minmax(190px,1fr));
          gap:12px;
          margin-bottom:22px;
        ">

          ${models.map(function (model) {

            return `

              <div style="
                padding:16px;
                border-radius:14px;
                background:rgba(0,0,0,.18);
                border:1px solid rgba(255,255,255,.08);
              ">

                <div style="
                  font-size:17px;
                  font-weight:700;
                  margin-bottom:12px;
                ">
                  ${escapeHTML(model.name)}
                </div>

                <div style="
                  font-size:13px;
                  line-height:1.9;
                  opacity:.85;
                ">

                  MAE:
                  <strong>
                    ${metricValue(
                      model.mae,
                      " mm"
                    )}
                  </strong>

                  <br>

                  RMSE:
                  <strong>
                    ${metricValue(
                      model.rmse,
                      " mm"
                    )}
                  </strong>

                  <br>

                  Bias:
                  <strong>
                    ${metricValue(
                      model.bias,
                      " mm"
                    )}
                  </strong>

                  <br>

                  Rain/No-Rain:
                  <strong>
                    ${metricValue(
                      model.accuracy,
                      "%"
                    )}
                  </strong>

                  <br>

                  Samples:
                  <strong>
                    ${model.samples}
                  </strong>

                </div>

              </div>

            `;

          }).join("")}

        </div>


        <!-- MAE GRAPH -->

        <div style="
          margin-bottom:24px;
        ">

          <h4 style="
            margin:0 0 14px;
          ">
            📉 MAE Comparison
          </h4>

          <div>

            ${models.map(function (model) {

              const mae =
                model.mae === null
                  ? 0
                  : Math.max(
                      0,
                      model.mae
                    );

              const width =
                Math.min(
                  100,
                  mae * 15
                );

              return `

                <div style="
                  margin-bottom:12px;
                ">

                  <div style="
                    display:flex;
                    justify-content:space-between;
                    font-size:12px;
                    margin-bottom:5px;
                  ">

                    <span>
                      ${escapeHTML(
                        model.name
                      )}
                    </span>

                    <strong>
                      ${metricValue(
                        model.mae,
                        " mm"
                      )}
                    </strong>

                  </div>

                  <div style="
                    height:12px;
                    border-radius:20px;
                    background:rgba(255,255,255,.08);
                    overflow:hidden;
                  ">

                    <div style="
                      width:${width}%;
                      height:100%;
                      border-radius:20px;
                      background:currentColor;
                      opacity:.75;
                    "></div>

                  </div>

                </div>

              `;

            }).join("")}

          </div>

        </div>


        <!-- ACCURACY GRAPH -->

        <div style="
          margin-bottom:20px;
        ">

          <h4 style="
            margin:0 0 14px;
          ">
            🎯 Rain / No-Rain Verification
          </h4>

          ${models.map(function (model) {

            const accuracy =
              model.accuracy === null
                ? 0
                : Math.max(
                    0,
                    Math.min(
                      100,
                      model.accuracy
                    )
                  );

            return `

              <div style="
                margin-bottom:12px;
              ">

                <div style="
                  display:flex;
                  justify-content:space-between;
                  font-size:12px;
                  margin-bottom:5px;
                ">

                  <span>
                    ${escapeHTML(
                      model.name
                    )}
                  </span>

                  <strong>
                    ${metricValue(
                      model.accuracy,
                      "%"
                    )}
                  </strong>

                </div>

                <div style="
                  height:14px;
                  border-radius:20px;
                  background:rgba(255,255,255,.08);
                  overflow:hidden;
                ">

                  <div style="
                    width:${accuracy}%;
                    height:100%;
                    border-radius:20px;
                    background:currentColor;
                    opacity:.8;
                  "></div>

                </div>

              </div>

            `;

          }).join("")}

        </div>


        <!-- EXPLANATION -->

        <div style="
          padding:14px;
          border-radius:12px;
          background:rgba(255,193,7,.07);
          border:1px solid rgba(255,193,7,.15);
          font-size:12px;
          line-height:1.7;
          opacity:.85;
        ">

          ⚠️ <strong>Important:</strong>

          Ye dashboard historical forecast ko
          <strong>ERA5 reanalysis reference</strong>
          ke against compare karta hai.

          <br>

          Isko independent IMD/rain-gauge accuracy
          nahi maana jayega.

          <br>

          Final local accuracy system ke liye
          actual rainfall observations ko later
          connect kiya jayega.

        </div>

      </div>
    `;
  }

  function initialize() {

    /*
      Initial render
    */

    renderDashboard();

    /*
      Backtest ke baad dashboard automatically refresh.
    */

    const button =
      document.getElementById(
        "runBacktestBtn"
      );

    if (button) {

      button.addEventListener(
        "click",
        function () {

          /*
            Wait for backtest-engine to finish
            writing localStorage.
          */

          setTimeout(
            renderDashboard,
            1000
          );

          setTimeout(
            renderDashboard,
            3000
          );

          setTimeout(
            renderDashboard,
            6000
          );

        }
      );

    }

    /*
      Also refresh when weather/location changes.
    */

    window.addEventListener(
      "rrp:weather-updated",
      function () {
        setTimeout(
          renderDashboard,
          300
        );
      }
    );

  }

  window.RRP_BACKTEST_DASHBOARD = {
    render:
      renderDashboard,

    refresh:
      renderDashboard,

    getResults:
      getResults
  };

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initialize
    );

  } else {

    initialize();

  }

})();
