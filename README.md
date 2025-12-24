# U.S. Temperature Change Explorer

An interactive data visualization platform for exploring long-term temperature trends across the United States. This project combines data engineering, analytical reasoning, and front-end visualization to support spatial and temporal analysis at national and state levels.

The application is designed for audiences interested in climate trends, policy analysis, and large-scale data interpretation, with an emphasis on clarity, performance, and analytical flexibility.

---

## Project Overview

This project ingests processed temperature datasets and presents them through interactive maps and time-series views. Users can explore how temperatures change over time, compare regions, and examine trends at multiple geographic resolutions.

The work emphasizes skills relevant to data science, business intelligence, data analysis, and data engineering roles:

* transforming raw climate data into structured analytical datasets
* building reproducible data pipelines for aggregation and comparison
* designing interactive visual analytics tools for decision support
* communicating complex temporal patterns through intuitive interfaces

---

## Running the Project


### Hosted Version

View the deployed version via GitHub Pages:
[
https://jcrawford05.github.io/us-temperature-changes/](https://jcrawford05.github.io/us-temperature-changes/)

The hosted build reflects the latest committed release.

### Locally Host

Run a local web server and open `index.html` through that server. This is required for proper loading of CSV data files due to browser security restrictions.

---

## Demo & Documentation

* Screencast Walkthrough:
  [https://youtu.be/iKoOKhreXxc](https://youtu.be/iKoOKhreXxc)

* Process Documentation:
  Detailed design reasoning, analytical decisions, and implementation notes are included in the process book PDFs under the `Documents/` directory.

---

## Key Features

### National Temperature Map

* Choropleth map of U.S. states rendered with D3 and TopoJSON
* Temporal controls to explore changes across decades
* Multiple analytical modes, including average, delta, minimum, and maximum temperature views

### Multi-State Trend Analysis

* Time-series visualization enabling direct comparison across multiple states
* Supports identification of regional clustering and divergence patterns
* Complements spatial analysis with longitudinal context

### State-Level Deep Dive

* Dedicated state pages with detailed line graphs
* Monthly and yearly aggregation options
* Designed to highlight intra-state variability and long-term trends

---

## Data Engineering & Analytics

The datasets used in this project are pre-processed into analysis-ready CSV files. Raw climate records were cleaned, filtered, and aggregated into monthly and yearly summaries at city and state levels.

Key data operations include:

* geographic normalization and state mapping
* aggregation across temporal granularities
* consistency checks between outdated and updated datasets
* separation of national, state, and city-level views for scalability

This structure mirrors real-world analytical workflows where raw data must be transformed into reliable reporting layers.

---

## Tech Stack

* JavaScript (ES6)
* D3.js
* TopoJSON / GeoJSON
* HTML / CSS
* CSV-based data pipeline compatible with static hosting

The project is intentionally framework-light to emphasize core data visualization and analytical logic.

---

## Repository Structure

```
us-temperature-changes/
│
├── data/
│   ├── city_monthly_avg.csv
│   ├── city_monthly_avg_outdated.csv
│   ├── state_monthly_avg.csv
│   └── state_yearly_avg.csv
│
├── Documents/
│   ├── DataVis Todo doc.txt
│   ├── Final Project Proposal.pdf
│   ├── Global Temp.Changes - Process Book.pdf
│   └── ProcessBook.pdf
│
├── state_page/
│   ├── state.html
│   └── state-script.js
│
├── index.html
├── script.js
└── style.css
```
---

## Authors

**Primary Author**

* James Crawford
* Katelyn Abraham

**Contributors**

* Max Terranova
