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

const colorScaleF = d3.scaleSequential().domain([40, 90]).interpolator(d3.interpolateTurbo);
const colorScaleC = d3.scaleSequential().domain([4, 32]).interpolator(d3.interpolateTurbo);

let mapData, tempData = {};
let currentDataset = "yearly";
let currentUnit = "F";
let currentValue = 2000;

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
const END_YEAR = 2020;

const idxFromYM = (y, m) => (y - START_YEAR) * 12 + (m - 1);
const ymFromIdx = i => [START_YEAR + Math.floor(i / 12), (i % 12) + 1];

function monName(m) { return new Date(2000, m - 1).toLocaleString("default", { month: "short" }); }
function fmtLabel(y, m, isMonthly) { return isMonthly ? `${monName(m)}-${y}` : `${y}`; }

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

    drawMap();
    setSliderForDataset();
    updateMap(currentValue);
    buildLegend("average", currentUnit === "F" ? colorScaleF : colorScaleC);
    initAnalyticsSliders();
});

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

        // Restore default tooltip (it already handles delta branch)
        svg.selectAll(".state")
            .on("mousemove", handleMouseMove)
            .on("mouseleave", handleMouseLeave);
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
});

unitToggle.on("change", e => { currentUnit = e.target.checked ? "C" : "F"; updateMap(currentValue); });

dataToggle.on("change", e => {
    currentDataset = e.target.checked ? "yearly" : "monthly";
    setSliderForDataset();
    initAnalyticsSliders();
    updateMap(currentValue);
});

function setAnalyticsMode(mode) {
    analyticsMode = mode;
    // Reset all toggles
    displayToggle.property("checked", mode === "delta");
    maxToggle.property("checked", mode === "max");
    minToggle.property("checked", mode === "min");

    // Disable main slider for delta mode only
    const mainSlider = document.querySelector("#year, #monthyear");
    const isDelta = mode === "delta";
    mainSlider.disabled = isDelta;
    mainSlider.style.opacity = isDelta ? "0.4" : "1.0";
    mainSlider.style.pointerEvents = isDelta ? "none" : "auto";

    // Show/hide base/end sliders
    const baseRowEl = document.querySelector(".range-row");
    const endRowEl = document.getElementById("end-row");
    baseRowEl.style.display = isDelta ? "grid" : "none";
    endRowEl.style.display = isDelta ? "grid" : "none";

    updateMap(currentValue);
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
