// ==============================
// State Detail Page Script (Full Updated Version)
// ==============================

// --- 1. Get state name from query ---
const params = new URLSearchParams(window.location.search);
const selectedState = params.get("state");

// --- 2. Update page title and header ---
if (selectedState) {
    document.getElementById("state-header").textContent = `${selectedState} — Temperature View`;
    document.getElementById("state-title").textContent = `Average Temperatures in ${selectedState}`;
    document.title = `${selectedState} — State Temperature View`;
}

// --- 3. Back button ---
document.getElementById("back-btn").addEventListener("click", () => {
    window.location.href = "../index.html";
});

// --- 4. Controls ---
const monthYearInput = d3.select("#monthyear");
const monthYearLabel = d3.select("#monthyear-label");
const unitToggle = d3.select("#unit-toggle");
const dataToggle = d3.select("#data-toggle");
let currentUnit = "F";
let currentDataset = "monthly";
let currentYear = 1800;
let currentMonth = 1;

// --- 5. SVG setup ---
const width = 980, height = 400;
const svgState = d3.select("#stateview");
const svgLine = d3.select("#linechart");

// --- 6. Color scales ---
const colorScaleF = d3.scaleSequential().interpolator(d3.interpolateTurbo);
const colorScaleC = d3.scaleSequential().interpolator(d3.interpolateTurbo);

// --- 7. Load map and data ---
Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
    d3.csv("../data/state_yearly_avg.csv"),
    d3.csv("../data/state_monthly_avg.csv")
]).then(([us, yearly, monthly]) => {
    const geo = topojson.feature(us, us.objects.states).features;
    const stateFeature = geo.find(f => f.properties.name === selectedState);

    // --- Clean and filter data ---
    yearly.forEach(d => {
        d.Year = +d.Year;
        d.AvgTemp_F_Yearly = +d.AvgTemp_F_Yearly;
        d.AvgTemp_C_Yearly = +d.AvgTemp_C_Yearly;
    });
    monthly.forEach(d => {
        d.dt = new Date(d.dt);
        d.Year = d.dt.getFullYear();
        d.Month = d.dt.getMonth() + 1;
        d.AvgTemp_F = +d.AvgTemp_F;
        d.AvgTemp_C = +d.AvgTemp_C;
    });

    const stateYearly = yearly.filter(d => d.State === selectedState);
    const stateMonthly = monthly.filter(d => d.State === selectedState);

    // --- Initial slider setup ---
    const totalMonths = (2020 - 1800 + 1) * 12 - 1;
    monthYearInput
        .attr("min", 0)
        .attr("max", totalMonths)
        .attr("step", 1)
        .property("value", 0);

    // --- Initial label and draw ---
    monthYearLabel.text("Jan-1800");
    drawStateMap(stateFeature, stateMonthly, currentMonth, currentYear);
    drawLineChart(stateMonthly, "monthly");

    // --- Helper: update all visualizations ---
    function updateView() {
        if (currentDataset === "yearly") {
            // Switch slider to yearly range
            monthYearInput
                .attr("min", 1800)
                .attr("max", 2020)
                .attr("step", 1)
                .property("value", currentYear);
            monthYearLabel.text(currentYear);

            drawStateMap(stateFeature, stateYearly, 1, currentYear);
            drawLineChart(stateYearly, "yearly");
        } else {
            // Switch slider to monthly range
            const totalMonths = (2020 - 1800 + 1) * 12 - 1;
            const index = (currentYear - 1800) * 12 + (currentMonth - 1);
            monthYearInput
                .attr("min", 0)
                .attr("max", totalMonths)
                .attr("step", 1)
                .property("value", index);
            const monthNameStr = new Date(currentYear, currentMonth - 1)
                .toLocaleString("default", { month: "short" });
            monthYearLabel.text(`${monthNameStr}-${currentYear}`);

            drawStateMap(stateFeature, stateMonthly, currentMonth, currentYear);
            drawLineChart(stateMonthly, "monthly");
        }
    }

    // --- Slider handler ---
    monthYearInput.on("input", e => {
        if (currentDataset === "yearly") {
            currentYear = +e.target.value;
            monthYearLabel.text(currentYear);
            drawStateMap(stateFeature, stateYearly, 1, currentYear);
            drawLineChart(stateYearly, "yearly");
        } else {
            const index = +e.target.value;
            const year = 1800 + Math.floor(index / 12);
            const month = (index % 12) + 1;
            currentYear = year;
            currentMonth = month;

            const monthNameStr = new Date(year, month - 1)
                .toLocaleString("default", { month: "short" });
            monthYearLabel.text(`${monthNameStr}-${year}`);

            drawStateMap(stateFeature, stateMonthly, currentMonth, currentYear);
            drawLineChart(stateMonthly, "monthly");
        }
    });

    // --- °F / °C toggle ---
    unitToggle.on("change", e => {
        currentUnit = e.target.checked ? "C" : "F";
        updateView();
    });

    // --- Data View toggle (Monthly / Yearly) ---
    dataToggle.on("change", e => {
        currentDataset = e.target.checked ? "yearly" : "monthly";
        updateView();
    });
});

// --- 8. Draw map ---
function drawStateMap(stateFeature, data, month = 1, year = 1800) {
    const key =
        currentUnit === "F"
            ? (data[0].AvgTemp_F_Yearly !== undefined ? "AvgTemp_F_Yearly" : "AvgTemp_F")
            : (data[0].AvgTemp_C_Yearly !== undefined ? "AvgTemp_C_Yearly" : "AvgTemp_C");

    let filtered;
    if (data[0].Month) {
        filtered = data.filter(d => d.Year === year && d.Month === month);
    } else {
        filtered = data.filter(d => d.Year === year);
    }

    const tempVal = filtered.length ? filtered[0][key] : null;
    const scale = currentUnit === "F" ? colorScaleF : colorScaleC;
    scale.domain([0, currentUnit === "F" ? 90 : 32]);

    svgState.selectAll("*").remove();

    // --- Center and zoom out 10% ---
    const projection = d3.geoAlbersUsa().fitSize([width * 0.9, height * 0.9], stateFeature);
    const path = d3.geoPath(projection);

    svgState.append("path")
        .datum(stateFeature)
        .attr("d", path)
        .attr("fill", tempVal ? scale(tempVal) : "#444")
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 1.5)
        .attr("transform", `translate(${width * 0.05}, ${height * 0.05})`);

    svgState.append("text")
        .attr("x", width / 2)
        .attr("y", height - 20)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--text)")
        .attr("font-size", "14px")
        .text(
            tempVal
                ? `${monthName(month)} ${year} Avg: ${tempVal.toFixed(1)} °${currentUnit}`
                : `No data for ${monthName(month)} ${year}`
        );
}

// --- 9. Draw line chart ---
function drawLineChart(data, mode = "monthly") {
    svgLine.selectAll("*").remove();

    const key =
        currentUnit === "F"
            ? (mode === "yearly" ? "AvgTemp_F_Yearly" : "AvgTemp_F")
            : (mode === "yearly" ? "AvgTemp_C_Yearly" : "AvgTemp_C");

    const margin = { top: 30, right: 30, bottom: 175, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    let x, xAxis;
    if (mode === "yearly") {
        x = d3.scaleLinear()
            .domain(d3.extent(data, d => d.Year))
            .range([0, innerWidth]);
        xAxis = d3.axisBottom(x).tickFormat(d3.format("d")).ticks(10);
    } else {
        const parseIndex = d => (d.Year - 1800) * 12 + d.Month - 1;
        x = d3.scaleLinear()
            .domain(d3.extent(data, parseIndex))
            .range([0, innerWidth]);
        xAxis = d3.axisBottom(x)
            .ticks(10)
            .tickFormat(i => {
                const year = 1800 + Math.floor(i / 12);
                const month = (i % 12) + 1;
                return `${monthName(month)} ${year}`;
            });
    }

    const y = d3.scaleLinear()
        .domain(d3.extent(data, d => d[key])).nice()
        .range([innerHeight, 0]);

    const line = d3.line()
        .x(d => (mode === "yearly" ? x(d.Year) : x((d.Year - 1800) * 12 + d.Month - 1)))
        .y(d => y(d[key]));

    const g = svgLine.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "var(--accent)")
        .attr("stroke-width", 1.8)
        .attr("d", line);

// --- X Axis ---
    const xAxisGroup = g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(xAxis);

    xAxisGroup.selectAll("text")
        .style("fill", "var(--muted)")
        .style("font-size", "10px")
        .attr("transform", "rotate(-40)")
        .attr("text-anchor", "end");

// Add visible baseline line (styled like chart border)
    xAxisGroup.select(".domain")
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 1.5);

    xAxisGroup.selectAll(".tick line")
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 0.8)
        .attr("y2", 4); // short downward ticks

    g.selectAll(".domain")
        .attr("stroke", "var(--border)")
        .attr("stroke-width", 1.5);

    g.append("g")
        .call(d3.axisLeft(y).ticks(6))
        .selectAll("text")
        .style("fill", "var(--muted)");

    g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 65)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--muted)")
        .attr("font-size", "13px")
        .text(mode === "yearly" ? "Year" : "Month-Year");

    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -45)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--muted)")
        .attr("font-size", "13px")
        .text(`Average Temperature (°${currentUnit})`);

    g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", -10)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--text)")
        .attr("font-size", "15px")
        .text(
            mode === "yearly"
                ? `Yearly Average Temperature Trend — ${selectedState}`
                : `Monthly Average Temperature Trend — ${selectedState}`
        );
}

// --- Helper ---
function monthName(m) {
    return new Date(2000, m - 1).toLocaleString("default", { month: "short" });
}
