const svg = d3.select("#map");
const tooltip = d3.select("#tooltip");
const width = +svg.attr("width");
const height = +svg.attr("height");

const yearInput = d3.select("#year");
const yearLabel = d3.select("#year-label");
const unitToggle = d3.select("#unit-toggle");
const dataToggle = d3.select("#data-toggle");
const maxToggle = d3.select("#max-toggle");
const minToggle = d3.select("#min-toggle");
let analyticsMode = "average"; // "average" | "delta" | "max" | "min"

const projection = d3.geoAlbersUsa().scale(1200).translate([width / 2, height / 2]);
const path = d3.geoPath().projection(projection);

const colorScaleF = d3.scaleSequential().domain([0, 100]).interpolator(d3.interpolateTurbo);
const colorScaleC = d3.scaleSequential().domain([-18, 38]).interpolator(d3.interpolateTurbo);

// line chart color scale
const lineColorScale = d3.scaleOrdinal(d3.schemeTableau10);

let mapData, tempData = {};
let currentDataset = "yearly";
let currentUnit = "F";
let currentValue = 2000;

let nationalTimelineIndicator = null;
let nationalTimelineIndicatorDot = null;
let nationalLineChartXScale = null;
let nationalLineChartMargin = null;
let nationalLineChartHeight = null;
let nationalLineChartSvg = null;

const displayToggle = d3.select("#display-toggle");
const baseRange = d3.select("#base-range");
const endRange = d3.select("#end-range");
const baseLabel = d3.select("#base-label");
const endLabel = d3.select("#end-label");
const endRow = d3.select("#end-row");

let displayMode = "average";
let baseYear = 1800, baseMonth = 1;
let endYear = 2000, endMonth = 1;

const START_YEAR = 1800;
const END_YEAR = 2012;

let isPlaying = false;
let animationInterval = null;
const ANIMATION_SPEED = 100; // milliseconds between steps

const idxFromYM = (y, m) => (y - START_YEAR) * 12 + (m - 1);
const ymFromIdx = i => [START_YEAR + Math.floor(i / 12), (i % 12) + 1];

function monName(m) { return new Date(2000, m - 1).toLocaleString("default", { month: "short" }); }
function fmtLabel(y, m, isMonthly) { return isMonthly ? `${monName(m)}-${y}` : `${y}`; }

// multi state globals
let multiStateInitialized = false;
let allStates = [];
let trendDateRange, trendStartDateInput, trendEndDateInput, trendStateMode;
let trendRegionBlock, trendRegionSelect, trendCustomStatesBlock, trendCustomStatesSelect;
let trendResetBtn, trendTableBody, trendTableLoading, stateLinechartLoading;

const REGION_STATES = {
    northeast: [
        "Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island",
        "Connecticut", "New York", "New Jersey", "Pennsylvania"
    ],
    midwest: [
        "Ohio", "Indiana", "Illinois", "Michigan", "Wisconsin",
        "Minnesota", "Iowa", "Missouri", "North Dakota", "South Dakota",
        "Nebraska", "Kansas"
    ],
    south: [
        "Delaware", "Maryland", "District of Columbia", "Virginia", "West Virginia",
        "North Carolina", "South Carolina", "Georgia", "Florida",
        "Kentucky", "Tennessee", "Alabama", "Mississippi",
        "Arkansas", "Louisiana", "Oklahoma", "Texas"
    ],
    west: [
        "Montana", "Idaho", "Wyoming", "Colorado", "New Mexico",
        "Arizona", "Utah", "Nevada",
        "Washington", "Oregon", "California", "Alaska", "Hawaii"
    ]
};

Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.csv("data/state_yearly_avg.csv"),
    d3.csv("data/state_monthly_avg.csv")
]).then(([us, yearly, monthly]) => {
    mapData = topojson.feature(us, us.objects.states).features;

    yearly.forEach(d => {
        d.Year = +d.Year;
        d.AvgTemp_F_Yearly = d.AvgTemp_F_Yearly === "" ? null : +d.AvgTemp_F_Yearly;
        d.AvgTemp_C_Yearly = d.AvgTemp_C_Yearly === "" ? null : +d.AvgTemp_C_Yearly;
    });

    monthly.forEach(d => {
        d.dt = new Date(d.dt);
        d.Year = d.dt.getFullYear();
        d.Month = d.dt.getMonth() + 1;
        d.AvgTemp_F = d.AvgTemp_F === "" ? null : +d.AvgTemp_F;
        d.AvgTemp_C = d.AvgTemp_C === "" ? null : +d.AvgTemp_C;
    });

    tempData = { yearly, monthly };

    // build state list from data
    allStates = Array.from(new Set(yearly.map(d => d.State))).sort(d3.ascending);

    drawMap();
    setSliderForDataset();
    updateMap(currentValue);
    buildLegend("average", currentUnit === "F" ? colorScaleF : colorScaleC);
    initAnalyticsSliders();
    initMultiStateSection();   // set up multi state panel after everything else
});

// ==================== MAP RENDERING ====================

function drawMap() {
    svg.selectAll(".state")
        .data(mapData)
        .join("path")
        .attr("class", "state")
        .attr("d", path)
        .on("mouseover", handleMouseOver)
        .on("mousemove", handleMouseMove)
        .on("mouseleave", handleMouseLeave)
        .on("click", (event, d) => {
            const stateName = d.properties.name;
            window.location.href = `state_page/state.html?state=${encodeURIComponent(stateName)}`;
        });
}

function updateMap(selected) {
    // Determine active analytics mode (backward-compatible with older displayMode)
    const mode = (typeof analyticsMode === "string")
        ? analyticsMode
        : (typeof displayMode === "string" && displayMode === "delta" ? "delta" : "average");

    // ---- MAX / MIN ANALYTICS ----
    if (mode === "max" || mode === "min") {
        const dataset = currentDataset === "yearly" ? tempData.yearly : tempData.monthly;
        const key = currentUnit === "F"
            ? (currentDataset === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F")
            : (currentDataset === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C");

        const stateExtremes = new Map();
        const byState = d3.group(dataset, d => d.State);

        byState.forEach((records, state) => {
            const valid = records.filter(r => r[key] != null && !isNaN(r[key]));
            if (!valid.length) return;
            const extremeVal = (mode === "max")
                ? d3.max(valid, r => r[key])
                : d3.min(valid, r => r[key]);
            const rec = valid.find(r => r[key] === extremeVal);
            stateExtremes.set(state, rec);
        });

        const allVals = Array.from(stateExtremes.values()).map(r => r[key]).filter(v => v != null && !isNaN(v));
        const [minVal, maxVal] = allVals.length ? d3.extent(allVals) : [0, 1];
        const scale = currentUnit === "F" ? colorScaleF : colorScaleC;
        scale.domain([minVal, maxVal]);

        svg.selectAll(".state")
            .transition().duration(400)
            .attr("fill", d => {
                const rec = stateExtremes.get(d.properties.name);
                return rec && rec[key] != null && !isNaN(rec[key]) ? scale(rec[key]) : "#555";
            });

        buildLegend("average", scale);

        // Override tooltip for max/min modes only
        svg.selectAll(".state")
            .on("mousemove", (event, d) => {
                const rec = stateExtremes.get(d.properties.name);
                if (!rec || rec[key] == null || isNaN(rec[key])) {
                    tooltip.html(`<strong>${d.properties.name}</strong><br>No data found`);
                } else {
                    const label = currentDataset === "yearly"
                        ? `Date: ${rec.Year}`
                        : `Date: ${monName(rec.Month)}-${rec.Year}`;
                    tooltip.html(
                        `<strong>${d.properties.name}</strong><br>` +
                        `${mode === "max" ? "Max" : "Min"} Temp: ${rec[key].toFixed(2)} °${currentUnit}<br>${label}`
                    );
                }
                tooltip
                    .style("left", (event.pageX + 10) + "px")
                    .style("top",  (event.pageY - 28) + "px")
                    .style("opacity", 1);
            })
            .on("mouseleave", () => tooltip.style("opacity", 0));

        return;
    }

    // ---- AVERAGE MODE ----
    if (mode === "average") {
        const dataset = currentDataset === "yearly" ? tempData.yearly : tempData.monthly;
        const key = currentUnit === "F"
            ? (currentDataset === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F")
            : (currentDataset === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C");

        let year, month;
        if (currentDataset === "yearly") {
            year = +selected;
        } else {
            const [m, y] = String(selected).split("-").map(Number);
            year = y; month = m;
        }

        const filtered = currentDataset === "yearly"
            ? dataset.filter(d => d.Year === year)
            : dataset.filter(d => d.Year === year && d.Month === month);

        const tempByState = new Map(filtered.map(d => [d.State, d[key]]));
        const scale = currentUnit === "F" ? colorScaleF : colorScaleC;

        svg.selectAll(".state")
            .transition().duration(350)
            .attr("fill", d => {
                const v = tempByState.get(d.properties.name);
                return v == null || isNaN(v) ? "#555" : scale(v);
            });

        buildLegend("average", scale);

        // Restore default tooltip behavior for non-max/min modes
        svg.selectAll(".state")
            .on("mousemove", handleMouseMove)
            .on("mouseleave", handleMouseLeave);

        return;
    }

    // ---- DELTA MODE ----
    {
        const dataset = currentDataset === "yearly" ? tempData.yearly : tempData.monthly;
        const keyF = currentDataset === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F";
        const keyC = currentDataset === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C";
        const keyUse = currentUnit === "F" ? keyF : keyC;

        const baseRows = currentDataset === "yearly"
            ? dataset.filter(d => d.Year === baseYear)
            : dataset.filter(d => d.Year === baseYear && d.Month === baseMonth);
        const endRows = currentDataset === "yearly"
            ? dataset.filter(d => d.Year === endYear)
            : dataset.filter(d => d.Year === endYear && d.Month === endMonth);

        const baseMap = new Map(baseRows.map(d => [d.State, d[keyUse]]));
        const endMap  = new Map(endRows.map(d => [d.State, d[keyUse]]));

        const deltas = [];
        mapData.forEach(f => {
            const s = f.properties.name;
            const b = baseMap.get(s);
            const e = endMap.get(s);
            if (b != null && e != null && !isNaN(b) && !isNaN(e)) deltas.push(e - b);
        });

        const [dmin, dmax] = deltas.length ? d3.extent(deltas) : [-5, 5];
        const maxAbs = Math.max(Math.abs(dmin), Math.abs(dmax));
        const deltaScale = d3.scaleSequential()
            .domain([maxAbs, -maxAbs]) // flipped: blue=cooler (neg), red=warmer (pos)
            .interpolator(d3.interpolateRdBu)
            .clamp(true);

        svg.selectAll(".state")
            .transition().duration(350)
            .attr("fill", d => {
                const s = d.properties.name;
                const b = baseMap.get(s);
                const e = endMap.get(s);
                if (b == null || e == null || isNaN(b) || isNaN(e)) return "#666";
                return deltaScale(e - b);
            });

        buildLegendDelta(deltaScale);

        // Custom Δ Temp tooltip
        svg.selectAll(".state")
            .on("mousemove", (event, d) => {
                const b = baseMap.get(d.properties.name);
                const e = endMap.get(d.properties.name);
                if (b == null || e == null || isNaN(b) || isNaN(e)) {
                    tooltip.html(`<strong>${d.properties.name}</strong><br>No data available for comparison`);
                } else {
                    const delta = e - b;
                    tooltip.html(
                        `<strong>${d.properties.name}</strong><br>` +
                        `Δ Temp (${fmtLabel(baseYear, baseMonth, currentDataset === "monthly")} → ${fmtLabel(endYear, endMonth, currentDataset === "monthly")}): ` +
                        `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} °${currentUnit}`
                    );
                }
                tooltip
                    .style("left", (event.pageX + 10) + "px")
                    .style("top",  (event.pageY - 28) + "px")
                    .style("opacity", 1);
            })
            .on("mouseleave", () => tooltip.style("opacity", 0));

    }
}

function handleMouseOver() { tooltip.style("opacity", 1); }
function handleMouseMove(event, d) {
    const dataset = currentDataset === "yearly" ? tempData.yearly : tempData.monthly;
    const keyF = currentDataset === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F";
    const keyC = currentDataset === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C";
    const key = currentUnit === "F" ? keyF : keyC;

    let html;
    if (displayMode === "average") {
        let val;
        if (currentDataset === "yearly") {
            val = dataset.find(x => x.State === d.properties.name && x.Year === +currentValue)?.[key];
        } else {
            const [month, year] = currentValue.split("-").map(Number);
            val = dataset.find(x => x.State === d.properties.name && x.Year === year && x.Month === month)?.[key];
        }
        html = `<strong>${d.properties.name}</strong><br>` +
            (val == null || isNaN(val) ? `No data found` : `${val.toFixed(2)} °${currentUnit}`);
    } else {
        const baseRows = currentDataset === "yearly"
            ? dataset.filter(x => x.Year === baseYear && x.State === d.properties.name)
            : dataset.filter(x => x.Year === baseYear && x.Month === baseMonth && x.State === d.properties.name);
        const endRows = currentDataset === "yearly"
            ? dataset.filter(x => x.Year === endYear && x.State === d.properties.name)
            : dataset.filter(x => x.Year === endYear && x.Month === endMonth && x.State === d.properties.name);
        const b = baseRows[0]?.[key];
        const e = endRows[0]?.[key];
        const delta = (b == null || e == null || isNaN(b) || isNaN(e)) ? null : (e - b);
        html = `<strong>${d.properties.name}</strong><br>` +
            (delta == null
                ? `No data available for comparison`
                : `Δ Temp (${fmtLabel(baseYear, baseMonth, currentDataset === "monthly")} → ${fmtLabel(endYear, endMonth, currentDataset === "monthly")}): ` +
                `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} °${currentUnit}`);
    }

    tooltip.html(html)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
}
function handleMouseLeave() { tooltip.style("opacity", 0); }

// ==================== LEGEND ====================

function buildLegend(mode = "average", colorScale) {
    const legend = d3.select("#legend");
    legend.selectAll("*").remove();

    const w = 320, h = 12, m = { top: 10, right: 10, bottom: 28, left: 30 };
    const svgLegend = legend.append("svg")
        .attr("width", w + m.left + m.right)
        .attr("height", h + m.top + m.bottom);

    const defs = svgLegend.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "legend-gradient")
        .attr("x1", "0%").attr("x2", "100%").attr("y1", "0%").attr("y2", "0%");

    let [min, max] = colorScale.domain();
    if (min > max) [min, max] = [max, min]; // ensure left = lower, right = higher
    const axisScale = d3.scaleLinear().domain([min, max]).range([m.left, m.left + w]);

    const n = 60;
    d3.range(n).forEach(i => {
        gradient.append("stop")
            .attr("offset", `${(i / (n - 1)) * 100}%`)
            .attr("stop-color", colorScale(min + (i / (n - 1)) * (max - min)));
    });

    svgLegend.append("rect")
        .attr("x", m.left).attr("y", m.top)
        .attr("width", w).attr("height", h)
        .style("fill", "url(#legend-gradient)")
        .style("stroke", "var(--border)")
        .attr("rx", 4).attr("ry", 4);


    const axis = d3.axisBottom(axisScale).ticks(6)
        .tickFormat(d => `${(+d).toFixed(mode === "average" ? 0 : 1)}°${currentUnit}`);

    svgLegend.append("g")
        .attr("transform", `translate(0, ${h + m.top})`)
        .call(axis)
        .selectAll("text")
        .style("fill", "var(--muted)")
        .style("font-size", "12px");

    svgLegend.selectAll(".domain, .tick line").attr("stroke", "var(--border)");
}

function buildLegendDelta(scale) { buildLegend("delta", scale); }

// ==================== MAIN CONTROLS ====================

yearInput.on("input", function () {
    if (currentDataset === "yearly") {
        currentValue = +this.value;
        yearLabel.text(currentValue);
    } else {
        const startYear = START_YEAR;
        const idx = +this.value;
        const year = startYear + Math.floor(idx / 12);
        const month = (idx % 12) + 1;
        currentValue = `${month}-${year}`;
        yearLabel.text(`${monName(month)}-${year}`);
    }
    updateMap(currentValue);
    updateNationalTimelineIndicator(); // Update timeline indicator
});

unitToggle.on("change", e => {
    currentUnit = e.target.checked ? "C" : "F";
    updateMap(currentValue);
    if (multiStateInitialized) updateLineChartAndTable();
});

dataToggle.on("change", e => {
    if (isPlaying) {
        togglePlayPause();
    }
    currentDataset = e.target.checked ? "yearly" : "monthly";
    setSliderForDataset();
    initAnalyticsSliders();
    updateMap(currentValue);
    if (multiStateInitialized) updateLineChartAndTable();
});

function setAnalyticsMode(mode) {
    analyticsMode = mode;
    displayMode = mode === "delta" ? "delta" : "average";

    // Reset toggles
    displayToggle.property("checked", mode === "delta");
    maxToggle.property("checked", mode === "max");
    minToggle.property("checked", mode === "min");

    // Determine if slider should be disabled
    const disableMainSlider = mode === "delta" || mode === "max" || mode === "min";
    const mainSlider = document.querySelector("#year");

    if (mainSlider) {
        mainSlider.disabled = disableMainSlider;
        mainSlider.style.opacity = disableMainSlider ? "0.4" : "1.0";
        mainSlider.style.pointerEvents = disableMainSlider ? "none" : "auto";
    }

    const playBtn = document.getElementById("play-pause-btn");
    if (playBtn) {
        if (disableMainSlider) {
            if (isPlaying) {
                togglePlayPause();
            }
            playBtn.disabled = true;
            playBtn.style.opacity = "0.4";
            playBtn.style.cursor = "not-allowed";
        } else {
            playBtn.disabled = false;
            playBtn.style.opacity = "1.0";
            playBtn.style.cursor = "pointer";
        }
    }

    // Only show Base/End sliders for Delta mode
    const baseRowEl = document.querySelector(".range-row");
    const endRowEl = document.getElementById("end-row");
    baseRowEl.style.display = mode === "delta" ? "grid" : "none";
    endRowEl.style.display = mode === "delta" ? "grid" : "none";

    updateMap(currentValue);
    
    if (mode === "delta") {
        if (nationalTimelineIndicator) {
            nationalTimelineIndicator
                .style("opacity", 0)
                .style("visibility", "hidden");
        }
        if (nationalLineChartSvg) {
            const dot = nationalLineChartSvg.select(".timeline-indicator-dot");
            if (!dot.empty()) {
                dot
                    .style("opacity", 0)
                    .style("visibility", "hidden");
            }
        }
    }
    
    if (multiStateInitialized) {
        updateDateFilterAvailability();
        updateLineChartAndTable();
    }
}

// Event listeners
displayToggle.on("change", e => setAnalyticsMode(e.target.checked ? "delta" : "average"));
maxToggle.on("change", e => setAnalyticsMode(e.target.checked ? "max" : "average"));
minToggle.on("change", e => setAnalyticsMode(e.target.checked ? "min" : "average"));


baseRange.on("input", e => {
    if (currentDataset === "yearly") {
        baseYear = +e.target.value;
        if (displayMode === "delta" && endYear < baseYear) { endYear = baseYear; endRange.property("value", endYear); }
        baseLabel.text(fmtLabel(baseYear, 1, false));
        endLabel.text(fmtLabel(endYear, 1, false));
    } else {
        let [y, m] = ymFromIdx(+e.target.value);
        baseYear = y; baseMonth = m;
        if (displayMode === "delta" && (endYear < baseYear || (endYear === baseYear && endMonth < baseMonth))) {
            endYear = baseYear; endMonth = baseMonth; endRange.property("value", idxFromYM(endYear, endMonth));
        }
        baseLabel.text(fmtLabel(baseYear, baseMonth, true));
        endLabel.text(fmtLabel(endYear, endMonth, true));
    }
    updateMap(currentValue);
    if (multiStateInitialized) updateLineChartAndTable();
});

endRange.on("input", e => {
    if (currentDataset === "yearly") {
        endYear = Math.max(+e.target.value, baseYear);
        endRange.property("value", endYear);
        endLabel.text(fmtLabel(endYear, 1, false));
    } else {
        let [y, m] = ymFromIdx(+e.target.value);
        if (y < baseYear || (y === baseYear && m < baseMonth)) { y = baseYear; m = baseMonth; }
        endYear = y; endMonth = m;
        endRange.property("value", idxFromYM(endYear, endMonth));
        endLabel.text(fmtLabel(endYear, endMonth, true));
    }
    updateMap(currentValue);
    if (multiStateInitialized) updateLineChartAndTable();
});

function setSliderForDataset() {
    if (currentDataset === "yearly") {
        yearInput.attr("min", START_YEAR).attr("max", END_YEAR).attr("step", 1);
        currentValue = 2000;
        yearInput.property("value", currentValue);
        yearLabel.text(currentValue);
    } else {
        const maxIdx = (END_YEAR - START_YEAR + 1) * 12 - 1;
        yearInput.attr("min", 0).attr("max", maxIdx).attr("step", 1);
        yearInput.property("value", 0);
        currentValue = "1-1800";
        yearLabel.text("Jan-1800");
    }
}

function initAnalyticsSliders() {
    if (currentDataset === "yearly") {
        baseRange.attr("min", START_YEAR).attr("max", END_YEAR).attr("step", 1).property("value", baseYear);
        endRange.attr("min", START_YEAR).attr("max", END_YEAR).attr("step", 1).property("value", endYear);
        baseLabel.text(fmtLabel(baseYear, 1, false));
        endLabel.text(fmtLabel(endYear, 1, false));
    } else {
        const maxIdx = (END_YEAR - START_YEAR + 1) * 12 - 1;
        baseRange.attr("min", 0).attr("max", maxIdx).attr("step", 1).property("value", idxFromYM(baseYear, baseMonth));
        endRange.attr("min", 0).attr("max", maxIdx).attr("step", 1).property("value", idxFromYM(endYear, endMonth));
        baseLabel.text(fmtLabel(baseYear, baseMonth, true));
        endLabel.text(fmtLabel(endYear, endMonth, true));
    }
    endRow.style("display", displayMode === "delta" ? "grid" : "none");
}

function togglePlayPause() {
    if (analyticsMode === "delta" || analyticsMode === "max" || analyticsMode === "min") {
        return;
    }

    isPlaying = !isPlaying;
    const playBtn = document.getElementById("play-pause-btn");
    const playIcon = document.getElementById("play-icon");

    if (isPlaying) {
        playBtn.classList.add("playing");
        playIcon.textContent = "⏸";
        startAnimation();
    } else {
        playBtn.classList.remove("playing");
        playIcon.textContent = "▶";
        stopAnimation();
    }
}

function startAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
    }

    animationInterval = setInterval(() => {
        const slider = document.getElementById("year");
        const currentVal = +slider.value;
        const min = +slider.min;
        const max = +slider.max;

        if (currentVal >= max) {
            slider.value = min;
            slider.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
            slider.value = currentVal + 1;
            slider.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }, ANIMATION_SPEED);
}

function stopAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", () => {
        const playBtn = document.getElementById("play-pause-btn");
        if (playBtn) {
            playBtn.addEventListener("click", togglePlayPause);
        }
    });
} else {
    const playBtn = document.getElementById("play-pause-btn");
    if (playBtn) {
        playBtn.addEventListener("click", togglePlayPause);
    }
}

// ==================== MULTI STATE SECTION ====================

function initMultiStateSection() {
    trendDateRange = d3.select("#trend-date-range");
    trendStartDateInput = d3.select("#trend-start-date");
    trendEndDateInput = d3.select("#trend-end-date");
    trendStateMode = d3.select("#trend-state-mode");
    trendRegionBlock = d3.select("#trend-region-block");
    trendRegionSelect = d3.select("#trend-region-select");
    trendCustomStatesBlock = d3.select("#trend-custom-states-block");
    trendCustomStatesSelect = d3.select("#trend-custom-states");
    trendResetBtn = d3.select("#trend-reset-btn");
    trendTableBody = d3.select("#trend-table tbody");
    trendTableLoading = d3.select("#trend-table-loading");
    stateLinechartLoading = d3.select("#state-linechart-loading");


    // hide custom date row by default
    d3.select("#trend-custom-range").style("display", "none");


    // // populate custom state list
    // select the container
    trendCustomStatesSelect = d3.select("#trend-custom-states");

    // create checkboxes
    trendCustomStatesSelect.selectAll("div")
        .data(allStates)
        .join("div")
        .attr("class", "checkbox-item")
        .html(d => `
            <label>
                <input type="checkbox" value="${d}" /> ${d}
            </label>
        `);

    // fire update when any checkbox changes
    trendCustomStatesSelect.selectAll("input[type='checkbox']")
        .on("change", () => updateLineChartAndTable());


    // events
    trendDateRange.on("change", () => {
        const choice = trendDateRange.node().value;
        const customBlock = d3.select("#trend-custom-range");

        if (choice === "custom") {
            customBlock.style("display", "flex");   // or "block" depending on desired layout
        } else {
            customBlock.style("display", "none");
        }

        updateDateFilterAvailability();
        if (analyticsMode !== "delta") updateLineChartAndTable();
    });
  

    trendStartDateInput.on("change", () => {
        if (analyticsMode !== "delta") updateLineChartAndTable();
    });
    trendEndDateInput.on("change", () => {
        if (analyticsMode !== "delta") updateLineChartAndTable();
    });

    trendStateMode.on("change", () => {
        const mode = trendStateMode.node().value;
        trendRegionBlock.style("display", mode === "region" ? "flex" : "none");
        trendCustomStatesBlock.style("display", mode === "custom" ? "flex" : "none");
        updateLineChartAndTable();
    });

    trendRegionSelect.on("change", () => updateLineChartAndTable());
    trendCustomStatesSelect.on("change", () => updateLineChartAndTable());

    trendResetBtn.on("click", () => {
        // reset filters
        trendDateRange.property("value", "all");
        trendStartDateInput.property("value", "");
        trendEndDateInput.property("value", "");
        trendStateMode.property("value", "top5");
        trendRegionBlock.style("display", "none");
        trendCustomStatesBlock.style("display", "none");
        trendRegionSelect.property("value", "south");
        trendCustomStatesSelect.selectAll("option").property("selected", false);

        // reset analytics to average
        setAnalyticsMode("average");
    });

    multiStateInitialized = true;
    updateDateFilterAvailability();
    updateLineChartAndTable();
}

function updateDateFilterAvailability() {
    if (!multiStateInitialized) return;

    const disable = analyticsMode === "delta";
    const dateSelectNode = trendDateRange.node();
    const startNode = trendStartDateInput.node();
    const endNode = trendEndDateInput.node();
    const customBlock = document.getElementById("trend-custom-range");
    const lockNote = document.getElementById("trend-date-lock-note");

    dateSelectNode.disabled = disable;
    dateSelectNode.style.opacity = disable ? "0.5" : "1";

    startNode.disabled = disable;
    endNode.disabled = disable;
    customBlock.style.opacity = disable ? "0.5" : "1";

    lockNote.style.display = disable ? "block" : "none";
}

function getActiveDateRange() {
    // delta uses base/end from analytics
    if (analyticsMode === "delta") {
        if (currentDataset === "yearly") {
            const startYear = Math.min(baseYear, endYear);
            const finalYear = Math.max(baseYear, endYear);
            return { type: "yearly", startYear, endYear: finalYear };
        } else {
            const startIdx = Math.min(idxFromYM(baseYear, baseMonth), idxFromYM(endYear, endMonth));
            const endIdx = Math.max(idxFromYM(baseYear, baseMonth), idxFromYM(endYear, endMonth));
            return { type: "monthly", startIdx, endIdx };
        }
    }

    const choice = trendDateRange.node().value;
    const latestYear = END_YEAR;

    if (currentDataset === "yearly") {
        if (choice === "custom") {
            const sVal = trendStartDateInput.node().value;
            const eVal = trendEndDateInput.node().value;
            if (!sVal || !eVal) {
                return { type: "yearly", startYear: START_YEAR, endYear: latestYear };
            }
            let sYear = new Date(sVal).getFullYear();
            let eYear = new Date(eVal).getFullYear();
            if (isNaN(sYear) || isNaN(eYear)) {
                return { type: "yearly", startYear: START_YEAR, endYear: latestYear };
            }
            if (sYear > eYear) [sYear, eYear] = [eYear, sYear];
            sYear = Math.max(START_YEAR, sYear);
            eYear = Math.min(latestYear, eYear);
            return { type: "yearly", startYear: sYear, endYear: eYear };
        }

        if (choice === "all") {
            return { type: "yearly", startYear: START_YEAR, endYear: latestYear };
        }

        const span = +choice;
        const startYear = Math.max(START_YEAR, latestYear - span + 1);
        return { type: "yearly", startYear, endYear: latestYear };
    } else {
        // monthly view
        if (choice === "custom") {
            const sVal = trendStartDateInput.node().value;
            const eVal = trendEndDateInput.node().value;
            if (!sVal || !eVal) {
                const startIdx = idxFromYM(START_YEAR, 1);
                const endIdx = idxFromYM(latestYear, 12);
                return { type: "monthly", startIdx, endIdx };
            }
            let sDate = new Date(sVal);
            let eDate = new Date(eVal);
            if (sDate > eDate) [sDate, eDate] = [eDate, sDate];
            let sIdx = idxFromYM(sDate.getFullYear(), sDate.getMonth() + 1);
            let eIdx = idxFromYM(eDate.getFullYear(), eDate.getMonth() + 1);
            const minIdx = idxFromYM(START_YEAR, 1);
            const maxIdx = idxFromYM(latestYear, 12);
            sIdx = Math.max(minIdx, sIdx);
            eIdx = Math.min(maxIdx, eIdx);
            return { type: "monthly", startIdx: sIdx, endIdx: eIdx };
        }

        const minIdx = idxFromYM(START_YEAR, 1);
        const maxIdx = idxFromYM(latestYear, 12);

        if (choice === "all") {
            return { type: "monthly", startIdx: minIdx, endIdx: maxIdx };
        }

        const spanYears = +choice;
        const startYear = Math.max(START_YEAR, latestYear - spanYears + 1);
        const startIdx = idxFromYM(startYear, 1);
        return { type: "monthly", startIdx, endIdx: maxIdx };
    }
}

function getRegionStates(regionKey) {
    return REGION_STATES[regionKey] ? REGION_STATES[regionKey].slice() : [];
}

function getSelectedStates(mode, range) {
    if (mode === "all") {
        return allStates.slice();
    }

    if (mode === "region") {
        const regionKey = trendRegionSelect.node().value;
        return getRegionStates(regionKey).filter(s => allStates.includes(s));
    }

    if (mode === "custom") {
    const selected = [];
    trendCustomStatesSelect.selectAll("input[type='checkbox']").each(function() {
        if (this.checked) selected.push(this.value);
    });
    return selected;
}

    // top or bottom by average temp over active range
    const dataset = currentDataset === "yearly" ? tempData.yearly : tempData.monthly;
    const keyF = currentDataset === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F";
    const keyC = currentDataset === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C";
    const key = currentUnit === "F" ? keyF : keyC;

    const stats = allStates.map(state => {
        let sum = 0, count = 0;

        if (range.type === "yearly") {
            dataset.forEach(d => {
                if (d.State !== state) return;
                if (d.Year < range.startYear || d.Year > range.endYear) return;
                const v = d[key];
                if (v == null || isNaN(v)) return;
                sum += v;
                count += 1;
            });
        } else {
            dataset.forEach(d => {
                if (d.State !== state) return;
                const idx = idxFromYM(d.Year, d.Month);
                if (idx < range.startIdx || idx > range.endIdx) return;
                const v = d[key];
                if (v == null || isNaN(v)) return;
                sum += v;
                count += 1;
            });
        }

        return { state, avg: count ? sum / count : NaN };
    }).filter(x => !isNaN(x.avg));

    if (!stats.length) return [];

    stats.sort((a, b) => a.avg - b.avg);

    if (mode === "top5") {
        return stats.slice(-5).map(x => x.state);
    }

    // bottom5
    return stats.slice(0, 5).map(x => x.state);
}

function buildSeriesData(states, range) {
    const dataset = currentDataset === "yearly" ? tempData.yearly : tempData.monthly;
    const keyF = currentDataset === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F";
    const keyC = currentDataset === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C";
    const key = currentUnit === "F" ? keyF : keyC;
    const useDelta = analyticsMode === "delta";

    const series = [];

    states.forEach(state => {
        const records = dataset.filter(d => d.State === state);
        if (!records.length) return;

        let baseline = null;
        if (useDelta) {
            let baseRec;
            if (currentDataset === "yearly") {
                baseRec = records.find(r => r.Year === baseYear);
            } else {
                baseRec = records.find(r => r.Year === baseYear && r.Month === baseMonth);
            }
            if (!baseRec) return;
            baseline = baseRec[key];
            if (baseline == null || isNaN(baseline)) return;
        }

        const points = [];
        records.forEach(r => {
            if (range.type === "yearly") {
                if (r.Year < range.startYear || r.Year > range.endYear) return;
            } else {
                const idx = idxFromYM(r.Year, r.Month);
                if (idx < range.startIdx || idx > range.endIdx) return;
            }
            const val = r[key];
            if (val == null || isNaN(val)) return;

            const date = currentDataset === "yearly"
                ? new Date(r.Year, 0, 1)
                : new Date(r.Year, r.Month - 1, 1);
            const yVal = useDelta ? (val - baseline) : val;

            points.push({ date, value: yVal, raw: val, Year: r.Year, Month: r.Month });
        });

        if (points.length) {
            points.sort((a, b) => a.date - b.date);
            series.push({ state, points });
        }
    });

    return series;
}

function drawStateLineChart(series) {
    const svgChart = d3.select("#state-linechart");
    svgChart.selectAll("*").remove();
    nationalLineChartSvg = svgChart; // Store reference

    if (!series.length) return;

    const margin = { top: 20, right: 40, bottom: 30, left: 50 };
    const width = 900;
    const height = 260;

    svgChart
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const allPoints = series.flatMap(s => s.points);
    const xExtent = d3.extent(allPoints, p => p.date);
    const yExtent = d3.extent(allPoints, p => p.value);

    const x = d3.scaleTime().domain(xExtent).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain(yExtent).nice().range([height - margin.bottom, margin.top]);
    
    nationalLineChartXScale = x;
    nationalLineChartMargin = margin;
    nationalLineChartHeight = height;

    const xAxis = d3.axisBottom(x).ticks(6).tickSizeOuter(0);
    const yAxis = d3.axisLeft(y).ticks(6).tickSizeOuter(0);

    const gx = svgChart.append("g")
        .attr("class", "axis axis-x")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(xAxis);

    gx.selectAll("text")
        .attr("fill", "var(--muted)")
        .attr("font-size", 12);

    const gy = svgChart.append("g")
        .attr("class", "axis axis-y")
        .attr("transform", `translate(${margin.left},0)`)
        .call(yAxis);

    gy.selectAll("text")
        .attr("fill", "var(--muted)")
        .attr("font-size", 12);

    gy.selectAll(".tick line").attr("stroke", "var(--border)");
    gx.selectAll(".tick line").attr("stroke", "var(--border)");
    svgChart.selectAll(".domain").attr("stroke", "var(--border)");

    const line = d3.line()
        .x(p => x(p.date))
        .y(p => y(p.value));

    series.forEach(s => {
        svgChart.append("path")
            .datum(s.points)
            .attr("fill", "none")
            .attr("stroke", lineColorScale(s.state))
            .attr("stroke-width", 1.8)
            .attr("opacity", 0.9)
            .attr("d", line);
    });

    // hover interaction uses shared tooltip
    const overlay = svgChart.append("rect")
        .attr("class", "hover-capture")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", width - margin.left - margin.right)
        .attr("height", height - margin.top - margin.bottom)
        .style("fill", "none")
        .style("pointer-events", "all");

    const shouldShowIndicator = analyticsMode !== "delta";
    nationalTimelineIndicator = svgChart.append("line")
        .attr("class", "timeline-indicator")
        .attr("stroke", "var(--accent)")
        .attr("stroke-width", 3)
        .attr("stroke-dasharray", "6 3")
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .style("opacity", shouldShowIndicator ? 1 : 0)
        .style("visibility", shouldShowIndicator ? "visible" : "hidden")
        .style("pointer-events", "none")
        .style("filter", shouldShowIndicator ? "drop-shadow(0 0 3px var(--accent))" : "none");
    
    svgChart.append("circle")
        .attr("class", "timeline-indicator-dot")
        .attr("r", 5)
        .attr("fill", "var(--accent)")
        .attr("stroke", "var(--card)")
        .attr("stroke-width", 2)
        .attr("cy", margin.top)
        .style("opacity", shouldShowIndicator ? 1 : 0)
        .style("visibility", shouldShowIndicator ? "visible" : "hidden")
        .style("pointer-events", "none")
        .style("filter", shouldShowIndicator ? "drop-shadow(0 0 4px var(--accent))" : "none");

    const focusLine = svgChart.append("line")
        .attr("class", "focus-line")
        .style("stroke", "var(--border)")
        .style("stroke-width", 1)
        .style("opacity", 0);

    const timePoints = Array.from(new Set(allPoints.map(p => +p.date))).sort((a, b) => a - b);
    const bisect = d3.bisector(d => d).left;

    overlay.on("mousemove", (event) => {
        const [mx] = d3.pointer(event);
        const date = x.invert(mx);
        const idx = bisect(timePoints, +date);
        const clampedIdx = Math.max(0, Math.min(timePoints.length - 1, idx));
        const targetTime = new Date(timePoints[clampedIdx]);

        focusLine
            .attr("x1", x(targetTime))
            .attr("x2", x(targetTime))
            .attr("y1", margin.top)
            .attr("y2", height - margin.bottom)
            .style("opacity", 1);

        const rows = [];
        series.forEach(s => {
            if (!s.points.length) return;
            let best = s.points[0];
            let minDiff = Math.abs(+best.date - +targetTime);
            s.points.forEach(p => {
                const diff = Math.abs(+p.date - +targetTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    best = p;
                }
            });
            rows.push({ state: s.state, value: best.value });
        });

        rows.sort((a, b) => b.value - a.value);

        const unitLabel = `°${currentUnit}`;
        const year = targetTime.getFullYear();
        const monthLabel = currentDataset === "monthly" ? ` ${monName(targetTime.getMonth() + 1)}` : "";
        let html = `<strong>Multi state trend</strong><br>${year}${monthLabel}<br>`;

        rows.forEach(r => {
            html += `<span style="display:inline-block;width:12px;height:12px;background:${lineColorScale(r.state)};margin-right:4px;border-radius:2px;"></span>${r.state}: ${r.value.toFixed(2)} ${unitLabel}<br>`;
        });

        tooltip.html(html)
            .style("left", (event.pageX + 14) + "px")
            .style("top", (event.pageY - 24) + "px")
            .style("opacity", 1);
    }).on("mouseleave", () => {
        focusLine.style("opacity", 0);
        tooltip.style("opacity", 0);
    });
}

function updateNationalTimelineIndicator() {
    if (analyticsMode === "delta") {
        if (nationalTimelineIndicator) {
            nationalTimelineIndicator
                .style("opacity", 0)
                .style("visibility", "hidden");
        }
        if (nationalLineChartSvg) {
            const dot = nationalLineChartSvg.select(".timeline-indicator-dot");
            if (!dot.empty()) {
                dot
                    .style("opacity", 0)
                    .style("visibility", "hidden");
            }
        }
        return;
    }
    
    if (!nationalTimelineIndicator || !nationalLineChartXScale || !multiStateInitialized) return;

    let currentDate;
    if (currentDataset === "yearly") {
        currentDate = new Date(+currentValue, 0, 1); // January 1st of the year
    } else {
        const [month, year] = String(currentValue).split("-").map(Number);
        currentDate = new Date(year, month - 1, 1); // First day of the month
    }

    const domain = nationalLineChartXScale.domain();
    const isInDomain = currentDate >= domain[0] && currentDate <= domain[1];
    
    if (isInDomain) {
        const xPos = nationalLineChartXScale(currentDate);
        nationalTimelineIndicator
            .attr("x1", xPos)
            .attr("x2", xPos)
            .style("opacity", 1)
            .style("visibility", "visible");
        
        if (nationalLineChartSvg) {
            const dot = nationalLineChartSvg.select(".timeline-indicator-dot");
            if (!dot.empty()) {
                dot.attr("cx", xPos)
                   .attr("cy", nationalLineChartMargin.top)
                   .style("opacity", 1)
                   .style("visibility", "visible");
            }
        }
    } else {
        nationalTimelineIndicator
            .style("opacity", 0)
            .style("visibility", "hidden");
        if (nationalLineChartSvg) {
            const dot = nationalLineChartSvg.select(".timeline-indicator-dot");
            if (!dot.empty()) {
                dot
                    .style("opacity", 0)
                    .style("visibility", "hidden");
            }
        }
    }
}

function updateTrendTable(series, range) {
    trendTableBody.selectAll("*").remove();

    if (!series.length) {
        trendTableLoading.style("display", "none");
        return;
    }

    const rows = [];
    series.forEach(s => {
        const pts = s.points;
        if (!pts.length) return;
        const first = pts[0];
        const last = pts[pts.length - 1];

        const startVal = analyticsMode === "delta" ? first.value : first.raw;
        const endVal = analyticsMode === "delta" ? last.value : last.raw;
        const trend = endVal - startVal;


        const parseIndex = d => (d.Year - START_YEAR) * 12 + (d.Month - 1);
        const xVals = pts.map(p => {
            if (currentDataset === "yearly") {
                return p.Year;
            } else {
                return parseIndex(p);
            }
        });
        const yVals = pts.map(p => p.value);

        const n = xVals.length;
        const sumX = d3.sum(xVals);
        const sumY = d3.sum(yVals);
        const sumXY = d3.sum(xVals.map((x, i) => x * yVals[i]));
        const sumXX = d3.sum(xVals.map(x => x * x));
        
        let slope = 0;
        const denominator = n * sumXX - sumX * sumX;
        if (denominator !== 0) {
            slope = (n * sumXY - sumX * sumY) / denominator;
        }

        const trendSlope = slope;

        let statePeriodLabel;
        if (currentDataset === "yearly") {
            const startYear = first.Year;
            const endYear = last.Year;
            statePeriodLabel = `${startYear} – ${endYear}`;
        } else {
            const startYear = first.Year;
            const startMonth = first.Month;
            const endYear = last.Year;
            const endMonth = last.Month;
            statePeriodLabel = `${fmtLabel(startYear, startMonth, true)} → ${fmtLabel(endYear, endMonth, true)}`;
        }

        rows.push({
            state: s.state,
            trend,
            trendSlope,
            startVal,
            endVal,
            periodLabel: statePeriodLabel
        });
    });

    rows.sort((a, b) => b.trend - a.trend);

    const unitLabel = `°${currentUnit}`;

    const tr = trendTableBody.selectAll("tr")
        .data(rows)
        .join("tr");

    const trendUnit = currentDataset === "yearly" ? "yr" : "mo";
    const trendLabel = currentDataset === "yearly" ? `${unitLabel}/yr` : `${unitLabel}/mo`;
    
    tr.append("td").text(d => d.state);
    tr.append("td").text(d => `${d.trend >= 0 ? "+" : ""}${d.trend.toFixed(2)} ${unitLabel}`);
    tr.append("td").text(d => {
        if (d.trendSlope === 0 || isNaN(d.trendSlope)) return "—";
        return `${d.trendSlope >= 0 ? "+" : ""}${d.trendSlope.toFixed(3)} ${trendLabel}`;
    });
    tr.append("td").text(d => d.startVal != null ? d.startVal.toFixed(2) + " " + unitLabel : "NA");
    tr.append("td").text(d => d.endVal != null ? d.endVal.toFixed(2) + " " + unitLabel : "NA");
    tr.append("td").text(d => d.periodLabel);

    trendTableLoading.style("display", "none");
}

function updateLineChartAndTable() {
    if (!multiStateInitialized) return;

    const range = getActiveDateRange();
    const mode = trendStateMode.node().value;
    const selectedStates = getSelectedStates(mode, range);

    const showingAllStates = mode === "all";

    if (showingAllStates) {
        stateLinechartLoading.style("display", "block");
    } else {
        stateLinechartLoading.style("display", "none");
    }
    trendTableLoading.style("display", "block");

    // slight delay so Loading text can show for heavy cases
    const delay = showingAllStates ? 20 : 0;

    setTimeout(() => {
        const series = buildSeriesData(selectedStates, range);

        drawStateLineChart(series);
        updateNationalTimelineIndicator(); // Update indicator position

        // build legend
        const legend = d3.select("#state-linechart-legend");
        legend.selectAll("*").remove();
        const legendItems = legend.selectAll(".legend-item")
            .data(series, d => d.state)
            .join("div")
            .attr("class", "legend-item");

        legendItems.append("span")
            .attr("class", "legend-swatch")
            .style("background-color", d => lineColorScale(d.state));

        legendItems.append("span")
            .attr("class", "legend-label")
            .text(d => d.state);

        updateTrendTable(series, range);

        stateLinechartLoading.style("display", "none");
    }, delay);
}
