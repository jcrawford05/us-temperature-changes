// ==============================
// State Detail Page Script (Delta ready, Zoom enabled, Correct padding, Correct city temps)
// ==============================

// ------------------------------
// Global zoom scale for dot size
// ------------------------------
let currentZoomScale = 1;

// ------------------------------
// Get state from query
// ------------------------------
const params = new URLSearchParams(window.location.search);
const selectedState = params.get("state");

if (selectedState) {
    document.getElementById("state-header").textContent = `${selectedState} — Temperature View`;
    document.getElementById("state-title").textContent = `Average Temperatures in ${selectedState}`;
    document.title = `${selectedState} — State Temperature View`;
}

// Back button
document.getElementById("back-btn").addEventListener("click", () => {
    window.location.href = "../index.html";
});

// Controls
const monthYearInput = d3.select("#monthyear");
const monthYearLabel = d3.select("#monthyear-label");
const unitToggle = d3.select("#unit-toggle");
const dataToggle = d3.select("#data-toggle");

const displayToggle = d3.select("#display-toggle");
const baseRange = d3.select("#base-range");
const endRange  = d3.select("#end-range");
const baseLabel = d3.select("#base-label");
const endLabel  = d3.select("#end-label");
const endRow    = d3.select("#end-row");

let currentUnit = "F";
let currentDataset = "monthly";
let currentYear = 1800;
let currentMonth = 1;

let displayMode = "average";
let baseYear = 1800, baseMonth = 1;
let endYear  = 2000, endMonth  = 1;

const START_YEAR = 1800;
const END_YEAR   = 2013;

// Comparison state (for line chart)
let compareState = null;

// Tooltip for line chart hover
const lineTooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);


// SVGs
const svgState = d3.select("#stateview");
const svgLine = d3.select("#linechart");

// Tooltip
const cityTooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

// Color Scales
const colorScaleF = d3.scaleSequential().interpolator(d3.interpolateTurbo);
const colorScaleC = d3.scaleSequential().interpolator(d3.interpolateTurbo);

// Helpers
const idxFromYM = (y,m) => (y - START_YEAR) * 12 + (m - 1);
const ymFromIdx = i => [START_YEAR + Math.floor(i/12), (i % 12) + 1];
function monthName(m) {
    return new Date(2000, m - 1).toLocaleString("default", { month: "short" });
}
function fmtLabel(y,m,isMonthly) {
    return isMonthly ? `${monthName(m)}-${y}` : `${y}`;
}

// ------------------------------
// Load all data
// ------------------------------
Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.csv("../data/state_yearly_avg.csv"),
    d3.csv("../data/state_monthly_avg.csv"),
    d3.csv("../data/city_monthly_avg.csv")
]).then(([us, yearly, monthly, cities]) => {

    const geo = topojson.feature(us, us.objects.states).features;
    const stateFeature = geo.find(f => f.properties.name === selectedState);

    // Clean state yearly
    yearly.forEach(d => {
        d.Year = +d.Year;
        d.AvgTemp_F_Yearly = +d.AvgTemp_F_Yearly;
        d.AvgTemp_C_Yearly = +d.AvgTemp_C_Yearly;
    });

    // Clean state monthly
    monthly.forEach(d => {
        d.dt = new Date(d.dt);
        d.Year = d.dt.getFullYear();
        d.Month = d.dt.getMonth() + 1;
        d.AvgTemp_F = +d.AvgTemp_F;
        d.AvgTemp_C = +d.AvgTemp_C;
    });

    // Clean cities with correct fields
    cities.forEach(d => {
        d.dt = new Date(d.dt);
        d.Year = d.dt.getFullYear();
        d.Month = d.dt.getMonth() + 1;

        d.AvgTemp_C = +d.AvgTemp_C;
        d.AverageTemperatureF = +d.AverageTemperatureF;

        d.Latitude = +d.Latitude;
        d.Longitude = +d.Longitude;
    });

    const stateYearly = yearly.filter(d => d.State === selectedState);
    const stateMonthly = monthly.filter(d => d.State === selectedState);
    const stateCities  = cities.filter(c => c.State === selectedState);

    // ================================
    // Comparison dropdown (line chart)
    // ================================
    const compareSelect = document.getElementById("compare-select");
    if (compareSelect) {
        const allStates = Array.from(new Set(monthly.map(d => d.State))).sort();

        allStates.forEach(s => {
            if (s === selectedState) return;
            const opt = document.createElement("option");
            opt.value = s;
            opt.textContent = s;
            compareSelect.appendChild(opt);
        });

        compareSelect.addEventListener("change", e => {
            compareState = e.target.value || null;
            updateView();
        });
    }

    const totalMonths = (END_YEAR - START_YEAR + 1) * 12 - 1;

    monthYearInput
        .attr("min", 0)
        .attr("max", totalMonths)
        .property("value", 0);

    monthYearLabel.text("Jan-1800");

    drawStateMap(stateFeature, stateMonthly, currentMonth, currentYear, stateCities);
    drawLineChart(stateMonthly, "monthly");
    // Compute clean filtered datasets for stats
    const mKey = currentUnit === "F" ? "AvgTemp_F" : "AvgTemp_C";
    const yKey = currentUnit === "F" ? "AvgTemp_F_Yearly" : "AvgTemp_C_Yearly";

    // Monthly filtered
    const cleanMonthly = stateMonthly
        .filter(d => d[mKey] != null && d[mKey] !== 0 && !isNaN(d[mKey]))
        .map(d => ({ Year: d.Year, Month: d.Month, value: d[mKey] }));

    // Yearly filtered
    const cleanYearly = stateYearly
        .filter(d => d[yKey] != null && d[yKey] !== 0 && !isNaN(d[yKey]));

    // Regression slope from your drawLineChart
    const slope = window.lastComputedSlope || null;
    window.lastComputedSlope = slope;


    // Update stats panel
    updateStatsPanel(cleanMonthly, cleanYearly, slope);

    initAnalyticsSliders();

    // ------------------------------
    // View update logic
    // ------------------------------
    function updateView() {
        const mode = currentDataset === "yearly" ? "yearly" : "monthly";

        let mainData;
        if (mode === "yearly") {
            monthYearInput
                .attr("min", START_YEAR)
                .attr("max", END_YEAR)
                .property("value", currentYear);

            monthYearLabel.text(currentYear);
            mainData = stateYearly;
        } else {
            const idx = idxFromYM(currentYear, currentMonth);
            monthYearInput.property("value", idx);

            monthYearLabel.text(`${monthName(currentMonth)}-${currentYear}`);
            mainData = stateMonthly;
        }

        // Comparison data (if selected)
        let compareData = null;
        if (compareState) {
            compareData = mode === "yearly"
                ? yearly.filter(d => d.State === compareState)
                : monthly.filter(d => d.State === compareState);
        }

        // Draw map (uses mainData only)
        if (mode === "yearly") {
            drawStateMap(stateFeature, mainData, 1, currentYear, stateCities);
        } else {
            drawStateMap(stateFeature, mainData, currentMonth, currentYear, stateCities);
        }

        // Draw line chart (main + compare)
        drawLineChart(mainData, mode, compareData);

        initAnalyticsSliders();

        // Stats panel (if you added updateStatsPanel earlier)
        const mKey = currentUnit === "F" ? "AvgTemp_F" : "AvgTemp_C";
        const yKey = currentUnit === "F" ? "AvgTemp_F_Yearly" : "AvgTemp_C_Yearly";

        const cleanMonthly = stateMonthly
            .filter(d => d[mKey] != null && d[mKey] !== 0 && !isNaN(d[mKey]))
            .map(d => ({ Year: d.Year, Month: d.Month, value: d[mKey] }));

        const cleanYearly = stateYearly
            .filter(d => d[yKey] != null && d[yKey] !== 0 && !isNaN(d[yKey]));

        if (typeof updateStatsPanel === "function") {
            updateStatsPanel(cleanMonthly, cleanYearly, window.lastComputedSlope || null);
        }
    }

    // ------------------------------
    // Slider changes
    // ------------------------------
    monthYearInput.on("input", e => {
        if (currentDataset === "yearly") {
            currentYear = +e.target.value;
            monthYearLabel.text(currentYear);
        } else {
            const index  = +e.target.value;
            const year   = START_YEAR + Math.floor(index / 12);
            const month  = (index % 12) + 1;

            currentYear  = year;
            currentMonth = month;

            monthYearLabel.text(`${monthName(month)}-${year}`);
        }

        updateView();
    });


    unitToggle.on("change", e => {
        currentUnit = e.target.checked ? "C" : "F";
        updateView();
    });

    dataToggle.on("change", e => {
        currentDataset = e.target.checked ? "yearly" : "monthly";
        updateView();
    });

    displayToggle.on("change", e => {
        displayMode = e.target.checked ? "delta" : "average";

        const panel = document.querySelector(".analytics");
        panel.style.display = displayMode === "delta" ? "block" : "none";

        const slider = document.getElementById("monthyear");
        slider.disabled = displayMode === "delta";
        slider.style.opacity = displayMode === "delta" ? "0.4" : "1.0";

        document.getElementById("end-row").style.display = displayMode === "delta" ? "grid" : "none";
        document.querySelector(".range-row").style.display = displayMode === "delta" ? "grid" : "none";

        updateView();
    });

    // Base slider
    baseRange.on("input", e => {
        if (currentDataset === "yearly") {
            baseYear = +e.target.value;
            if (endYear < baseYear) endYear = baseYear;

            baseLabel.text(fmtLabel(baseYear, 1, false));
            endLabel.text(fmtLabel(endYear, 1, false));

        } else {
            let [y, m] = ymFromIdx(+e.target.value);
            baseYear = y;
            baseMonth = m;

            if (endYear < y || (endYear === y && endMonth < m)) {
                endYear = y;
                endMonth = m;
                endRange.property("value", idxFromYM(endYear, endMonth));
            }

            baseLabel.text(fmtLabel(baseYear, baseMonth, true));
            endLabel.text(fmtLabel(endYear, endMonth, true));
        }

        updateView();
    });

    // End slider
    endRange.on("input", e => {
        if (currentDataset === "yearly") {
            endYear = Math.max(+e.target.value, baseYear);
            endLabel.text(fmtLabel(endYear, 1, false));

        } else {
            let [y, m] = ymFromIdx(+e.target.value);

            if (y < baseYear || (y === baseYear && m < baseMonth)) {
                y = baseYear;
                m = baseMonth;
            }

            endYear   = y;
            endMonth  = m;

            endLabel.text(fmtLabel(endYear, endMonth, true));
        }

        updateView();
    });

    // Init sliders
    function initAnalyticsSliders() {
        if (currentDataset === "yearly") {
            baseRange.attr("min", START_YEAR)
                .attr("max", END_YEAR)
                .property("value", baseYear);

            endRange.attr("min", START_YEAR)
                .attr("max", END_YEAR)
                .property("value", endYear);

            baseLabel.text(fmtLabel(baseYear, 1, false));
            endLabel.text(fmtLabel(endYear, 1, false));

        } else {
            const maxIdx = totalMonths;

            baseRange.attr("min", 0)
                .attr("max", maxIdx)
                .property("value", idxFromYM(baseYear, baseMonth));

            endRange.attr("min", 0)
                .attr("max", maxIdx)
                .property("value", idxFromYM(endYear, endMonth));

            baseLabel.text(fmtLabel(baseYear, baseMonth, true));
            endLabel.text(fmtLabel(endYear, endMonth, true));
        }

        endRow.style("display", displayMode === "delta" ? "grid" : "none");
    }
});

// ========================================================================
// DRAW STATE MAP
// ========================================================================
function drawStateMap(stateFeature, data, month, year, stateCities) {

    svgState.selectAll("*").remove();

    // Get container size
    const node = document.getElementById("stateview");
    const width  = node.clientWidth  || 980;
    const height = node.clientHeight || 600;

    // Internal padding so tips don't clip
    const innerMargin = { top: 30, right: 30, bottom: 70, left: 30 };

    // Zoom group
    const g = svgState.append("g").attr("class", "zoom-layer");

    // Zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([1, 12])
        .on("zoom", event => {

            currentZoomScale = event.transform.k;

            g.attr("transform", event.transform);

            g.selectAll(".city-dot")
                .filter(function() { return !d3.select(this).classed("hovered"); })
                .attr("r", 4 / currentZoomScale);
        });

    svgState.call(zoom);

    // Projection with padding
    const projection = d3.geoMercator()
        .fitExtent(
            [
                [innerMargin.left, innerMargin.top],
                [width - innerMargin.right, height - innerMargin.bottom]
            ],
            stateFeature
        );

    const path = d3.geoPath(projection);
    const neutralFill = "var(--nodata)";

    // Choose correct key for state temp
    const key =
        currentUnit === "F"
            ? (data[0].AvgTemp_F_Yearly !== undefined ? "AvgTemp_F_Yearly" : "AvgTemp_F")
            : (data[0].AvgTemp_C_Yearly !== undefined ? "AvgTemp_C_Yearly" : "AvgTemp_C");

    // =====================================================
    // Average Mode
    // =====================================================
    if (displayMode === "average") {

        const filtered = data[0].Month
            ? data.filter(d => d.Year === year && d.Month === month)
            : data.filter(d => d.Year === year);

        const tempVal = filtered.length ? +filtered[0][key] : null;

        const scale = currentUnit === "F" ? colorScaleF : colorScaleC;
        scale.domain([0, currentUnit === "F" ? 90 : 32]);

        // Draw state
        g.append("path")
            .datum(stateFeature)
            .attr("d", path)
            .attr("fill", tempVal == null ? neutralFill : scale(tempVal))
            .attr("stroke", "var(--border)")
            .attr("stroke-width", 1.6);

        // City temperature key
        const keyCity = currentUnit === "F"
            ? "AverageTemperatureF"
            : "AvgTemp_C";

        // Filter cities
        const cityData = data[0].Month
            ? stateCities.filter(c => c.Year === year && c.Month === month)
            : stateCities.filter(c => c.Year === year);

        // Draw city dots
        g.selectAll(".city-dot")
            .data(cityData)
            .enter()
            .append("circle")
            .attr("class", "city-dot")
            .attr("cx", d => {
                const p = projection([d.Longitude, d.Latitude]);
                return p ? p[0] : null;
            })
            .attr("cy", d => {
                const p = projection([d.Longitude, d.Latitude]);
                return p ? p[1] : null;
            })
            .attr("r", 4)
            .attr("fill", d => {
                const v = d[keyCity];
                return (v == null || isNaN(v)) ? neutralFill : scale(v);
            })
            .attr("stroke", "var(--card)")
            .attr("stroke-width", 1.4)

            // Hover behavior
            .on("mouseover", function(e, d) {
                d3.select(this).classed("hovered", true);
                d3.select(this)
                    .transition().duration(120)
                    .attr("r", 7)
                    .attr("stroke", "var(--accent)")
                    .attr("stroke-width", 2);

                const v = d[keyCity];

                const text = (v == null || isNaN(v))
                    ? `${d.City}: No data`
                    : `${d.City}: ${v.toFixed(1)} °${currentUnit}`;

                cityTooltip
                    .style("opacity", 1)
                    .html(text)
                    .style("left", (e.pageX + 12) + "px")
                    .style("top", (e.pageY - 28) + "px");
            })
            .on("mousemove", function(e) {
                cityTooltip
                    .style("left", (e.pageX + 12) + "px")
                    .style("top", (e.pageY - 28) + "px");
            })
            .on("mouseout", function() {
                d3.select(this).classed("hovered", false);
                d3.select(this)
                    .transition().duration(120)
                    .attr("r", 4 / currentZoomScale)
                    .attr("stroke", "var(--card)")
                    .attr("stroke-width", 1.4);

                cityTooltip.style("opacity", 0);
            });

        // Bottom label
        svgState.append("text")
            .attr("x", width / 2)
            .attr("y", height - innerMargin.bottom / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "var(--text)")
            .attr("font-size", "14px")
            .text(
                tempVal == null
                    ? `No data for ${data[0].Month ? monthName(month) + " " : ""}${year}`
                    : `${data[0].Month ? monthName(month) + " " : ""}${year} Avg: ${tempVal.toFixed(1)} °${currentUnit}`
            );

        return;
    }

    // =====================================================
    // DELTA MODE
    // =====================================================
    const keyF = data[0].AvgTemp_F_Yearly !== undefined ? "AvgTemp_F_Yearly" : "AvgTemp_F";
    const keyC = data[0].AvgTemp_C_Yearly !== undefined ? "AvgTemp_C_Yearly" : "AvgTemp_C";
    const keyUse = currentUnit === "F" ? keyF : keyC;

    const valAt = (Y, M) => {
        const rows = data[0].Month
            ? data.filter(d => d.Year === Y && d.Month === M)
            : data.filter(d => d.Year === Y);

        return rows[0] && !isNaN(rows[0][keyUse]) ? +rows[0][keyUse] : null;
    };

    const b = valAt(baseYear, baseMonth);
    const e = valAt(endYear, endMonth);
    const delta = (b == null || e == null) ? null : (e - b);

    const maxAbs = delta == null ? 1 : Math.max(Math.abs(delta), 1);

    const deltaScale = d3.scaleSequential()
        .domain([maxAbs, -maxAbs])
        .interpolator(d3.interpolateRdBu);

    g.append("path")
        .datum(stateFeature)
        .attr("d", path)
        .attr("fill", delta == null ? neutralFill : deltaScale(delta))
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 1.6);

    svgState.append("text")
        .attr("x", width / 2)
        .attr("y", height - innerMargin.bottom / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--text)")
        .attr("font-size", "14px")
        .text(
            delta == null
                ? `Delta Temperature: No data`
                : `Delta Temperature: ${(delta >= 0 ? "+" : "")}${delta.toFixed(2)} °${currentUnit}`
        );
}

// ========================================================================
// LINE CHART
// ========================================================================
f// ========================================================================
// LINE CHART (with comparison + hover)
// ========================================================================
function drawLineChart(data, mode, compareData = null) {

    svgLine.selectAll("*").remove();

    // Determine correct key (F/C, yearly/monthly)
    const key =
        currentUnit === "F"
            ? (mode === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F")
            : (mode === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C");

    // FILTER OUT bad values for the main series
    let cleanData = data.filter(d =>
        d[key] != null &&
        !isNaN(d[key]) &&
        d[key] !== 0
    );

    if (cleanData.length < 2) {
        svgLine.append("text")
            .attr("x", 20)
            .attr("y", 40)
            .attr("fill", "var(--muted)")
            .attr("font-size", "16px")
            .text("Not enough data available for this state.");
        return;
    }

    // Layout
    const margin = { top: 40, right: 30, bottom: 85, left: 60 };
    const widthLC = 980 - margin.left - margin.right;
    const heightLC = 300 - margin.top - margin.bottom;

    const g = svgLine.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const parseIndex = d => (d.Year - START_YEAR) * 12 + (d.Month - 1);

    
    // X scale + axis
    let x, xAxis;

    // --- Compute combined extent for main + comparison data ---
    let fullExtent;

    if (mode === "yearly") {
        let years = cleanData.map(d => d.Year);

        if (compareData) {
            const cleanCompare = compareData.filter(d =>
                d[key] != null && !isNaN(d[key]) && d[key] !== 0
            );
            years = years.concat(cleanCompare.map(d => d.Year));
        }

        fullExtent = d3.extent(years);

    } else {
        let idxs = cleanData.map(parseIndex);

        if (compareData) {
            const cleanCompare = compareData.filter(d =>
                d[key] != null && !isNaN(d[key]) && d[key] !== 0
            );
            idxs = idxs.concat(cleanCompare.map(parseIndex));
        }

        fullExtent = d3.extent(idxs);
    }

    // --- Build the scales using the combined extent ---
    if (mode === "yearly") {
        x = d3.scaleLinear()
            .domain(fullExtent)
            .range([0, widthLC]);

        xAxis = d3.axisBottom(x).tickFormat(d3.format("d"));

    } else {
        x = d3.scaleLinear()
            .domain(fullExtent)
            .range([0, widthLC]);

        xAxis = d3.axisBottom(x)
            .ticks(10)
            .tickFormat(i => {
                const y = START_YEAR + Math.floor(i / 12);
                const m = (i % 12) + 1;
                return `${monthName(m)} ${y}`;
            });
    }
    

    // Y scale
    let allYValues = cleanData.map(d => d[key]);

    if (compareData && compareData.length) {
        const cKey = key;
        const cleanCompare = compareData.filter(d =>
            d[cKey] != null &&
            !isNaN(d[cKey]) &&
            d[cKey] !== 0
        );
        allYValues = allYValues.concat(cleanCompare.map(d => d[cKey]));
    }

    const y = d3.scaleLinear()
        .domain(d3.extent(allYValues)).nice()
        .range([heightLC, 0]);


    // Main line generator
    const line = d3.line()
        .x(d => (mode === "yearly" ? x(d.Year) : x(parseIndex(d))))
        .y(d => y(d[key]));

    // Main line
    g.append("path")
        .datum(cleanData)
        .attr("fill", "none")
        .attr("stroke", "var(--accent)")
        .attr("stroke-width", 1.8)
        .attr("d", line);

    // Comparison line (if any)
    let comparePoints = [];

    if (compareData && compareData.length) {
        const cKey = key; // same field as main

        const cleanCompare = compareData.filter(d =>
            d[cKey] != null &&
            !isNaN(d[cKey]) &&
            d[cKey] !== 0
        );

        if (cleanCompare.length > 1) {
            const lineCompare = d3.line()
                .x(d => (mode === "yearly" ? x(d.Year) : x(parseIndex(d))))
                .y(d => y(d[cKey]));

            g.append("path")
                .datum(cleanCompare)
                .attr("fill", "none")
                .attr("stroke", "var(--muted)")
                .attr("stroke-width", 1.4)
                .attr("stroke-dasharray", "4 3")
                .attr("d", lineCompare);

            comparePoints = cleanCompare.map(d => ({
                Year: d.Year,
                Month: d.Month,
                value: d[cKey],
                xVal: mode === "yearly" ? d.Year : parseIndex(d)
            }));
        }
    }

    // Axes
    g.append("g")
        .attr("transform", `translate(0,${heightLC})`)
        .call(xAxis);

    g.append("g").call(d3.axisLeft(y));

    // ====================================================================
    // Trend line (regression) on main series
    // ====================================================================
    const mainPoints = cleanData.map(d => ({
        Year: d.Year,
        Month: d.Month,
        value: d[key],
        xVal: mode === "yearly" ? d.Year : parseIndex(d)
    }));

    const xVals = mainPoints.map(p => p.xVal);
    const yVals = mainPoints.map(p => p.value);

    const n = xVals.length;
    const sumX = d3.sum(xVals);
    const sumY = d3.sum(yVals);
    const sumXY = d3.sum(xVals.map((d, i) => d * yVals[i]));
    const sumXX = d3.sum(xVals.map(d => d * d));

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    window.lastComputedSlope = slope; // for stats panel

    const xStart = d3.min(xVals);
    const xEnd   = d3.max(xVals);
    const yStart = slope * xStart + intercept;
    const yEnd   = slope * xEnd + intercept;

    g.append("line")
        .attr("x1", x(xStart))
        .attr("y1", y(yStart))
        .attr("x2", x(xEnd))
        .attr("y2", y(yEnd))
        .attr("stroke", "var(--muted)")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "6 4")
        .attr("opacity", 0.9);

    const unit = currentUnit;
    const slopePer = (mode === "yearly") ? "per year" : "per month";
    const slopeRounded = slope.toFixed(3);

    g.append("text")
        .attr("x", 8)
        .attr("y", -10)
        .attr("fill", "var(--muted)")
        .attr("font-size", "13px")
        .text(`Trend: ${slopeRounded} °${unit} ${slopePer}`);

    // ====================================================================
    // Hover: vertical line + dots + tooltip
    // ====================================================================
    const hoverLine = g.append("line")
        .attr("class", "hover-line")
        .attr("stroke", "var(--muted)")
        .attr("stroke-width", 1)
        .attr("y1", 0)
        .attr("y2", heightLC)
        .style("opacity", 0);

    const mainDot = g.append("circle")
        .attr("class", "hover-dot-main")
        .attr("r", 4)
        .attr("fill", "var(--accent)")
        .attr("stroke", "var(--card)")
        .attr("stroke-width", 1.2)
        .style("opacity", 0);

    const compareDot = g.append("circle")
        .attr("class", "hover-dot-compare")
        .attr("r", 4)
        .attr("fill", "var(--muted)")
        .attr("stroke", "var(--card)")
        .attr("stroke-width", 1.2)
        .style("opacity", 0);

    const overlay = g.append("rect")
        .attr("class", "hover-overlay")
        .attr("width", widthLC)
        .attr("height", heightLC)
        .style("fill", "none")
        .style("pointer-events", "all")
        .on("mouseover", () => {
            hoverLine.style("opacity", 1);
            mainDot.style("opacity", 1);
        })
        .on("mouseout", () => {
            hoverLine.style("opacity", 0);
            mainDot.style("opacity", 0);
            compareDot.style("opacity", 0);
            lineTooltip.style("opacity", 0);
        })
        .on("mousemove", (event) => {
            const [mx, my] = d3.pointer(event, g.node());
            if (mx < 0 || mx > widthLC || my < 0 || my > heightLC) return;

            const xRaw = x.invert(mx);
            const i = Math.round(xRaw);

            // Lookup based on mode
            const mainPoint = (mode === "yearly")
                ? mainPoints.find(d => d.Year === i)
                : mainPoints.find(d => d.index === i);

            const comparePoint = (mode === "yearly")
                ? comparePoints.find(d => d.Year === i)
                : comparePoints.find(d => d.index === i);

            const cx = x(i);
            hoverLine.attr("x1", cx).attr("x2", cx);

            // ---- Main dot ----
            if (mainPoint) {
                mainDot
                    .attr("cx", cx)
                    .attr("cy", y(mainPoint.value))
                    .style("opacity", 1);
            } else {
                mainDot.style("opacity", 0);
            }

            // ---- Compare dot ----
            if (comparePoint) {
                compareDot
                    .attr("cx", cx)
                    .attr("cy", y(comparePoint.value))
                    .style("opacity", 1);
            } else {
                compareDot.style("opacity", 0);
            }

            // ---- Tooltip ----
            const label = mode === "yearly"
                ? `${i}`
                : `${monthName((i % 12) + 1)} ${START_YEAR + Math.floor(i / 12)}`;

            let html = `<strong>${label}</strong>`;
            html += `<br>${selectedState}: ${mainPoint ? mainPoint.value.toFixed(2) + " °" + unit : "—"}`;
            if (compareState) {
                html += `<br>${compareState}: ${comparePoint ? comparePoint.value.toFixed(2) + " °" + unit : "—"}`;
            }

            lineTooltip
                .style("opacity", 1)
                .html(html)
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY - 28) + "px");
        });
    }
 

// ========================================================================
// STATE STATS PANEL
// ========================================================================
function updateStatsPanel(cleanMonthly, cleanYearly, slope) {
    // ----- Helper for formatting temps -----
    const fmt = (v) =>
        (v == null || isNaN(v)) ? "—" : `${v.toFixed(2)} °${currentUnit}`;

    const fmtY = (year) => year != null ? year : "—";
    const fmtYM = (y, m) => (y && m) ? `${monthName(m)} ${y}` : "—";

    // ================================
    // 1. State Name
    // ================================
    document.getElementById("stat-state-name").textContent = selectedState;

    // ================================
    // 2. Average Temp (all time)
    // ================================
    const allTemps = cleanMonthly.map(d => d.value);
    const avgAll = allTemps.length ? d3.mean(allTemps) : null;
    document.getElementById("stat-avg-temp").textContent = fmt(avgAll);

    // ================================
    // 3. Rate of Change (slope)
    // ================================
    const slopeText = slope ? `${slope.toFixed(3)} °${currentUnit} / yr` : "—";
    document.getElementById("stat-rate-change").textContent = slopeText;

    // ================================
    // 4. Hottest / Coldest YEAR
    // ================================
    const yearKey = currentUnit === "F" ? "AvgTemp_F_Yearly" : "AvgTemp_C_Yearly";

    const validYearly = cleanYearly.filter(d => d[yearKey] != null);

    let hottestYear = null, coldestYear = null;

    if (validYearly.length) {
        hottestYear = validYearly.reduce((a, b) =>
            a[yearKey] > b[yearKey] ? a : b
        );
        coldestYear = validYearly.reduce((a, b) =>
            a[yearKey] < b[yearKey] ? a : b
        );
    }

    document.getElementById("stat-hottest-year").textContent =
        hottestYear ? `${hottestYear.Year} (${fmt(hottestYear[yearKey])})` : "—";

    document.getElementById("stat-coldest-year").textContent =
        coldestYear ? `${coldestYear.Year} (${fmt(coldestYear[yearKey])})` : "—";

    // ================================
    // 5. Hottest / Coldest MONTH
    // ================================
    const monthKey = currentUnit === "F" ? "AvgTemp_F" : "AvgTemp_C";

    const validMonthly = cleanMonthly.filter(d => d.value != null);

    let hottestMonth = null, coldestMonth = null;

    if (validMonthly.length) {
        hottestMonth = validMonthly.reduce((a, b) =>
            a.value > b.value ? a : b
        );
        coldestMonth = validMonthly.reduce((a, b) =>
            a.value < b.value ? a : b
        );
    }

    document.getElementById("stat-hottest-month").textContent =
        hottestMonth ? fmtYM(hottestMonth.Year, hottestMonth.Month) +
            ` (${fmt(hottestMonth.value)})` : "—";

    document.getElementById("stat-coldest-month").textContent =
        coldestMonth ? fmtYM(coldestMonth.Year, coldestMonth.Month) +
            ` (${fmt(coldestMonth.value)})` : "—";

    // ================================
    // 6. Largest Yearly Fluctuation
    // ================================
    const fluctByYear = d3.rollups(
        validMonthly,
        rows => {
            const temps = rows.map(r => r.value);
            return d3.max(temps) - d3.min(temps);
        },
        d => d.Year
    );

    let biggestFluct = null;
    if (fluctByYear.length) {
        biggestFluct = fluctByYear.reduce((a, b) =>
            a[1] > b[1] ? a : b
        );
    }

    document.getElementById("stat-biggest-fluct").textContent =
        biggestFluct ? `${biggestFluct[0]} (${fmt(biggestFluct[1])})` : "—";

    // ================================
    // 7. Data Coverage
    // ================================
    const years = validMonthly.map(d => d.Year);
    const minY = d3.min(years);
    const maxY = d3.max(years);

    document.getElementById("stat-data-range").textContent =
        (minY && maxY) ? `${minY}–${maxY}` : "—";

    // ================================
    // 8. Total Change Since First Year
    // ================================
    let firstTemp = null, lastTemp = null;

    if (validYearly.length >= 2) {
        const sorted = validYearly.sort((a, b) => a.Year - b.Year);
        firstTemp = sorted[0][yearKey];
        lastTemp = sorted[sorted.length - 1][yearKey];
    }

    const totalChange =
        (firstTemp != null && lastTemp != null) ? (lastTemp - firstTemp) : null;

    document.getElementById("stat-total-change").textContent = fmt(totalChange);

    // ================================
    // 9. Variability (Std Dev)
    // ================================
    const variability =
        allTemps.length >= 2 ? d3.deviation(allTemps) : null;

    document.getElementById("stat-variability").textContent = fmt(variability);
}