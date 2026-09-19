(function () {
    "use strict";

    /*
     * ============================================================
     * Rajasthan Rain Predictor
     * IMD Data Loader V1
     *
     * Purpose:
     * - Load server-generated IMD observation JSON
     * - Import valid IMD observations into localStorage
     * - Keep IMD data separate from forecast data
     * - Never create or estimate rainfall values
     *
     * Data source:
     * data/imd_observations.json
     * ============================================================
     */

    const VERSION = "1.0";

    const DATA_URL =
        "./data/imd_observations.json";

    const OBSERVATION_STORAGE_KEY =
        "rrp_actual_observations_v1";

    const IMPORT_MARKER_KEY =
        "rrp_imd_import_marker_v1";


    /*
     * ============================================================
     * LOGGING
     * ============================================================
     */

    function log(...args) {
        console.log(
            "[RRP IMD Data Loader V1]",
            ...args
        );
    }


    function warn(...args) {
        console.warn(
            "[RRP IMD Data Loader V1]",
            ...args
        );
    }


    /*
     * ============================================================
     * HELPERS
     * ============================================================
     */

    function number(
        value,
        fallback = null
    ) {
        const n = Number(value);

        return Number.isFinite(n)
            ? n
            : fallback;
    }


    function cleanText(value) {
        return String(
            value ?? ""
        ).trim();
    }


    function normalizeText(value) {
        return cleanText(value)
            .toLowerCase()
            .replace(
                /\s+/g,
                " "
            );
    }


    function normalizeDate(value) {

        if (!value) {
            return null;
        }

        const text =
            cleanText(value);

        /*
         * Already YYYY-MM-DD
         */
        const isoMatch =
            text.match(
                /^(\d{4}-\d{2}-\d{2})/
            );

        if (isoMatch) {
            return isoMatch[1];
        }


        /*
         * DD-MM-YYYY
         */
        const dmyMatch =
            text.match(
                /^(\d{2})[-/](\d{2})[-/](\d{4})/
            );

        if (dmyMatch) {

            return (
                dmyMatch[3] +
                "-" +
                dmyMatch[2] +
                "-" +
                dmyMatch[1]
            );
        }


        /*
         * DD/MM/YY
         */
        const shortMatch =
            text.match(
                /^(\d{2})[-/](\d{2})[-/](\d{2})$/
            );

        if (shortMatch) {

            return (
                "20" +
                shortMatch[3] +
                "-" +
                shortMatch[2] +
                "-" +
                shortMatch[1]
            );
        }


        const parsed =
            new Date(text);

        if (
            Number.isNaN(
                parsed.getTime()
            )
        ) {
            return null;
        }


        return (
            parsed.getFullYear() +
            "-" +
            String(
                parsed.getMonth() + 1
            ).padStart(2, "0") +
            "-" +
            String(
                parsed.getDate()
            ).padStart(2, "0")
        );
    }


    function makeKey(
        observation
    ) {

        const district =
            normalizeText(
                observation.district
            );

        const date =
            normalizeDate(
                observation.date
            );

        const rainfall =
            number(
                observation.rainfall_mm
            );

        return [
            "IMD",
            district,
            date || "",
            rainfall === null
                ? ""
                : rainfall
        ].join("|");
    }


    /*
     * ============================================================
     * LOCAL STORAGE
     * ============================================================
     */

    function readObservations() {

        try {

            const raw =
                localStorage.getItem(
                    OBSERVATION_STORAGE_KEY
                );

            if (!raw) {
                return [];
            }

            const data =
                JSON.parse(raw);

            return Array.isArray(data)
                ? data
                : [];

        } catch (error) {

            warn(
                "Could not read existing observations:",
                error
            );

            return [];
        }
    }


    function saveObservations(
        observations
    ) {

        try {

            localStorage.setItem(
                OBSERVATION_STORAGE_KEY,
                JSON.stringify(
                    observations
                )
            );

            return true;

        } catch (error) {

            warn(
                "Could not save observations:",
                error
            );

            return false;
        }
    }


    /*
     * ============================================================
     * VALIDATION
     * ============================================================
     */

    function isValidIMDRecord(
        record
    ) {

        if (!record) {
            return false;
        }


        const district =
            cleanText(
                record.district
            );

        const date =
            normalizeDate(
                record.date
            );

        const rainfall =
            number(
                record.rainfall_mm
            );


        if (!district) {
            return false;
        }

        if (!date) {
            return false;
        }

        if (
            rainfall === null ||
            rainfall < 0
        ) {
            return false;
        }


        return true;
    }


    /*
     * ============================================================
     * IMD RECORD NORMALIZATION
     * ============================================================
     */

    function normalizeIMDRecord(
        record
    ) {

        if (
            !isValidIMDRecord(
                record
            )
        ) {
            return null;
        }


        const district =
            cleanText(
                record.district
            );

        const date =
            normalizeDate(
                record.date
            );

        const rainfall =
            number(
                record.rainfall_mm
            );


        return {

            /*
             * Existing verification engine fields
             */
            locationName:
                district +
                ", Rajasthan",

            location:
                district +
                ", Rajasthan",

            name:
                district +
                ", Rajasthan",

            district:
                district,

            state:
                "Rajasthan",

            latitude:
                null,

            longitude:
                null,

            date:
                date,

            validDate:
                date,

            observationDate:
                date,

            rainfall_mm:
                rainfall,

            rainfallMm:
                rainfall,

            actualRainMm:
                rainfall,

            precipitation_mm:
                rainfall,

            source:
                "IMD",

            observationSource:
                "IMD District-wise Rainfall",

            sourceProduct:
                "District-wise Rainfall",

            sourceUrl:
                cleanText(
                    record.source_url ||
                    record.source ||
                    DATA_URL
                ),

            periodType:
                cleanText(
                    record.period_type ||
                    "IMD_DAILY"
                ),

            dailyNormalMm:
                number(
                    record.daily_normal_mm
                ),

            dailyDeparture:
                cleanText(
                    record.daily_departure
                ),

            dailyCategory:
                cleanText(
                    record.daily_category
                ),

            importedAt:
                new Date().toISOString(),

            independent:
                true
        };
    }


    /*
     * ============================================================
     * LOAD SERVER DATA
     * ============================================================
     */

    async function fetchIMDData() {

        log(
            "Loading server-generated IMD data..."
        );

        log(
            "URL:",
            DATA_URL
        );


        let response;

        try {

            response =
                await fetch(
                    DATA_URL +
                    "?v=" +
                    Date.now(),
                    {
                        cache: "no-store"
                    }
                );

        } catch (error) {

            warn(
                "Could not fetch IMD JSON:",
                error
            );

            return null;
        }


        if (!response.ok) {

            warn(
                "IMD JSON HTTP error:",
                response.status
            );

            return null;
        }


        try {

            return await response.json();

        } catch (error) {

            warn(
                "IMD JSON parsing failed:",
                error
            );

            return null;
        }
    }


    /*
     * ============================================================
     * IMPORT
     * ============================================================
     */

    function importRecords(
        payload
    ) {

        if (!payload) {

            return {
                imported: 0,
                skipped: 0,
                total: 0
            };
        }


        log(
            "Server data status:",
            payload.status
        );


        /*
         * If the collector could not access IMD,
         * do absolutely nothing.
         */

        if (
            payload.status !==
            "success"
        ) {

            log(
                "No verified IMD data available."
            );

            if (
                payload.error
            ) {

                log(
                    "Collector message:",
                    payload.error
                );
            }

            return {
                imported: 0,
                skipped: 0,
                total: 0
            };
        }


        const records =
            Array.isArray(
                payload.records
            )
                ? payload.records
                : [];


        if (!records.length) {

            log(
                "IMD JSON contains zero records."
            );

            return {
                imported: 0,
                skipped: 0,
                total: 0
            };
        }


        const existing =
            readObservations();


        const existingKeys =
            new Set();


        existing.forEach(
            function (item) {

                if (
                    item &&
                    item.source ===
                    "IMD"
                ) {

                    existingKeys.add(
                        makeKey({
                            district:
                                item.district,

                            date:
                                item.date,

                            rainfall_mm:
                                item.rainfall_mm
                        })
                    );
                }
            }
        );


        let imported = 0;

        let skipped = 0;


        records.forEach(
            function (record) {

                const normalized =
                    normalizeIMDRecord(
                        record
                    );


                if (!normalized) {

                    skipped++;

                    return;
                }


                const key =
                    makeKey(
                        normalized
                    );


                if (
                    existingKeys.has(
                        key
                    )
                ) {

                    skipped++;

                    return;
                }


                existing.push(
                    normalized
                );


                existingKeys.add(
                    key
                );


                imported++;
            }
        );


        /*
         * Keep the observation store manageable.
         *
         * We retain up to 5000 observations.
         */

        existing.sort(
            function (a, b) {

                return String(
                    b.date || ""
                ).localeCompare(
                    String(
                        a.date || ""
                    )
                );
            }
        );


        const trimmed =
            existing.slice(
                0,
                5000
            );


        const saved =
            saveObservations(
                trimmed
            );


        if (!saved) {

            return {
                imported: 0,
                skipped,
                total: existing.length
            };
        }


        /*
         * Save a lightweight import marker.
         */

        try {

            localStorage.setItem(
                IMPORT_MARKER_KEY,
                JSON.stringify({

                    version:
                        VERSION,

                    importedAt:
                        new Date()
                            .toISOString(),

                    serverGeneratedAt:
                        payload.generated_at_utc ||
                        null,

                    recordCount:
                        records.length,

                    imported:
                        imported
                })
            );

        } catch (error) {

            warn(
                "Could not save import marker:",
                error
            );
        }


        log(
            "IMD records imported:",
            imported
        );

        log(
            "IMD records skipped:",
            skipped
        );

        log(
            "Total local observations:",
            trimmed.length
        );


        return {
            imported,
            skipped,
            total: trimmed.length
        };
    }


    /*
     * ============================================================
     * PUBLIC RUN
     * ============================================================
     */

    async function run() {

        log(
            "===================================="
        );

        log(
            "IMD DATA LOADER V1 START"
        );

        log(
            "===================================="
        );


        const payload =
            await fetchIMDData();


        if (!payload) {

            return {
                imported: 0,
                skipped: 0,
                total: 0
            };
        }


        const result =
            importRecords(
                payload
            );


        log(
            "===================================="
        );

        log(
            "IMD DATA LOADER V1 COMPLETE"
        );

        log(
            "===================================="
        );


        /*
         * Tell other engines that new observation
         * data may now be available.
         */

        try {

            window.dispatchEvent(
                new CustomEvent(
                    "rrp:imd-data-loaded",
                    {
                        detail: result
                    }
                )
            );

        } catch (error) {

            /*
             * Older browsers may not support
             * CustomEvent construction exactly
             * the same way. Ignore silently.
             */

            warn(
                "Could not dispatch IMD event:",
                error
            );
        }


        return result;
    }


    /*
     * ============================================================
     * PUBLIC API
     * ============================================================
     */

    window.RRP_IMD_DATA_LOADER = {

        version:
            VERSION,

        run:
            run,

        getObservations:
            readObservations
    };


    /*
     * ============================================================
     * STARTUP
     * ============================================================
     */

    function startup() {

        setTimeout(
            function () {

                run()
                    .catch(
                        function (error) {

                            console.error(
                                "[RRP IMD Data Loader V1] Startup failed:",
                                error
                            );

                        }
                    );

            },
            1500
        );
    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            startup
        );

    } else {

        startup();
    }


    log(
        "IMD Data Loader V1 loaded."
    );

})();
