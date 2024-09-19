/*
Using the following APIs:
    Country Codes: https://restcountries.com/v3.1/all?fields=cca2,cca3,name
    Flags: https://flagsapi.com/ OR https://flagcdn.com/
    COVID-19 Current Data: https://covid-19.dataflowkit.com/v1 (Potentially corrupted, but still up to date. Consider using covid-api.com, which is outdated, but has good per-country data)
    COVID-19 Historical Data: https://corona.lmao.ninja/v2/
    Location request: https://api.country.is/
*/

const DEBUG_DISABLE_ENDPOINTS = !1;
const DEBUG_DISABLE_NOAPI_ALERT = !1;
const DEBUG_DISABLE_ONREADY = !1;
const DEBUG_DISABLE_LOGGING = 1;

if (DEBUG_DISABLE_LOGGING) window["console"]["log"] = function () {};

/*
This will queue requests that may potentially ruin the statistics if they run in parallel since it can be accidentally triggered by the user.
Limit each key's queue to 2 entries, both of which must be array containing [function, arguments, etc.]. Here's how it works:
    initially, this will be left blank. If a new request is submitted, it will add itself to the queue and execute right away.
    If a second request is called WHILE another request is running, the request will yield until the previous function is finished.
    If another request is called WHILE one is running AND one is waiting to be run, replace the waiting entry with the new one.

    If there are no further requests and the running task is done, it will be removed from the queue, allowing the waiting entry (if there is one) to be moved to leave space for future requests and be executed.
*/
// List of pending requests. Recommended to not be modified outside queueRequest. Structure: {sample: [ [runningFunc, [args...]], [queuedFunc, [args...]] ]}
const PENDING_REQUEST_QUEUE = {
  sample: [],
};
function queueRequest(queueName, func, argumentArray = []) {
  queueRequestAsync(queueName, func, argumentArray);
}

async function queueRequestAsync(queueName, func, argumentArray = []) {
  if (queueName in PENDING_REQUEST_QUEUE) {
    if (PENDING_REQUEST_QUEUE[queueName].length >= 1) {
      PENDING_REQUEST_QUEUE[queueName][1] = [func, argumentArray];
    } else {
      PENDING_REQUEST_QUEUE[queueName].push([func, argumentArray]);
    }
    console.log(
      "Queue exists, there should be some running requests in it, hence it is added to the queue."
    );
    return;
  }

  console.log("Queue start!");
  PENDING_REQUEST_QUEUE[queueName] = [[func, argumentArray]];
  while (
    queueName in PENDING_REQUEST_QUEUE &&
    PENDING_REQUEST_QUEUE[queueName].length > 0
  ) {
    await PENDING_REQUEST_QUEUE[queueName][0][0].apply(
      null,
      PENDING_REQUEST_QUEUE[queueName][0][1]
    );
    PENDING_REQUEST_QUEUE[queueName].shift();

    console.log("Shifting queue...");
  }
  delete PENDING_REQUEST_QUEUE[queueName];
  console.log("Queue done!");
}

const _404 = "./err/404uhoh.html";
const _503 = "./err/uhoh.html";

const loadingTextTakesLong = "This takes longer than expected";
const loadingTextCountries = "Loading Countries";
const loadingTextData = "Getting latest COVID-19 Data";
const loadingTextProcess = "Matching Entries";
const loadingTextComplete = "Welcome";
const loadingLongDuration = 15000; // 15s;
const loadingTimeout = 30000; // 30s;

const noDataText = "No Data";
const cannotGetDataText = "-";
const smallNoDatatext = "-";

const titlePrefix = "COVID-19 Statistics";
const titleUnknown = "Unknown";

// Endpoints

// GET endpoints
const endpointCountries = DEBUG_DISABLE_ENDPOINTS
  ? ""
  : "https://restcountries.com/v3.1/all?fields=cca2,cca3,name,altSpellings";
const endpointCountries_pseudo = "/pseudodata/country-data.json"; // In case the API is unavailable
const endpointSpecificCountry = DEBUG_DISABLE_ENDPOINTS
  ? ""
  : "https://restcountries.com/v3.1/alpha/";
const endpointSpecificCountry_suffix = "?fields=name";
const endpointFlags = "https://flagcdn.com/24x18/"; // .png
const endpointCovidData = DEBUG_DISABLE_ENDPOINTS
  ? ""
  : "https://covid-19.dataflowkit.com/v1"; // Should get rid of the matching system if this is changed.
const endpointCovidData_pseudo = "/pseudodata/covid19-stat.json"; // In case the API is unavailable

const endpointCovidHistory_global = DEBUG_DISABLE_ENDPOINTS
  ? ""
  : "https://corona.lmao.ninja/v2/historical/all";
const endpointCovidHistory_country = DEBUG_DISABLE_ENDPOINTS
  ? ""
  : "https://corona.lmao.ninja/v2/historical/";
const endpointCovidHistory_filter_lastDays = "?lastdays=";

const endpointLocation = DEBUG_DISABLE_ENDPOINTS
  ? ""
  : "https://api.country.is/";

// POST endpoints
const endpointFeedback_POST = DEBUG_DISABLE_ENDPOINTS
  ? ""
  : 'https://c19webfeedback.requestcatcher.com/';

const banner_confirmedCases = document.getElementById("banner-confirmed-cases");
const banner_deaths = document.getElementById("banner-deaths");
const banner_recoveries = document.getElementById("banner-recoveries");
const banner_recoverRate = document.getElementById("banner-recover-rate");
const banner_fatalityRate = document.getElementById("banner-fatality-rate");
const banner_currentCases = document.getElementById("banner-current-cases");
const banner_lastUpdate = document.getElementById("last-update");

const regionOptionButton = document.querySelector(".region-dropdown-button");

/* 
There are alternate spellings and abbrieviations of countries that are found to be inaccurately matched while relying on confidence level (calculated using Levenshtein distance).
(Usually from those with very low confidence, excluded by ASCII filter or from generalized areas owned by separate political entities)
These are corrected here.

Note: Generalized areas will be mentioned by name, and no flags are present. These will have a value of "0".
Otherwise, they will have a name that perfectly matches that of restcountries.com's output.
*/
const countryPrematches = {
  "Channel Islands": 0,
  Curaçao: "Curacao",
  CAR: "Central African Republic",
  "St. Barth": "St. Barthelemy",
};

// Generalized area names are owned by separate parties, which is then associated here. This may or may not be accurate.
// {CCA2 = associatedArea}
const associatedCountries = {
  je: "Channel Islands", // Jersey
  gg: "Channel Islands", // Guernsey
};

/* Data that are not measured from countries. These are collected from other factions such as ships. These data are excluded from the analytics, but they're still tallied in Worldwide data. */
const notCountries = ["Diamond Princess", "MS Zaandam"];

let countryData;
let covidData;
let countryToCovidIndexes =
  {}; /* Dictionary of Countries and Covid Data relationship */
let countryCodeToCovidIndexes =
  {}; /* Dictionary of Countries - not by index, but in CCA2 format - and Covid Data relationship */
let covidToCountryIndexes =
  {}; /* Same as above, but keys are now values and vice versa */
let covidGeneralizedIndexes =
  {}; /* COVID-19 data indexes from generalized areas governed by separate entities. */

let dropdown;

let requestTimedOut_country = false;
let requestTimedOut_covid = false;

const regionDropdownElement = document.querySelector(".region-dropdown");
let regionDropdownOptions;

const localStatusReport = document.getElementById("local-status-report");

const feedbackFormModalId = "#feedback-form";
const feedbackSuccessModalId = "#feedback-submitted";
const feedbackSubmitButton = document.getElementById("feedback-submit");
const feedbackBodyElement = document.getElementById("feedback-input-body");
const feedbackEmailNoticeLabel = document.getElementById("feedback-email-notice");
const feedbackStatusNoticeLabel = document.getElementById("feedback-status-notice");
const feedbackSuccessBody = document.getElementById("feedback-submitted-body");

let localCC2 = "";

// History chart variables
/* Attention: Data ceased collection since March 10th, 2023 */

// These variables will be modified as history changes.
const history_countryOptionElement = document.getElementById(
  "history-country-options"
); // Usually used when statistics show generalized areas owned by multiple factions, where it will allow you to choose which one to display.
let history_countrySelector = {};
let history_currentlySelectedPeriod = {
  cases: {
    isPeriodChosen: false,
    lastDays: 7,
    period: [0, 1],
  },
  deaths: {
    isPeriodChosen: false,
    lastDays: 7,
    period: [0, 1],
  },
};
let history_covidCases = {};
let history_covidDeaths = {};
let history_covidCasesDiffed = false;
let history_covidDeathsDiffed = false;
const history_covidCasesColor = "#64a7ff";
const history_covidCasesColor_hover = "#84caff";
const history_covidDeathsColor = "#ff5566";
const history_covidDeathsColor_hover = "#ff95a6";
const history_darkerGridColor = "#2f2f2f";

const historyTime_casesEle = document.getElementById(
  "history-time-cases-options"
);
const historyTime_deathsEle = document.getElementById(
  "history-time-deaths-options"
);

const history_updateChartQueueKey = "historyUpdateQueue";

const chart_fancyTooltipGetter = (chart) => {
  let tooltipEl = chart.canvas.parentNode.querySelector(".chart-tooltip");

  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.classList.add("chart-tooltip");

    const table = document.createElement("table");
    table.style.margin = "0px";

    tooltipEl.appendChild(table);
    chart.canvas.parentNode.appendChild(tooltipEl);
  }

  return tooltipEl;
};

const chart_fancyTooltipHandler = (context) => {
  // Tooltip Element
  const { chart, tooltip } = context;
  const tooltipEl = chart_fancyTooltipGetter(chart);

  // Hide if no tooltip
  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = 0;
    return;
  }

  // Set Text
  if (tooltip.body) {
    const titleLines = tooltip.title || [];
    const bodyLines = tooltip.body.map((b) => b.lines);

    const tableHead = document.createElement("thead");

    titleLines.forEach((title) => {
      const tr = document.createElement("tr");
      tr.style.borderWidth = 0;

      const th = document.createElement("th");
      th.style.borderWidth = 0;
      th.classList.add("chart-tooltip-header");
      const text = document.createTextNode(title);

      th.appendChild(text);
      tr.appendChild(th);
      tableHead.appendChild(tr);
    });

    const tableBody = document.createElement("tbody");
    bodyLines.forEach((body, i) => {
      const colors = tooltip.labelColors[i];

      const span = document.createElement("span");
      span.style.background = colors.backgroundColor.substring(0, 7);
      span.style.borderColor = colors.borderColor;
      span.style.borderWidth = "2px";
      span.style.marginRight = "10px";
      span.style.height = "10px";
      span.style.width = "10px";
      span.style.display = "inline-block";

      const tr = document.createElement("tr");
      tr.style.backgroundColor = "inherit";
      tr.style.borderWidth = 0;

      const td = document.createElement("td");
      td.style.borderWidth = 0;
      td.classList.add("chart-tooltip-context");

      const text = document.createTextNode(body);

      td.appendChild(span);
      td.appendChild(text);
      tr.appendChild(td);
      tableBody.appendChild(tr);
    });

    const tableRoot = tooltipEl.querySelector("table");

    // Remove old children
    while (tableRoot.firstChild) {
      tableRoot.firstChild.remove();
    }

    // Add new children
    tableRoot.appendChild(tableHead);
    tableRoot.appendChild(tableBody);
  }

  const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
  const canvasWidth = chart.canvas.getBoundingClientRect().width;

  // Display, position, and set styles for font
  tooltipEl.style.opacity = 1;
  tooltipEl.style.top = positionY + tooltip.caretY + "px";
  tooltipEl.style.font = tooltip.options.bodyFont.string;
  tooltipEl.style.padding =
    tooltip.options.padding + "px " + tooltip.options.padding + "px";
  tooltipEl.style.left = positionX + tooltip.caretX + "px";

  var tooltipElRect = tooltipEl.getBoundingClientRect();
  if (canvasWidth / 2 < positionX + tooltip.caretX) {
    tooltipEl.classList.add("chart-tooltip-opposite");
  } else {
    tooltipEl.classList.remove("chart-tooltip-opposite");
  }
};

const history_covidCasesChart = new Chart(
  document.getElementById("history-cases"),
  {
    type: "line",
    data: {
      labels: null,
      datasets: [
        {
          label: "Total Cases",
          data: [],
          backgroundColor: history_covidCasesColor,
          borderColor: history_covidCasesColor,
          hoverBorderColor: history_covidCasesColor_hover,
          borderWidth: 1,
          pointBackgroundColor: fillString(history_covidCasesColor, 9, "0"),
          pointHoverBackgroundColor: history_covidCasesColor_hover,
          pointBorderWidth: 0,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      aspectRatio: 16 / 9,
      interaction: {
        intersect: false,
        mode: "index",
      },
      scales: {
        x: {
          ticks: {
            callback: history_xAxisCallback,
          },
          grid: {
            color: history_darkerGridColor,
          },
        },
        y: {
          ticks: {
            callback: history_yAxisCallback,
            precision: 0,
          },
          beginAtZero: false,
          min: 0,
          grid: {
            color: history_darkerGridColor,
          },
        },
      },
      plugins: {
        tooltip: {
          enabled: false,
          position: "nearest",
          external: chart_fancyTooltipHandler,
          callbacks: {
            title: history_titleParseCallback,
          },
        },
        legend: {
          display: false,
        },
      },
    },
  }
);
const history_covidDeathsChart = new Chart(
  document.getElementById("history-deaths"),
  {
    type: "line",
    data: {
      labels: null,
      datasets: [
        {
          label: "Total Deaths",
          data: [],
          backgroundColor: history_covidDeathsColor,
          hoverBackgroundColor: history_covidDeathsColor_hover,
          hoverBorderColor: history_covidDeathsColor_hover,
          borderWidth: 1,
          pointBackgroundColor: fillString(history_covidDeathsColor, 9, "0"),
          pointHoverBackgroundColor: history_covidDeathsColor_hover,
          pointBorderWidth: 0,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      aspectRatio: 16 / 9,
      interaction: {
        intersect: false,
        mode: "index",
      },
      scales: {
        x: {
          ticks: {
            callback: history_xAxisCallback,
          },
          grid: {
            color: history_darkerGridColor,
          },
        },
        y: {
          ticks: {
            callback: history_yAxisCallback,
            precision: 0,
          },
          beginAtZero: false,
          min: 0,
          grid: {
            color: history_darkerGridColor,
          },
        },
      },
      plugins: {
        tooltip: {
          enabled: false,
          position: "nearest",
          external: chart_fancyTooltipHandler,
          callbacks: {
            title: history_titleParseCallback,
          },
        },
        legend: {
          display: false,
        },
      },
    },
  }
);

const emailSubscribeNotice = document.getElementById("email-subscribe-notice");
const emailSubscribeField = document.getElementById("email-subscribe-field");
const emailSubscribeButton = document.getElementById("email-subscribe-btn");

//

if (!DEBUG_DISABLE_ONREADY) window.addEventListener("load", windowLoaded);

const html = document.documentElement;

// Main webpage loaded function

async function windowLoaded(ev) {
  const reportLoadingTakesLong = () =>
    (loadingText.textContent = loadingTextTakesLong);

  var listOfPseudodataLoaded = []; // List of pseudodatas aka. placeholder data that will only load when API endpoints are unreachable.

  var selectedCountryCode;
  var selectedCountryName;
  var selectedCountryExists = true;

  let loadingScreen = document.querySelector(".loading-screen");
  let loadingContent = document.querySelector(".loading-screen .web-hidden");
  let loadingText = document.querySelector(".loading-text");
  loadingContent.classList.remove("web-hidden");

  // Load data
  // Load countries
  loadingText.textContent = loadingTextCountries;
  let loadTimer = setTimeout(reportLoadingTakesLong, loadingLongDuration);

  var requests = [endpointCountries];

  var query = checkQuery();
  selectedCountryCode = query.cca2;
  if (selectedCountryCode) {
    if (
      typeof selectedCountryCode === "string" ||
      selectedCountryCode instanceof String
    ) {
      selectedCountryCode = selectedCountryCode.toLowerCase();
      requests.push(
        endpointSpecificCountry +
          selectedCountryCode +
          endpointSpecificCountry_suffix
      );
      console.log(`Selected country code detected: ${selectedCountryCode}`);
    }
  }

  await Promise.all(
    requests.map(async (url) => {
      var _data;
      try {
        _data = await fetchTimeout(url, {
          timeout: loadingTimeout,
        }).then((res) => res.json());

        if (url === endpointCountries) {
          console.log("Country data retrieved");
          countryData = _data;
        } else {
          console.log("Selected country data retrieved");
          selectedCountryName = _data.name.common;
        }
      } catch (err) {
        if (url === endpointCountries) {
          console.log("Request Timeout: Countries");
          requestTimedOut_country = true;
        } else {
          console.log("Request Timeout: Selected Country");
          selectedCountryExists = false;
        }
      }
      return _data;
    })
  );

  if (requestTimedOut_country) {
    // Try loading pseudodata of list of countries and some of its information.
    try {
      countryData = await fetchTimeout(endpointCountries_pseudo, {
        timeout: loadingTimeout,
      }).then((res) => res.json());
      console.log("Country pseudodata retrieved");
      requestTimedOut_country = false;
      listOfPseudodataLoaded.push("Country Information");
    } catch (err) {
      console.log("Request Timeout: Country Pseudodata");
      window.location.href = _503;
    }
  }

  clearTimeout(loadTimer);

  // Load COVID-19 data
  loadingText.textContent = loadingTextData;
  loadTimer = setTimeout(reportLoadingTakesLong, loadingLongDuration);
  try {
    covidData = await fetchTimeout(endpointCovidData, {
      timeout: loadingTimeout,
    }).then((res) => res.json());
    console.log("COVID19 data retrieved");
  } catch (err) {
    console.log("Request Timeout: COVID19 Data");
    requestTimedOut_covid = true;
  }

  if (requestTimedOut_covid) {
    // Try loading pseudodata of "current" COVID019 stats.
    try {
      covidData = await fetchTimeout(endpointCovidData_pseudo, {
        timeout: loadingTimeout,
      }).then((res) => res.json());
      console.log("COVID19 pseudodata retrieved");
      requestTimedOut_covid = false;
      listOfPseudodataLoaded.push("Current COVID-19 Statistics");
    } catch (err) {
      console.log("Request Timeout: COVID19 Pseudodata");
      window.location.href = _503;
    }
  }

  clearTimeout(loadTimer);

  // Process retrieved data
  loadingText.textContent = loadingTextProcess;

  if (countryData && covidData) {
    // Try matching all countries from scraped results from worldometers in order to get valid country codes for data usage (through dataflowkit)
    const averageConfidence = (countryInfo, covidDataCountryName) => {
      // Compares covid data country name from country data's country name. Ignores non-latin spellings, mostly ones that are not within ASCII.
      var avgConfidence = 0;
      var totalConfidence = 0;
      var numberOfEntries = 0;
      var confirmedConfidence = false;

      var interpret = (value) => {
        if (confirmedConfidence) return;

        if (value) {
          if (value.constructor == Object || Array.isArray(value)) {
            const [avg, total, num] = averageConfidence(
              value,
              covidDataCountryName,
              Array.isArray(value)
            );
            if (avg === 1) {
              confirmedConfidence = true;
            }

            totalConfidence += total;
            numberOfEntries += num;
            return;
          } else if (!(typeof value === "string" || value instanceof String)) {
            return;
          }

          if ([...value].some((char) => char.charCodeAt(0) > 127)) {
            // ASCII check failed
            return;
          } else {
            // ASCII check passed
            var confidence = similar(
              value.toLowerCase(),
              covidDataCountryName.toLowerCase()
            );
            if (confidence == 1) {
              //console.log(`${covidDataCountryName} must be ${value}!`);
              confirmedConfidence = true;
            }

            totalConfidence += confidence;
          }
          numberOfEntries++;
        }
      };

      if (Array.isArray(countryInfo)) {
        countryInfo.forEach((v) => {
          interpret(v);
        });
      } else {
        Object.entries(countryInfo).forEach((data) => {
          const [k, v] = data;
          interpret(v);
        });
      }

      avgConfidence = totalConfidence / numberOfEntries;

      if (confirmedConfidence) {
        avgConfidence = 1;
      }
      return [avgConfidence, totalConfidence, numberOfEntries];
    };

    const findMostConfidentCanditate = (confidences) => {
      var mostConfidentCandidate = 0;
      var mostConfident = 0;
      Object.entries(confidences).forEach((data) => {
        const [covidIndex, confidence] = data;
        if (mostConfident < confidence) {
          mostConfident = confidence;
          mostConfidentCandidate = covidIndex;
        }
      });
      return mostConfidentCandidate;
    };

    var dataDropdownContext = "";
    var dropdownContextDict = {};
    covidData.forEach((covidInfo, covidIndex) => {
      if (!("Country_text" in covidInfo)) return;

      const confidences = {};

      var covidDataCountryName = covidInfo["Country_text"];
      if (covidDataCountryName.toLowerCase() === "world") {
        // This will always be the first entry.
        dataDropdownContext = `
                <a class="country-option btn btn-dark px-3 py-2 web-bg-slightly-darker-hoverable text-white border-dark" data-id="${covidIndex}">
                    <div class="row align-items-center align-content-center justify-content-center web-disable-capture">
                        <i class="fa fa-globe"></i>
                        <p class="ml-3 mb-0"> Worldwide</p>
                    </div>
                </a>`;
        return;
      }

      if (covidDataCountryName in countryPrematches) {
        if (countryPrematches[covidDataCountryName] === 0) {
          covidGeneralizedIndexes[covidDataCountryName] = covidIndex;
          dropdownContextDict[covidDataCountryName] = `
                    <a class="country-option btn btn-dark px-3 py-2 web-bg-slightly-darker-hoverable text-white border-dark" data-id="-1" data-id-str="${covidDataCountryName}">
                        <div class="d-flex flex-row align-items-center align-content-center justify-content-center web-disable-capture">
                            <p class="mb-0">${covidDataCountryName}</p>
                        </div>
                    </a>
                    `;
          return;
        } else {
          covidDataCountryName = countryPrematches[covidDataCountryName];
          console.log(
            `Maybe ${covidInfo["Country_text"]} is ${covidDataCountryName}?`
          );
        }
      }

      if (notCountries.includes(covidDataCountryName)) {
        console.log(`Skipped one.`);
        return;
      }

      countryData.forEach((countryInfo, countryIndex) => {
        // Compare similarities between different values, then give an approximate. Ignore non-latin spellings. If there's a 100% confidence, pick that country right away.
        var [confidence, _, _] = averageConfidence(
          countryInfo,
          covidDataCountryName
        );
        confidences[countryIndex] = confidence;
      });

      var chosenDataIndex = findMostConfidentCanditate(confidences);

      var cca2 = countryData[chosenDataIndex].cca2.toLowerCase();
      var countryName = countryData[chosenDataIndex].name.common;

      if (
        confidences[chosenDataIndex] !== 1 ||
        covidDataCountryName != covidInfo["Country_text"]
      )
        console.log(
          `Matched "${countryName}" with COVID-19 Index ${covidIndex} (Index's Country: ${covidInfo["Country_text"]}) (Confidence: ${confidences[chosenDataIndex]})`
        );

      countryToCovidIndexes[chosenDataIndex] = covidIndex;
      countryCodeToCovidIndexes[cca2] = covidIndex;
      covidToCountryIndexes[covidIndex] = chosenDataIndex;

      // Add country option to dropdown's HTML

      dropdownContextDict[countryName] = `
            <a class="country-option btn btn-dark px-3 py-2 web-bg-slightly-darker-hoverable text-white border-dark" data-id="${covidIndex}">
                <div class="d-flex flex-row align-items-center align-content-center justify-content-center web-disable-capture">
                    <img
                    src="https://flagcdn.com/24x18/${cca2}.png"
                    srcset="https://flagcdn.com/48x36/${cca2}.png 2x,
                        https://flagcdn.com/72x54/${cca2}.png 3x"
                    width="24"
                    height="18"
                    alt="${countryName}">
                    <p class="ml-3 mb-0">${countryName}</p>
                </div>
            </a>
            `;
    });

    var dropdownContextKeys = Object.keys(dropdownContextDict);
    dropdownContextKeys.sort();
    dropdownContextKeys.forEach((key) => {
      dataDropdownContext += dropdownContextDict[key];
    });

    regionDropdownElement.innerHTML = dataDropdownContext;

    // After this, remember to connect all country options to an event listener.
  }

  regionDropdownOptions = document.querySelectorAll(".country-option");
  regionDropdownOptions.forEach((ele) => {
    ele.addEventListener("click", onRegionOptionClick);
  });

  // Log final retrieved data.
  console.log(countryToCovidIndexes);

  if (selectedCountryCode) {
    // Show that country first.
    if (selectedCountryCode in countryCodeToCovidIndexes) {
      displayData(countryCodeToCovidIndexes[selectedCountryCode], null, true);
    } else {
      if (selectedCountryCode in associatedCountries) {
        displayData(-1, associatedCountries[selectedCountryCode], null, true);
      } else {
        displayData(9999, null, true); // Show no data.
        if (!selectedCountryExists) {
          regionOptionButton.innerHTML = `
                    <span class="web-text-fluid-lead"> Unknown Area</span>
                    `;
        } else {
          regionOptionButton.innerHTML = `
                    <img
                    src="https://flagcdn.com/24x18/${selectedCountryCode}.png"
                    srcset="https://flagcdn.com/48x36/${selectedCountryCode}.png 2x,
                        https://flagcdn.com/72x54/${selectedCountryCode}.png 3x"
                    width="24"
                    height="18"
                    alt="${selectedCountryName}">
                    <span class="web-text-fluid-lead ml-3"> ${selectedCountryName}</span>
                    `;
        }
      }
    }
  } else {
    // Show worldwide data first.
    displayData(0, null, true);
  }

  if (listOfPseudodataLoaded.length > 0 && !DEBUG_DISABLE_NOAPI_ALERT) {
    var placeholderDataAlert = document.querySelector(".alert-something");
    var placeholderDataAlertText = document.querySelector(
      ".loaded-placeholder-data-names"
    );
    var placeholderDataAlerttextContext = "";
    listOfPseudodataLoaded.forEach((dataName) => {
      placeholderDataAlerttextContext += `<li>${dataName}</li>`;
    });

    placeholderDataAlertText.innerHTML = placeholderDataAlerttextContext;

    placeholderDataAlert.classList.remove("web-hidden");
    placeholderDataAlert.classList.remove("web-disable-capture");
  }

  // Log result from user's location
  await updateLocalData();
  resizeChartOnResize(null, window.outerWidth);

  loadingText.textContent = loadingTextComplete;

  // Make loading screen disappear and disable hidden overflow for body
  loadingScreen.classList.add("web-hidden");
  loadingScreen.classList.add("web-disable-capture");
  document.body.classList.remove("overflow-hidden");
}

// Other functions

async function fetchTimeout(resource, options = {}) {
  const {
    timeout = 8000,
    retryLimit = 5,
    retryDelay = 0,
    throwExceptionOnFail = true,
    acceptOnly200 = true,
    breakAt404 = false,
  } = options;

  var retries = retryLimit;
  var controller;
  var id;
  var response;

  var retriesExceeded = false;

  while (retries >= 0) {
    try {
      controller = new AbortController();
      id = setTimeout(() => controller.abort(), timeout);

      var failed = false;
      response = await fetch(resource, {
        ...options,
        signal: controller.signal,
      }).then((res) => {
        if (breakAt404 && res.status === 404) {
          retries = -1;
          throw "404 not found encountered with retry bypass allowed, stopped future retry attempts.";
        }

        if ((acceptOnly200 && res.status != 200) || (!acceptOnly200 && (res.status < 200 || res.status > 299))) {
          failed = true
        }
        else retries = -1;
        return res;
      });

      if (failed) {
        throw `Response not OK, ${response.status} instead`;
      }
    } catch (err) {
      clearTimeout(id);
      id = null;
      if (retries > 0) {
        console.log("Retrying...");
        retries--;
        if (retryDelay > 0) {
          await delayAsync(retryDelay);
        }
      } else {
        retriesExceeded = true;
        break;
      }
    }
  }
  if (id) clearTimeout(id);
  if (throwExceptionOnFail) {
    if (retriesExceeded) throw `Exceeded retry times! Also ${err}`;
  }
  return response;
}

function getKeyLength(json) {
  return Object.keys(json).length;
}

function displayData(
  usingCovidId = -1,
  countryStr = "",
  showDailyDataInChartByDefault = false
) {
  try {
    if (!requestTimedOut_covid) {
      if (getKeyLength(covidData) > 0) {
        if (usingCovidId >= covidData.length) {
          // Limit exceeded, return no data.
          document.title = `${titlePrefix} - ${titleUnknown}`;
          history.replaceState({}, "", "/");
          updateBannerStats();
          return;
        }

        if (usingCovidId >= 0) {
          if (usingCovidId in covidData) {
            const _stats = covidData[usingCovidId];
            var cca2 = "";
            if (usingCovidId == 0) {
              history.replaceState({}, "", "/");
              document.title = `${titlePrefix} - Worldwide`;
              regionOptionButton.innerHTML =
                '<i class="fa fa-globe"></i><span class="web-text-fluid-lead ml-3"> Worldwide</span>';
            } else {
              cca2 =
                countryData[
                  covidToCountryIndexes[usingCovidId]
                ].cca2.toLowerCase();
              var countryName =
                countryData[covidToCountryIndexes[usingCovidId]].name.common;
              document.title = `${titlePrefix} - ${countryName}`;
              history.replaceState({}, "", `?cca2=${cca2}`);
              regionOptionButton.innerHTML = `
                        <img
                        src="https://flagcdn.com/24x18/${cca2}.png"
                        srcset="https://flagcdn.com/48x36/${cca2}.png 2x,
                            https://flagcdn.com/72x54/${cca2}.png 3x"
                        width="24"
                        height="18"
                        alt="${countryName}">
                        <span class="web-text-fluid-lead ml-3"> ${countryName}</span>
                        `;
            }

            updateBannerStats(_stats);
            queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
              {
                countrySelectors: {
                  [cca2]: true,
                },
              },
              {
                showDifference: showDailyDataInChartByDefault,
              },
            ]);
          } else {
            history.replaceState({}, "", "/");
            document.title = `${titlePrefix} - ${titleUnknown}`;
            updateBannerStats();
            queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
              {
                countrySelectors: {
                  [""]: true,
                },
              },
              {
                showDifference: showDailyDataInChartByDefault,
                forceFail: true,
                forceFailMessage: "No data.",
              },
            ]);
          }
        } else {
          // Use generalized area name
          if (countryStr in covidGeneralizedIndexes) {
            const _stats = covidData[covidGeneralizedIndexes[countryStr]];
            document.title = `${titlePrefix} - ${countryStr}`;
            regionOptionButton.innerHTML = `
                    <span class="web-text-fluid-lead"> ${countryStr}</span>
                    `;

            history.replaceState({}, "", "/"); // Will not provide any parameter for the URL for now.

            updateBannerStats(_stats);

            let associatedCountryCodes = getKeysByValue(
              associatedCountries,
              countryStr
            );
            if (associatedCountryCodes && associatedCountryCodes.length > 0) {
              let parsedCountrySelectors = {};
              associatedCountryCodes.forEach((code, i) => {
                parsedCountrySelectors[code] = i === 0;
              });

              queueRequest(
                history_updateChartQueueKey,
                updateHistoryStatsFrom,
                [
                  {
                    countrySelectors: parsedCountrySelectors,
                  },
                  {
                    showDifference: showDailyDataInChartByDefault,
                  },
                ]
              );
            } else {
              queueRequest(
                history_updateChartQueueKey,
                updateHistoryStatsFrom,
                [
                  {
                    countrySelectors: {
                      [""]: true,
                    },
                  },
                  {
                    showDifference: showDailyDataInChartByDefault,
                    forceFail: true,
                    forceFailMessage: `Unable to load historical data for ${countryStr}.`,
                  },
                ]
              );
            }
          } else {
            history.replaceState({}, "", "/");
            document.title = `${titlePrefix} - ${titleUnknown}`;
            updateBannerStats();
            queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
              {
                countrySelectors: {
                  [""]: true,
                },
              },
              {
                showDifference: showDailyDataInChartByDefault,
                forceFail: true,
                forceFailMessage: "No data.",
              },
            ]);
          }
        }
      } else {
        history.replaceState({}, "", "/");
        document.title = `${titlePrefix} - ${titleUnknown}`;
        regionOptionButton.innerHTML = `<span class="web-text-fluid-lead"> N/A</span>`;
        updateBannerStats();
        queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
          {
            countrySelectors: {
              [""]: true,
            },
          },
          {
            showDifference: showDailyDataInChartByDefault,
            forceFail: true,
            forceFailMessage: "No data.",
          },
        ]);
      }
    } else {
      history.replaceState({}, "", "/");
      regionOptionButton.innerHTML = `<span class="web-text-fluid-lead"> N/A</span>`;
      updateBannerStats();
      queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
        {
          countrySelectors: {
            [""]: true,
          },
        },
        {
          showDifference: showDailyDataInChartByDefault,
          forceFail: true,
          forceFailMessage: "Unable to fulfill request.",
        },
      ]);
      document.title = `${titlePrefix} - ${titleUnknown}`;
      banner_confirmedCases.textContent = cannotGetDataText;
      banner_deaths.textContent = cannotGetDataText;
      banner_recoveries.textContent = cannotGetDataText;
    }
  } catch (err) {
    console.log(`Caught error while attempting to display data: ${err}`);
    window.location.href = _503;
  }
}

function updateBannerStats(_stats = null) {
  if (!_stats) {
    banner_confirmedCases.textContent = noDataText;
    banner_deaths.textContent = noDataText;
    banner_recoveries.textContent = noDataText;
    banner_recoverRate.textContent = smallNoDatatext;
    banner_fatalityRate.textContent = smallNoDatatext;
    banner_currentCases.textContent = smallNoDatatext;
    banner_lastUpdate.textContent = `Last Update: Unknown`;
  } else {
    var totalCases = getCovidTotalCases(_stats, true);
    var totalRecoveries = getCovidTotalRecoveries(_stats, true);
    var totalDeaths = getCovidTotalDeaths(_stats, true);

    banner_confirmedCases.textContent = !isNaN(totalCases)
      ? totalCases.toLocaleString()
      : smallNoDatatext;
    banner_deaths.textContent = !isNaN(totalDeaths)
      ? totalDeaths.toLocaleString()
      : smallNoDatatext;
    banner_recoveries.textContent = !isNaN(totalRecoveries)
      ? totalRecoveries.toLocaleString()
      : smallNoDatatext;

    var survivalRate = totalCases === 0 ? 1 : totalRecoveries / totalCases;
    var survivalRateNaN = isNaN(survivalRate);
    var deathRate = totalCases === 0 ? 0 : totalDeaths / totalCases;
    var deathrateNaN = isNaN(deathRate);

    banner_recoverRate.textContent = survivalRateNaN
      ? "Unknown"
      : `${`${survivalRate * 100}`.substring(0, 5)}%`;
    banner_fatalityRate.textContent = deathrateNaN
      ? "Unknown"
      : `${`${deathRate * 100}`.substring(0, 5)}%`;
    banner_currentCases.textContent =
      survivalRateNaN || deathrateNaN
        ? "Unknown"
        : (totalCases - (totalRecoveries + totalDeaths)).toLocaleString();

    var isLastUpdateDateValid = true;
    if (isNaN(Date.parse(getCovidLastUpdate(_stats))))
      isLastUpdateDateValid = false;
    var isDatabaseLastUpdateValid = true;
    if (isNaN(Date.parse(getCovidDatabaseLastUpdate())))
      isDatabaseLastUpdateValid = false;

    banner_lastUpdate.innerHTML = `Last Update: ${
      isLastUpdateDateValid
        ? `${getCovidLastUpdate(_stats)} (GMT)`
        : isDatabaseLastUpdateValid
        ? `${getCovidDatabaseLastUpdate()} (GMT) <i class="fa fa-question-circle"></i><span class="web-tooltiptext">Latest update time of the entire database.</span>`
        : "Unknown"
    }`;
  }
}

// History Charts

// Callback for x-axis labels on history charts
function history_xAxisCallback(v) {
  return getReadableDate_en(
    new Date(this.getLabelForValue(v)),
    localCC2 === "us",
    true
  );
}

// Callback for y-axis labels on history charts
function history_yAxisCallback(v) {
  return shortenNumber(v);
}

// Callback for tooltip title label
function history_titleParseCallback(context) {
  if (context) {
    if (context.length > 0) {
      let title = context[0].label;
      if (title) {
        title = getReadableDate_en(new Date(title), localCC2 === "us");
      }
      return title;
    }
  }
  return;
}

// Changing chart aspect ratio from 16:9 to 4:3 when on a small device.
function resizeChartOnResize(ev, outerWidth = 0) {
  // outerWidth is used when ev = null
  var t = ev ? ev.currentTarget : null;
  var tw;
  var use34ratio = false;

  tw = document.body.clientWidth;
  if (!tw) {
    if (t) {
      tw = t.outerWidth;
    } else {
      tw = ev.outerWidth;
    }
  }

  if (tw <= 992) {
    console.log("using 3:4");
    use34ratio = true;
  }

  var chartWrappers = document.querySelectorAll(".chart-data");

  chartWrappers.forEach((ele) => {
    if (use34ratio) {
      history_covidCasesChart.options.aspectRatio = 3 / 4;
      history_covidDeathsChart.options.aspectRatio = 3 / 4;
      if (ele.classList.contains("web-h-ratio-16-9"))
        ele.classList.remove("web-h-ratio-16-9");
      if (!ele.classList.contains("web-h-ratio-3-4"))
        ele.classList.add("web-h-ratio-3-4");
    } else {
      history_covidCasesChart.options.aspectRatio = 16 / 9;
      history_covidDeathsChart.options.aspectRatio = 16 / 9;
      if (ele.classList.contains("web-h-ratio-3-4"))
        ele.classList.remove("web-h-ratio-3-4");
      if (!ele.classList.contains("web-h-ratio-16-9"))
        ele.classList.add("web-h-ratio-16-9");
    }
  });
}

function toggleCovidCasesDaily(forceOn = false) {
  if (history_covidCasesDiffed && !forceOn) {
    console.log("Toggled Off");
    var historyKeys_cases = Object.keys(history_covidCases);

    // Restore data
    updateHistoryChartData(history_covidCasesChart, historyKeys_cases, {
      datalist: {
        ["Total Cases"]: historyKeys_cases.map((k) => history_covidCases[k]),
      },
      dataOnly: true,
      skips: 1,
    });
  } else {
    console.log("Toggled On");
    applyDataDiffOnHistoricalChart(history_covidCasesChart, {
      newLabels: ["New Cases"],
      fullDataArray: [Object.values(history_covidCases)],
    });
  }
  if (!forceOn) history_covidCasesDiffed = !history_covidCasesDiffed;
  else history_covidCasesDiffed = true;
}

function toggleCovidDeathsDaily(forceOn = false) {
  if (history_covidDeathsDiffed && !forceOn) {
    console.log("Toggled Off");
    var historyKeys_deaths = Object.keys(history_covidDeaths);

    updateHistoryChartData(history_covidDeathsChart, historyKeys_deaths, {
      datalist: {
        ["Total Deaths"]: historyKeys_deaths.map((k) => history_covidDeaths[k]),
      },
      dataOnly: true,
      skips: 1,
    });
  } else {
    console.log("Toggled On (deaths)");
    applyDataDiffOnHistoricalChart(history_covidDeathsChart, {
      newLabels: ["New Deaths"],
      fullDataArray: [Object.values(history_covidDeaths)],
    });
  }
  if (!forceOn) history_covidDeathsDiffed = !history_covidDeathsDiffed;
  else history_covidDeathsDiffed = true;
}

function selectAnotherCountryInSelector(countryCode) {
  if (countryCode in history_countrySelector) {
    Object.keys(history_countrySelector).forEach((k) => {
      history_countrySelector[k] = false;
      if (k === countryCode) {
        history_countrySelector[k] = true;
      }
    });
  }
}

function isCountrySelectedInSelector(countryCode) {
  if (countryCode in history_countrySelector) {
    return history_countrySelector[countryCode];
  }
  return false;
}

// countrySelectors: { countryCode = selected } (can be null, it will use history_countrySelector variable), period = [startInUnixTime, endInUnixTime] or [lastDays] (can be null), updateOnly = '' or 'cases' or 'deaths'
// Use this for future update attemps, if you intend to update the UI as well!
async function updateHistoryStatsFrom(
  { countrySelectors = null, period = null },
  {
    updateOnly = "",
    forceFail = false,
    forceFailMessage = "No data.",
    showDifference = false,
  } = {}
) {
  let loadNewData = true;

  // Firstly, we have to put on a loading overlay as well as disabling some buttons to prevent misclicks.
  var restoreLoadingCallback = (success, err = "") => {
    console.log("updateHistoryStatsFrom(): Callback called from both");

    //let historyTime_casesEle = document.getElementById("history-time-cases-options");
    let historyOverlay_casesEle = document.getElementById(
      "history-cases-overlay"
    );
    //let historyTime_deathsEle = document.getElementById("history-time-deaths-options");
    let historyOverlay_deathsEle = document.getElementById(
      "history-deaths-overlay"
    );

    if (historyTime_casesEle.classList.contains("web-disable-capture")) {
      historyTime_casesEle.classList.remove("web-disable-capture");
    }

    if (historyTime_deathsEle.classList.contains("web-disable-capture")) {
      historyTime_deathsEle.classList.remove("web-disable-capture");
    }

    if (!success) {
      historyOverlay_casesEle.querySelector(
        ".chart-status"
      ).innerHTML = `<span class="d-table-cell web-valign-middle">${err}</span>`;
      historyOverlay_deathsEle.querySelector(
        ".chart-status"
      ).innerHTML = `<span class="d-table-cell web-valign-middle">${err}</span>`;
    } else {
      if (!historyOverlay_casesEle.classList.contains("web-disable-capture")) {
        historyOverlay_casesEle.classList.add("web-disable-capture");
      }
      if (!historyOverlay_casesEle.classList.contains("web-hidden")) {
        historyOverlay_casesEle.classList.add("web-hidden");
      }

      if (!historyOverlay_deathsEle.classList.contains("web-disable-capture")) {
        historyOverlay_deathsEle.classList.add("web-disable-capture");
      }
      if (!historyOverlay_deathsEle.classList.contains("web-hidden")) {
        historyOverlay_deathsEle.classList.add("web-hidden");
      }
    }
  };

  const restoreLoadingCallback_cases = (success, err = "") => {
    console.log("updateHistoryStatsFrom(): Callback called from ONLY cases");
    //let historyTime_casesEle = document.getElementById("history-time-cases-options");
    let historyOverlay_casesEle = document.getElementById(
      "history-cases-overlay"
    );

    if (historyTime_casesEle.classList.contains("web-disable-capture")) {
      historyTime_casesEle.classList.remove("web-disable-capture");
    }

    if (!success) {
      historyOverlay_casesEle.querySelector(
        ".chart-status"
      ).innerHTML = `<span class="d-table-cell web-valign-middle">${err}</span>`;
    } else {
      if (!historyOverlay_casesEle.classList.contains("web-disable-capture")) {
        historyOverlay_casesEle.classList.add("web-disable-capture");
      }
      if (!historyOverlay_casesEle.classList.contains("web-hidden")) {
        historyOverlay_casesEle.classList.add("web-hidden");
      }
    }
  };

  const restoreLoadingCallback_deaths = (success, err = "") => {
    console.log("updateHistoryStatsFrom(): Callback called from ONLY deaths");
    //let historyTime_deathsEle = document.getElementById("history-time-deaths-options");
    let historyOverlay_deathsEle = document.getElementById(
      "history-deaths-overlay"
    );

    if (historyTime_deathsEle.classList.contains("web-disable-capture")) {
      historyTime_deathsEle.classList.remove("web-disable-capture");
    }

    if (!success) {
      historyOverlay_deathsEle.querySelector(
        ".chart-status"
      ).innerHTML = `<span class="d-table-cell web-valign-middle">${err}</span>`;
    } else {
      if (!historyOverlay_deathsEle.classList.contains("web-disable-capture")) {
        historyOverlay_deathsEle.classList.add("web-disable-capture");
      }
      if (!historyOverlay_deathsEle.classList.contains("web-hidden")) {
        historyOverlay_deathsEle.classList.add("web-hidden");
      }
    }
  };

  if ((updateOnly.length > 0 && updateOnly === "cases") || updateOnly === "") {
    //let historyTime_casesEle = document.getElementById("history-time-cases-options");
    let historyOverlay_casesEle = document.getElementById(
      "history-cases-overlay"
    );

    historyOverlay_casesEle.querySelector(
      ".chart-status"
    ).innerHTML = `<span class="d-table-cell web-valign-middle">Loading...</span>`;

    if (!historyTime_casesEle.classList.contains("web-disable-capture")) {
      historyTime_casesEle.classList.add("web-disable-capture");
    }

    if (historyOverlay_casesEle.classList.contains("web-disable-capture")) {
      historyOverlay_casesEle.classList.remove("web-disable-capture");
    }
    if (historyOverlay_casesEle.classList.contains("web-hidden")) {
      historyOverlay_casesEle.classList.remove("web-hidden");
    }

    if (updateOnly !== "") {
      restoreLoadingCallback = restoreLoadingCallback_cases;
    }
  }
  if ((updateOnly.length > 0 && updateOnly === "deaths") || updateOnly === "") {
    //let historyTime_deathsEle = document.getElementById("history-time-deaths-options");
    let historyOverlay_deathsEle = document.getElementById(
      "history-deaths-overlay"
    );

    historyOverlay_deathsEle.querySelector(
      ".chart-status"
    ).innerHTML = `<span class="d-table-cell web-valign-middle">Loading...</span>`;

    if (!historyTime_deathsEle.classList.contains("web-disable-capture")) {
      historyTime_deathsEle.classList.add("web-disable-capture");
    }

    if (historyOverlay_deathsEle.classList.contains("web-disable-capture")) {
      historyOverlay_deathsEle.classList.remove("web-disable-capture");
    }
    if (historyOverlay_deathsEle.classList.contains("web-hidden")) {
      historyOverlay_deathsEle.classList.remove("web-hidden");
    }

    if (updateOnly !== "") {
      restoreLoadingCallback = restoreLoadingCallback_deaths;
    }
  }

  /*
    period is specified:
        Updates both charts with the same period, unless updateOnly is specified. This will also change history_currentlySelectedPeriod.
    period is unspecified:
        Use history_currentlySelectedPeriod to update both charts or depending on updateOnly if it's specified. This uses twice the amount of API calls, so it's recommended to set loadNewData to false when necessary.
    */
  let lastDays;
  let dateRange;

  if (period) {
    if (period.length === 1) {
      lastDays = period[0];
    } else if (period.length > 1) {
      dateRange = period;
    }
  }

  let chosenCountry = "";
  if (countrySelectors) {
    // Behavior: resets history-country-options elements and get chosen country

    // If key = '', it's worldwide
    let newOptionsContext = "";
    await Promise.all(
      Object.keys(countrySelectors).map(async (countryCode) => {
        if (countryCode in countrySelectors && countrySelectors[countryCode]) {
          if (countryCode === "") {
            // Worldwide = override
            chosenCountry = countryCode;
          } else {
            if (chosenCountry.length <= 0) chosenCountry = countryCode;
          }
        }

        var countryName = "Unknown";
        console.log(`EXAMINING CC2: ${countryCode}`);
        if (countryCode !== "") {
          var countryInfo;
          try {
            countryInfo = await fetchTimeout(
              endpointSpecificCountry +
                countryCode +
                endpointSpecificCountry_suffix,
              {
                timeout: loadingTimeout,
              }
            ).then((res) => res.json());
          } catch (err) {
            console.log("Failed to load country for history chart");
          }

          if (countryInfo && "name" in countryInfo) {
            countryName = countryInfo.name.common
              ? countryInfo.name.common
              : "Unknown";
          }

          console.log(
            `Received name (${countryName}) from country info: ${countryInfo}`
          );
        } else {
          countryName = "Worldwide";
        }

        newOptionsContext += `<button class="web-option-switch${
          chosenCountry === countryCode ? " web-option-switch-enabled" : ""
        } web-option-switch-fancy lead" data-option-group="history-country" data-id="${countryCode}"><span>${countryName}</span></button>`;
        console.log(newOptionsContext);
      })
    );
    history_countrySelector = countrySelectors;
    if (newOptionsContext.length === 0) {
      newOptionsContext =
        '<button class="web-option-switch web-option-switch-enabled web-option-switch-fancy lead" data-option-group="history-country" data-id=""><span>Undefined</span></button>';
    }
    history_countryOptionElement.innerHTML = newOptionsContext;
    console.log("Received and replaced");
    history_countryOptionElement
      .querySelectorAll(".web-option-switch")
      .forEach((ele) => {
        ele.addEventListener("click", (ev) => {
          var dataCountryCode = ele.getAttribute("data-id");
          if (!isCountrySelectedInSelector(dataCountryCode)) {
            selectAnotherCountryInSelector(dataCountryCode);
            queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
              {},
            ]);
          }
        });
      });
  } else {
    // Behavior: get chosen country only
    breakableForEach(Object.keys(history_countrySelector), (countryCode) => {
      if (
        countryCode in history_countrySelector &&
        history_countrySelector[countryCode]
      ) {
        chosenCountry = countryCode;
        return false;
      }
    });
  }

  if (lastDays) {
    if (
      (updateOnly.length > 0 && updateOnly === "cases") ||
      updateOnly === ""
    ) {
      history_currentlySelectedPeriod.cases.isPeriodChosen = false;
      history_currentlySelectedPeriod.cases.lastDays = lastDays;
    }
    if (
      (updateOnly.length > 0 && updateOnly === "deaths") ||
      updateOnly === ""
    ) {
      history_currentlySelectedPeriod.deaths.isPeriodChosen = false;
      history_currentlySelectedPeriod.deaths.lastDays = lastDays;
    }

    await updateHistoryStats(chosenCountry, {
      lastDays: lastDays,
      updateOnly: updateOnly,
      loadNewData: loadNewData,
      forceFail: forceFail,
      forceFailMessage: forceFailMessage,
      showDifference: showDifference,
      onCompleteCallback: restoreLoadingCallback,
    });
  } else if (dateRange) {
    if (
      (updateOnly.length > 0 && updateOnly === "cases") ||
      updateOnly === ""
    ) {
      history_currentlySelectedPeriod.cases.isPeriodChosen = true;
      history_currentlySelectedPeriod.cases.period = dateRange;
    }
    if (
      (updateOnly.length > 0 && updateOnly === "deaths") ||
      updateOnly === ""
    ) {
      history_currentlySelectedPeriod.deaths.isPeriodChosen = true;
      history_currentlySelectedPeriod.deaths.period = dateRange;
    }

    await updateHistoryStats(chosenCountry, {
      customRange: dateRange,
      updateOnly: updateOnly,
      loadNewData: loadNewData,
      forceFail: forceFail,
      forceFailMessage: forceFailMessage,
      showDifference: showDifference,
      onCompleteCallback: restoreLoadingCallback,
    });
  } else {
    if (
      (updateOnly.length > 0 && updateOnly === "cases")
    ) {
      if (history_currentlySelectedPeriod.cases.isPeriodChosen) {
          await updateHistoryStats(chosenCountry, {
            customRange: history_currentlySelectedPeriod.cases.period,
            updateOnly: "cases",
            loadNewData: loadNewData,
            forceFail: forceFail,
            forceFailMessage: forceFailMessage,
            showDifference: showDifference,
            onCompleteCallback: restoreLoadingCallback_cases,
          });
      } else {
          await updateHistoryStats(chosenCountry, {
            lastDays: history_currentlySelectedPeriod.cases.lastDays,
            updateOnly: "cases",
            loadNewData: loadNewData,
            forceFail: forceFail,
            forceFailMessage: forceFailMessage,
            showDifference: showDifference,
            onCompleteCallback: restoreLoadingCallback_cases,
          });
      }
    }

    if (
      (updateOnly.length > 0 && updateOnly === "deaths")
    ) {
      if (history_currentlySelectedPeriod.deaths.isPeriodChosen) {
          await updateHistoryStats(chosenCountry, {
            customRange: history_currentlySelectedPeriod.deaths.period,
            updateOnly: "deaths",
            loadNewData: loadNewData,
            forceFail: forceFail,
            forceFailMessage: forceFailMessage,
            showDifference: showDifference,
            onCompleteCallback: restoreLoadingCallback_deaths,
          });
      } else {
          await updateHistoryStats(chosenCountry, {
            lastDays: history_currentlySelectedPeriod.deaths.lastDays,
            updateOnly: "deaths",
            loadNewData: loadNewData,
            forceFail: forceFail,
            forceFailMessage: forceFailMessage,
            showDifference: showDifference,
            onCompleteCallback: restoreLoadingCallback_deaths,
          });
      }
    }

    if (!(updateOnly.length > 0 && updateOnly === "cases") && !(updateOnly.length > 0 && updateOnly === "deaths")) {
      // Load both.
      let isFirstFetchSuccess = true;
      let firstFetchErrorMsg = forceFailMessage;
      if (history_currentlySelectedPeriod.cases.isPeriodChosen) {
          ({success: isFirstFetchSuccess, error: firstFetchErrorMsg} = await updateHistoryStats(chosenCountry, {
            customRange: history_currentlySelectedPeriod.cases.period,
            updateOnly: "cases",
            updateAllVariablesRegardless: true, // This means it will assign both new Death count and Case count in their respective globals, regardless of updateOnly value. Chart rendering still follows updateOnly rule.
            loadNewData: loadNewData,
            forceFail: forceFail,
            forceFailMessage: forceFailMessage,
            showDifference: showDifference,
            onCompleteCallback: restoreLoadingCallback_cases,
          }));
      } else {
        ({success: isFirstFetchSuccess, error: firstFetchErrorMsg} = await updateHistoryStats(chosenCountry, {
            lastDays: history_currentlySelectedPeriod.cases.lastDays,
            updateOnly: "cases",
            updateAllVariablesRegardless: true,
            loadNewData: loadNewData,
            forceFail: forceFail,
            forceFailMessage: forceFailMessage,
            showDifference: showDifference,
            onCompleteCallback: restoreLoadingCallback_cases,
          }));
      }

      // Unless different periods are selected, since we have both data by now, no new data loading is needed.
      if (
        (
          history_currentlySelectedPeriod.cases.isPeriodChosen === true && history_currentlySelectedPeriod.deaths.isPeriodChosen === true &&
          arrayElementEquals(history_currentlySelectedPeriod.cases.period, history_currentlySelectedPeriod.deaths.period)
        ) ||
        (
          history_currentlySelectedPeriod.cases.isPeriodChosen === history_currentlySelectedPeriod.deaths.isPeriodChosen &&
          history_currentlySelectedPeriod.cases.lastDays === history_currentlySelectedPeriod.deaths.lastDays
        )
        
        ) {
          loadNewData = false;
        } else {
          loadNewData = true;
        }

      if (history_currentlySelectedPeriod.deaths.isPeriodChosen) {
          await updateHistoryStats(chosenCountry, {
            customRange: history_currentlySelectedPeriod.deaths.period,
            updateOnly: "deaths",
            loadNewData: loadNewData,
            forceFail: forceFail || !isFirstFetchSuccess,
            forceFailMessage: !isFirstFetchSuccess ? firstFetchErrorMsg : forceFailMessage,
            showDifference: showDifference,
            onCompleteCallback: restoreLoadingCallback_deaths,
          });
      } else {
          await updateHistoryStats(chosenCountry, {
            lastDays: history_currentlySelectedPeriod.deaths.lastDays,
            updateOnly: "deaths",
            loadNewData: loadNewData,
            forceFail: forceFail || !isFirstFetchSuccess,
            forceFailMessage: !isFirstFetchSuccess ? firstFetchErrorMsg : forceFailMessage,
            showDifference: showDifference,
            onCompleteCallback: restoreLoadingCallback_deaths,
          });
      }
    }
  }
}

async function updateHistoryStats(
  _countryCode = "",
  {
    lastDays = 30,
    customRange = [],
    showDifference = false,
    loadNewData = true,
    forceFail = false,
    updateOnly = "" /* "cases", "deaths" or leave blank for both */,
    updateAllVariablesRegardless = false, /* Somewhat ignore updateOnly condition while assigning variables. Chart updates will still follow updateOnly. */
    forceFailMessage = "No data.",
    onCompleteCallback = (success, error) => {},
  } = {}
) {
  var success = true;
  var errorMessage = "Unable to load historical chart.";

  const defaultRetryTimes = 5;
  const defaultRetryDelay = 100; // ms

  // Let's establish 2 approaches for this:
  /*
      Prioritize custom range. Custom range's elements MUST BE in unix time ticks and SHOULD ONLY HAVE 2 entries.
      If customRange is defined:
          Submit one request with lastDays=1. Then read the first key of "cases" list entry.
          Since there's no way to know when this is last updated (even though it ceased collecting data since Match 10th, 2023), this is one way to do it.
          Now use that to calculate lastDays needed to fit into that date range. Filter it until all data of specified date range is collected. Ignore blank data.
      If lastDays is defined:
          Use the API.
      
      Issue: API server sometimes respond without Access-Control-Allow-Origin header for some reasons?
    */

  if (lastDays <= 0) lastDays = 30;

  // +1 more day so that showDifference can calculate difference between the day before the oldest required date to the oldest required date. (For example, data from feb 23 to feb 26, user wants daily data of feb 23, which requires feb 22 data to calculate. we have no feb 22, hence we have to include it when requesting the data in advance lest that happens)
  // This also means we have to hide the spare entry in order to give some consistency.
  lastDays++;

  // Load worldwide data or single country data
  var endpointCovidHistory =
    _countryCode.length === 0
      ? endpointCovidHistory_global
      : endpointCovidHistory_country + _countryCode;

  console.log(endpointCovidHistory);

  var history_covidData;
  // In this try/catch statement, if error messages has '##' as prefix, it means that error should be put on the webpage for the user to see (without said prefix).
  const allowSendErrorToUser = "##";
  if (!forceFail) {
    if (loadNewData) {
      try {
        if (customRange.length >= 2) {
          console.log("Date range found");
          customRange.sort();

          const start = customRange[0];
          const end = customRange[1];
          if (start === end || start > end) {
            throw `${allowSendErrorToUser}Invalid date range!`;
          }

          var yesterdayData;
          var firstDayTick = 0;

          yesterdayData = await fetchTimeout(
            `${
              endpointCovidHistory + endpointCovidHistory_filter_lastDays
            }${1}`,
            {
              method: "GET",
              mode: "cors",
              headers: {},
              timeout: loadingTimeout,
              retryLimit: defaultRetryTimes,
              retryDelay: defaultRetryDelay,
              breakAt404: true,
            }
          )
            .then((res) => res.json())
            .then((data) => {
              if ("timeline" in data) return data.timeline;
              else return data;
            });

          if (!yesterdayData) throw `Yesterday data fetch failed`;

          if ("cases" in yesterdayData) {
            yesterdayTick = Date.parse(Object.keys(yesterdayData.cases)[0]);
            if (!isNaN(yesterdayTick)) {
              // Use this as a basis for lastDays calculation till value of const start;
              if (yesterdayTick - start <= 0) {
                throw `${allowSendErrorToUser}Sorry, there is no data during this period.`;
              } else {
                lastDays = Math.floor(
                  (yesterdayTick - start) / (1000 * 60 * 60 * 24)
                );
              }
            } else throw "Cannot get unix time of yesterday data";
          } else
            throw `Yesterday data has no 'casses' entry, data might be unclean`;

          // Assuming everything is fine, lastDays must've been calculated.
          var unfilteredData = await fetchTimeout(
            `${
              endpointCovidHistory + endpointCovidHistory_filter_lastDays
            }${lastDays}`,
            {
              method: "GET",
              mode: "cors",
              headers: {},
              timeout: loadingTimeout,
              retryLimit: defaultRetryTimes,
              retryDelay: defaultRetryDelay,
              breakAt404: true,
            }
          )
            .then((res) => res.json())
            .then((data) => {
              if ("timeline" in data) return data.timeline;
              else return data;
            });

          var filteredCases = {};
          var filteredDeaths = {};

          if ("cases" in unfilteredData) {
            var filteredKeys = Object.keys(unfilteredData.cases)
              .filter((k) => k >= start && k <= end)
              .sort();
            filteredKeys.forEach((k) => {
              filteredCases[k] = unfilteredData.cases[k];
            });
            console.log("Cases history filtered");
          }

          if ("deaths" in unfilteredData) {
            var filteredKeys = Object.keys(unfilteredData.deaths)
              .filter((k) => k >= start && k <= end)
              .sort();
            filteredKeys.forEach((k) => {
              filteredCases[k] = unfilteredData.deaths[k];
            });
            console.log("Deaths history filtered");
          }

          history_covidData = {
            cases: filteredCases,
            deaths: filteredDeaths,
          };
        } else {
          history_covidData = await fetchTimeout(
            `${
              endpointCovidHistory + endpointCovidHistory_filter_lastDays
            }${lastDays}`,
            {
              method: "GET",
              mode: "cors",
              headers: {},
              timeout: loadingTimeout,
              retryLimit: defaultRetryTimes,
              retryDelay: defaultRetryDelay,
              breakAt404: true,
            }
          )
            .then((res) => res.json())
            .then((data) => {
              if ("timeline" in data) return data.timeline;
              else return data;
            });

          console.log(
            `History stat for "${_countryCode}" during the last ${lastDays} day${
              lastDays > 1 ? "s" : ""
            } loaded.`
          );
        }
      } catch (err) {
        console.log(`Cannot load history stats for "${_countryCode}".`);
        if (err instanceof String || typeof err === "string") {
          if (err.startsWith(allowSendErrorToUser))
            errorMessage = err.substring(allowSendErrorToUser.length - 1);
        }
        history_covidData = null;
      }
    } else {
      console.log(
        "Requested to not load new history data to reduce API calls."
      );
      if (history_covidCases && history_covidDeaths) {
        history_covidData = {
          cases: history_covidCases,
          deaths: history_covidDeaths,
        };
      }
    }
  } else {
    console.log(
      `force fail loading history stats requested for "${_countryCode}".`
    );
    errorMessage = forceFailMessage;
    history_covidData = null;
  }

  if (history_covidData) {
    // Update both variables regardless of updateOnly condition.
    if (updateAllVariablesRegardless) {
      history_covidCases = history_covidData.cases;
      history_covidDeaths = history_covidData.deaths;
    }

    // Split to two types: cases, death. Sadly, this API does not provide accurate stats of Recovered patients.
    if (
      (updateOnly.length > 0 && updateOnly === "cases") ||
      updateOnly === ""
    ) {
      if ("cases" in history_covidData) {
        history_covidCases = history_covidData.cases;
        var historyKeys = Object.keys(history_covidCases);
        updateHistoryChartData(history_covidCasesChart, historyKeys, {
          dataLabel: "Total Cases",
          data: historyKeys.map((k) => history_covidCases[k]),
          skips: 1,
          dataOnly: true,
        });
        if (
          (showDifference && !history_covidCasesDiffed) ||
          history_covidCasesDiffed
        ) {
          toggleCovidCasesDaily(true);
        }
        console.log("Historical chart data for cases updated");
      }
    }

    if (
      (updateOnly.length > 0 && updateOnly === "deaths") ||
      updateOnly === ""
    ) {
      if ("deaths" in history_covidData) {
        history_covidDeaths = history_covidData.deaths;
        var historyKeys = Object.keys(history_covidDeaths);
        updateHistoryChartData(history_covidDeathsChart, historyKeys, {
          dataLabel: "Total Deaths",
          data: historyKeys.map((k) => history_covidDeaths[k]),
          skips: 1,
          dataOnly: true,
        });
        if (
          (showDifference && !history_covidDeathsDiffed) ||
          history_covidDeathsDiffed
        ) {
          toggleCovidDeathsDaily(true);
        }
        console.log("Historical chart data for deaths updated");
      }
    }
    console.log("Historical chart data assigned: " + history_covidData);
  } else {
    // Discard all the data in the chart and tell the user that it cannot find it.
    success = false;

    if (
      (updateOnly.length > 0 && updateOnly === "cases") ||
      updateOnly === ""
    ) {
      history_covidCases = {}
      updateHistoryChartData(history_covidCasesChart, "", {
        dataLabel: "Total Cases",
        data: [],
        dataOnly: true,
      });
      if (
        (showDifference && !history_covidCasesDiffed) ||
        history_covidCasesDiffed
      ) {
        toggleCovidCasesDaily(true);
      }
    }

    if (
      (updateOnly.length > 0 && updateOnly === "deaths") ||
      updateOnly === ""
    ) {
      history_covidDeaths = {}
      updateHistoryChartData(history_covidDeathsChart, historyKeys, {
        dataLabel: "Total Deaths",
        data: [],
        dataOnly: true,
      });
      if (
        (showDifference && !history_covidDeathsDiffed) ||
        history_covidDeathsDiffed
      ) {
        toggleCovidDeathsDaily(true);
      }
    }

    console.log("Historical chart data is reset to blank");
  }

  // Aftermath
  onCompleteCallback(success, errorMessage);
  return { success: success, error: errorMessage };
}

function updateHistoryChartData(
  chartObject,
  labels, // Array "the horizontal axis one" |-----feb 2------feb 3-------feb 4------>
  {
    // Data plate
    data, // Data to provide
    datalist, // Datalist to provide. Should come with labels as keys. !This will overwrite existing entries! Will ignore use of dataLabel, data and datasets.
    dataOnly = false, // ONLY apply data and nothing else. This should hopefully keep the style and behavior of existing vistuals. Will ignore use of: (if data is defined, ignore datasets, bgColor and hoverBgColor) or (if datalist is defined, ignore dataLabel, datasets, bgColor and hoverBgColor).
    dataLabel, // Label for data. datalist and datasets don't use this.
    datasets, // Apply dataset. ignores other variables.

    // Artistry (if dataOnly allows it)
    bgColor = "#fafafa",
    hoverBgColor = "#ffffff",
    borderWidth = 1,
    pointBorderWidth = 0,
    fill = true,

    skips = 0, // Skip initial counts of data (not to be confused with datasets and datalist). Works on 'labels' argument (the horizontal axis one, not the data label) as well, so please provide all of it. Works only for data and datalist.
  } = {}
) {
  var skipsteps = skips;
  while (skipsteps > 0) {
    labels.shift();
    skipsteps--;
  }
  chartObject.data.labels = labels;
  if (!datasets) {
    if (data && dataLabel) {
      var subskipsteps = skips;
      while (subskipsteps > 0) {
        data.shift();
        subskipsteps--;
      }

      if (dataOnly) {
        if (chartObject.data.datasets && chartObject.data.datasets.length > 0) {
          chartObject.data.datasets[0]["label"] = dataLabel;
          chartObject.data.datasets[0]["data"] = data;
        } else {
          chartObject.data.datasets = [
            {
              label: dataLabel,
              data: data,
            },
          ];
        }
      } else {
        chartObject.data.datasets = [
          {
            label: dataLabel,
            data: data,

            backgroundColor: bgColor,
            borderColor: bgColor,
            hoverBorderColor: hoverBgColor,
            borderWidth: borderWidth,
            pointBackgroundColor: fillString(bgColor, 9, "0"), // This makes label invisible, but I want point to be invisible unless on hover, so this is the solution for that.
            pointHoverBackgroundColor: hoverBgColor,
            pointBorderWidth: pointBorderWidth,
            fill: fill,
          },
        ];
      }
    } else if (datalist) {
      console.log(`Datalist detected: ${chartObject} ${datalist}`);
      const datalistkeys = Object.keys(datalist);
      datalistkeys.forEach((key, i) => {
        const _label = key;
        const _data = datalist[key];

        console.log(`Found: ${_label} = ${_data}`);

        var subskipsteps = skips;
        while (subskipsteps > 0) {
          _data.shift();
          subskipsteps--;
        }

        if (!chartObject.data.datasets) {
          chartObject.data.datasets = [];
        }
        if (dataOnly) {
          console.log("Data only!");
          if (chartObject.data.datasets.length < i) {
            console.log("appending");
            chartObject.data.datasets.push({
              label: _label,
              data: _data,
            });
          } else {
            console.log("overwriting");
            chartObject.data.datasets[i]["label"] = _label;
            chartObject.data.datasets[i]["data"] = _data;
          }
        } else {
          if (chartObject.data.datasets.length < i) {
            chartObject.data.datasets.push({
              label: _label,
              data: _data,

              backgroundColor: bgColor,
              borderColor: bgColor,
              hoverBorderColor: hoverBgColor,
              borderWidth: borderWidth,
              pointBackgroundColor: fillString(bgColor, 9, "0"),
              pointHoverBackgroundColor: hoverBgColor,
              pointBorderWidth: pointBorderWidth,
              fill: fill,
            });
          } else {
            chartObject.data.datasets[i] = {
              label: _label,
              data: _data,

              backgroundColor: bgColor,
              borderColor: bgColor,
              hoverBorderColor: hoverBgColor,
              borderWidth: borderWidth,
              pointBackgroundColor: fillString(bgColor, 9, "0"),
              pointHoverBackgroundColor: hoverBgColor,
              pointBorderWidth: pointBorderWidth,
              fill: fill,
            };
          }
        }
      });
    } else {
      console.warn(
        "History chart data was not provided with enough information! Please include EITHER [data AND dataLabel], OR just [datasets], OR provide a full datalist."
      );
    }
  } else {
    chartObject.data.datasets = datasets;
    if (data || dataLabel || datalist) {
      console.warn(
        "data/dataLabel/datalist found in List input while datasets is used. By default, datasets will be used. Please include those data in datasets!"
      );
    }
    if (dataOnly) {
      console.warn(
        "dataOnly only works on data/datalist while datasets is defined, no effects were made"
      );
    }
  }

  chartObject.update();
}

/*
Applies data displacement on historical chart

newLabels: new labels for dataset
fullDataArray: full data array to calculate statistic displacement. this is ignored if dataToRestore is defined.
dataToRestore: data list to restore. Key is label, value is data.
*/
function applyDataDiffOnHistoricalChart(
  chartObject,
  { newLabels = [], fullDataArray = null }
) {
  var hasFullDataArray = true;
  if (fullDataArray === null) {
    console.warn(
      `Full data list is not provided for enabling data displacement. Using chart's existing data instead. This may be required to calculate the full result and not make the chart look off-putting`
    );
    hasFullDataArray = false;
  }

  chartObject.data.datasets = chartObject.data.datasets.map(
    (dataEntries, i) => {
      console.log(newLabels);
      if (newLabels.length > i) {
        console.log(`Replaced label with: ${newLabels[i]}`);
        dataEntries.label = newLabels[i];
      }

      if (hasFullDataArray) {
        dataEntries.data = fullDataArray[i];
      }

      if (dataEntries.data) {
        var newData = [];
        console.log(`dataEntries.data = ${dataEntries.data}`);
        dataEntries.data.forEach((data, _i) => {
          if (_i > 0) {
            var prevData = dataEntries.data[_i - 1];
            if (
              (typeof prevData === "number" || Number.isFinite(prevData)) &&
              (typeof data === "number" || Number.isFinite(data))
            ) {
              newData.push(data - prevData);
            } else {
              newData.push(null); // At this point, previousData is already provided with data. It's just not a number
            }
          } // Ignore newData creation if previousData is not provided
        });

        dataEntries.data = newData;
      }
      return dataEntries;
    }
  );

  chartObject.update();
}

async function updateLocalData() {
  var localData;
  try {
    localData = await fetchTimeout(endpointLocation, {
      timeout: loadingTimeout,
    }).then((res) => res.json());
  } catch (err) {
    console.log("Unable to get local data.");
  }
  if (localData) {
    var localCountryCode = localData.country.toLowerCase();
    var localCountryData;
    localCC2 = localCountryCode;
    try {
      localCountryData = await fetchTimeout(
        endpointSpecificCountry +
          localCountryCode +
          endpointSpecificCountry_suffix,
        {
          timeout: loadingTimeout,
        }
      ).then((res) => res.json());
    } catch (err) {
      console.log("Unable to get country information.");
      localStatusReport.innerHTML =
        "Unable to get local COVID-19 information. It is recommended to take precautionary steps beforehand.";
    }

    var conductReport = () => {
      // There should be a zero check, though it appears the API does not provide blank data.
      var countryCovidData = getCovidData(
        getCovidIdFromCountryCode(localCountryCode)
      );
      var data_totalCases = getCovidTotalCases(countryCovidData, true);
      var data_totalRecoveries = getCovidTotalRecoveries(
        countryCovidData,
        true
      );
      var data_totalDeaths = getCovidTotalDeaths(countryCovidData, true);
      var data_lastUpdate = getCovidLastUpdate(countryCovidData);
      var data_lastUpdateDate;

      var casesValid = true;
      var recoveriesValid = true;
      var deathsValid = true;
      var lastUpdateValid = true;

      if (!data_totalCases) casesValid = false;
      if (!data_totalRecoveries) recoveriesValid = false;
      if (!data_totalDeaths) deathsValid = false;
      if (!data_lastUpdate) lastUpdateValid = false;
      else if (data_lastUpdate.length <= 0) lastUpdateValid = false;
      else {
        data_lastUpdateDate = new Date(data_lastUpdate);
        if (data_lastUpdateDate) {
          if (isNaN(data_lastUpdateDate)) {
            lastUpdateValid = false;
          }
        } else {
          lastUpdateValid = false;
        }
      }
      console.log("Generating local status report now");
      var statusReport = `${
        casesValid
          ? `There is a total of <span class="web-big-boy">${data_totalCases.toLocaleString()}</span> confirmed case${
              data_totalCases > 1 ? "s" : ""
            } of COVID-19 in ${localCountryData.name.common}.`
          : `There are no concrete data of COVID-19 cases in ${localCountryData.name.common}.`
      }<br><br>${
        lastUpdateValid
          ? `As of ${getReadableDate_en(
              data_lastUpdateDate,
              localCountryCode === "us"
            )} (GMT)`
          : `At some point in time`
      }, <span class="web-big-boy recovered-value">${
        recoveriesValid
          ? data_totalRecoveries.toLocaleString()
          : `an uncertain amount of patients`
      }</span> has recovered, while <span class="web-big-boy deaths-value">${
        deathsValid
          ? `${data_totalDeaths.toLocaleString()}</span>`
          : `an uncertain amount</span> of`
      } death${
        (deathsValid && data_totalDeaths > 1) || !deathsValid ? "s" : ""
      } have been recorded.<br><br>${
        casesValid && recoveriesValid && deathsValid
          ? `<span class="web-big-boy">${(
              data_totalCases -
              (data_totalRecoveries + data_totalDeaths)
            ).toLocaleString()}</span> patient${
              data_totalCases - (data_totalRecoveries + data_totalDeaths) > 1
                ? "s"
                : ""
            } are currently active.`
          : `It is unknown how many active cases there are in ${localCountryData.name.common} ever since last update.`
      }`;
      var statusReportMoreInfo = `<br><br><a class="web-color-light-blue" id="local-more-info" href="#" data-id-code="${localCountryCode}">Click here for more information.</a>`;

      localStatusReport.innerHTML = statusReport + statusReportMoreInfo;

      var localMoreInfo = document.getElementById("local-more-info");
      if (localMoreInfo) {
        var lmi_cca2 = localMoreInfo.getAttribute("data-id-code");
        var cvid;
        var generalizedArea;

        if (lmi_cca2 in countryCodeToCovidIndexes) {
          cvid = countryCodeToCovidIndexes[lmi_cca2];
        } else {
          if (lmi_cca2 in associatedCountries) {
            if (associatedCountries[lmi_cca2] in covidGeneralizedIndexes)
              generalizedArea = associatedCountries[lmi_cca2];
          }
        }

        var cvid = getCovidIdFromCountryCode(lmi_cca2);
        if (generalizedArea) {
          localMoreInfo.addEventListener("click", function () {
            displayData(-1, generalizedArea);
          });
        } else if (cvid) {
          localMoreInfo.addEventListener("click", function () {
            displayData(cvid);
          });
        } else {
          localStatusReport.innerHTML = statusReport;
        }
      }
    };

    if (localCountryData) {
      if (localCountryCode in countryCodeToCovidIndexes) {
        conductReport();
      } else {
        if (localCountryCode in associatedCountries) {
          conductReport();
        } else {
          localStatusReport.innerHTML = `Good news! There are no known cases of COVID-19 in ${localCountryData.name.common}. Although everything may be safe for now, you should always be prepared and take preliminary measures, just in case.`;
        }
      }
    }
  } else {
    localStatusReport.innerHTML =
      "Unable to get local COVID-19 information. It is recommended to take precautionary steps beforehand.";
  }
}

function getCovidData(covidId) {
  return covidData[covidId];
}

function getCovidTotalCases(data, parsed = false) {
  return parsed
    ? parseInt(data["Total Cases_text"].replaceAll(",", ""))
    : data["Total Cases_text"];
}

function getCovidTotalRecoveries(data, parsed = false) {
  return parsed
    ? parseInt(data["Total Recovered_text"].replaceAll(",", ""))
    : data["Total Recovered_text"];
}

function getCovidTotalDeaths(data, parsed = false) {
  return parsed
    ? parseInt(data["Total Deaths_text"].replaceAll(",", ""))
    : data["Total Deaths_text"];
}

function getCovidLastUpdate(data) {
  return data["Last Update"];
}

function getCovidDatabaseLastUpdate() {
  if (covidData) {
    var databaseLastUpdate = covidData[covidData.length - 1];
    if ("Last Update" in databaseLastUpdate)
      return databaseLastUpdate["Last Update"];
  }
  return null;
}

function getCovidIdFromCountryCode(cca2) {
  cca2 = cca2.toLowerCase();
  if (cca2 in countryCodeToCovidIndexes) {
    return countryCodeToCovidIndexes[cca2];
  } else {
    if (cca2 in associatedCountries) {
      if (associatedCountries[cca2] in covidGeneralizedIndexes)
        return covidGeneralizedIndexes[associatedCountries[cca2]];
    }
  }
  return null;
}

async function tryGoTo(url) {
  try {
    await fetchTimeout(url, {
      timeout: 90000,
    }).then((res) => {
      console.log(res.status);
      if (res.status != 200) window.location.href = _404;
    });
  } catch (err) {
    window.location.href = _404;
  }
}

// Events

// The only JQuery usage starts here
const feedbackTitle = feedbackBodyElement.querySelector('.feedback-title');
const feedbackContent = feedbackBodyElement.querySelector('.feedback-contents');
const feedbackEmail = feedbackBodyElement.querySelector('.feedback-your-email');
const feedbackStyleResetOnEvent = function() {
  this.style.cssText = '';
}
const feedbackEmailValidateOnEvent = function() {
  if (this.value.trim().length > 0) {
    if (!validateEmail(this.value)) {
      feedbackEmailNoticeLabel.style.color = '#ff5566';
      feedbackEmailNoticeLabel.textContent = ' - Invalid email address.';
      this.style.borderColor = '#ff5566';
      return;
    }
  }

  feedbackEmailNoticeLabel.textContent = '';
  feedbackStyleResetOnEvent.apply(feedbackEmailNoticeLabel);
  feedbackStyleResetOnEvent.apply(this);
}

var isFeedbackSubmitting = false;

feedbackTitle.addEventListener('focus', feedbackStyleResetOnEvent)
feedbackContent.addEventListener('focus', feedbackStyleResetOnEvent)
feedbackEmail.addEventListener('focus', feedbackStyleResetOnEvent)
feedbackEmail.addEventListener('focusout', feedbackEmailValidateOnEvent)

$(feedbackFormModalId).on('show.bs.modal', () => {
  // Reset field styling
  feedbackTitle.style.cssText = '';
  feedbackContent.style.cssText = '';
  feedbackEmail.style.cssText = '';
  feedbackStatusNoticeLabel.style.cssText = '';
  feedbackStatusNoticeLabel.textContent = '';
  feedbackEmailValidateOnEvent.apply(feedbackEmail);
})

feedbackSubmitButton.addEventListener('click', async (ev) => {
  if (isFeedbackSubmitting) return;
  isFeedbackSubmitting = true;

  feedbackTitle.setAttribute('disabled', '');
  feedbackContent.setAttribute('disabled', '');
  feedbackEmail.setAttribute('disabled', '');
  feedbackSubmitButton.setAttribute('disabled', '');

  feedbackStatusNoticeLabel.style.cssText = '';
  feedbackStatusNoticeLabel.textContent = `Submitting feedback...`;

  const fieldDancerClass = 'web-anim-shakeyshakey';
  const fieldDanceCooldown = 250;

  if (!feedbackTitle || !feedbackContent || !feedbackEmail) {
    $(feedbackFormModalId).one('hidden.bs.modal', function () {
      $(feedbackSuccessModalId).modal('show');
    })
    if (feedbackTitle) feedbackTitle.removeAttribute('disabled');
    if (feedbackContent) feedbackContent.removeAttribute('disabled');
    if (feedbackEmail) feedbackEmail.removeAttribute('disabled');
    feedbackSubmitButton.removeAttribute('disabled');
    feedbackSuccessBody.innerHTML = `<p>Something went wrong. We sincerely apologize for the inconvenience. Please send your feedback here for now: please contact <a class="web-color-light-blue" style="cursor: pointer;" onclick="tryGoTo('./email.html')">2159015@example.com</a>.</p>`
    $(feedbackFormModalId).modal('hide');
    isFeedbackSubmitting = false;
    return;
  }

  let canSubmit = true;

  if (feedbackTitle.value.trim().length <= 0) {
    canSubmit = false;
    feedbackTitle.value = '';
    feedbackTitle.style.borderColor = '#ff5566';
    if (!feedbackTitle.classList.contains(fieldDancerClass)) {
      feedbackTitle.classList.add(fieldDancerClass);
      setTimeout(() => {
        feedbackTitle.classList.remove(fieldDancerClass);
      }, fieldDanceCooldown);
    }
  } else {
    feedbackStyleResetOnEvent.apply(feedbackTitle);
  }

  if (feedbackContent.value.trim().length <= 0) {
    canSubmit = false;
    feedbackContent.value = '';
    feedbackContent.style.borderColor = '#ff5566';
    if (!feedbackContent.classList.contains(fieldDancerClass)) {
      feedbackContent.classList.add(fieldDancerClass);
      setTimeout(() => {
        feedbackContent.classList.remove(fieldDancerClass);
      }, fieldDanceCooldown);
    }
  } else {
    feedbackStyleResetOnEvent.apply(feedbackContent);
  }

  if (feedbackEmail.value.trim().length > 0) {
    if (!validateEmail(feedbackEmail.value)) {
      canSubmit = false;
      feedbackEmail.classList.add(fieldDancerClass);
      setTimeout(() => {
        feedbackEmail.classList.remove(fieldDancerClass);
      }, fieldDanceCooldown);
    }
  }

  let success = true;
  if (canSubmit) {
    // Submit feedback to database
    const feedbackSubmission = {
      email: feedbackEmail.value,
      title: feedbackTitle.value,
      feedback: feedbackContent.value,
    }

    try {
      await fetchTimeout(endpointFeedback_POST, {
        timeout: loadingTimeout,
        acceptOnly200: false,
        retryLimit: 0,
        throwExceptionOnFail: false,
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(feedbackSubmission)
      }).then((res) => {
        if (res.status >= 200 && res.status <= 299) {
          feedbackStatusNoticeLabel.style.color = '#ff5566';
          feedbackStatusNoticeLabel.textContent = `Server Error (${res.status})`;
          success = false;
        }
      })
    } catch(err) {
      feedbackStatusNoticeLabel.style.color = '#ff5566';
      feedbackStatusNoticeLabel.textContent = `Unknown Error: ${err}`;
      success = false;
    }

    if (success) {
      feedbackSuccessBody.innerHTML = `<p>Thank you for your feedback! For additional inquiries, please contact <a class="web-color-light-blue" style="cursor: pointer;" onclick="tryGoTo('./email.html')">2159015@example.com</a>.</p>`
      $(feedbackFormModalId).one('hidden.bs.modal', function () {
        feedbackEmail.value = '';
        feedbackTitle.value = '';
        feedbackContent.value = '';
        $(feedbackSuccessModalId).modal('show');
      })
      $(feedbackFormModalId).modal('hide');
    }
  }

  if (success) {
    feedbackStatusNoticeLabel.style.cssText = '';
    feedbackStatusNoticeLabel.textContent = '';
  }

  feedbackTitle.removeAttribute('disabled');
  feedbackContent.removeAttribute('disabled');
  feedbackEmail.removeAttribute('disabled');
  feedbackSubmitButton.removeAttribute('disabled');

  isFeedbackSubmitting = false;
})
// End of JQuery usage

window.addEventListener("resize", resizeChartOnResize);

document.getElementById("toggle-diff-cases").onclick = function () {
  toggleCovidCasesDaily();
};
document.getElementById("toggle-diff-deaths").onclick = function () {
  toggleCovidDeathsDaily();
};

historyTime_casesEle.addEventListener("click", function (ev) {
  let target = ev.target;
  if (target && target.classList.contains("web-option-switch")) {
    let onlyTarget = "cases";
    switch (target.getAttribute("data-id")) {
      case "weekly":
        if (
          history_currentlySelectedPeriod.cases.lastDays !== 7 ||
          history_currentlySelectedPeriod.cases.isPeriodChosen
        ) {
          queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
            {
              period: [7],
            },
            {
              updateOnly: onlyTarget,
            },
          ]);
        }
        break;
      case "monthly":
        if (
          history_currentlySelectedPeriod.cases.lastDays !== 30 ||
          history_currentlySelectedPeriod.cases.isPeriodChosen
        ) {
          queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
            {
              period: [30],
            },
            {
              updateOnly: onlyTarget,
            },
          ]);
        }
        break;
      case "annually":
        if (
          history_currentlySelectedPeriod.cases.lastDays !== 365 ||
          history_currentlySelectedPeriod.cases.isPeriodChosen
        ) {
          queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
            {
              period: [365],
            },
            {
              updateOnly: onlyTarget,
            },
          ]);
        }
        break;
      case "all-time":
        let daysSinceThen = Math.floor(daysSince(new Date(2020, 1, 1)));
        if (
          history_currentlySelectedPeriod.cases.lastDays !== daysSinceThen ||
          history_currentlySelectedPeriod.cases.isPeriodChosen
        ) {
          queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
            {
              period: [daysSinceThen],
            },
            {
              updateOnly: onlyTarget,
            },
          ]);
        }
        break;
      case "custom":
        console.warn("Feature not yet implemented");
        break;
      default:
        return;
    }
  }
});

historyTime_deathsEle.addEventListener("click", function (ev) {
  let target = ev.target;
  if (target && target.classList.contains("web-option-switch")) {
    let onlyTarget = "deaths";
    switch (target.getAttribute("data-id")) {
      case "weekly":
        if (
          history_currentlySelectedPeriod.deaths.lastDays !== 7 ||
          history_currentlySelectedPeriod.deaths.isPeriodChosen
        ) {
          queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
            {
              period: [7],
            },
            {
              updateOnly: onlyTarget,
            },
          ]);
        }
        break;
      case "monthly":
        if (
          history_currentlySelectedPeriod.deaths.lastDays !== 30 ||
          history_currentlySelectedPeriod.deaths.isPeriodChosen
        ) {
          queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
            {
              period: [30],
            },
            {
              updateOnly: onlyTarget,
            },
          ]);
        }
        break;
      case "annually":
        if (
          history_currentlySelectedPeriod.deaths.lastDays !== 365 ||
          history_currentlySelectedPeriod.deaths.isPeriodChosen
        ) {
          queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
            {
              period: [365],
            },
            {
              updateOnly: onlyTarget,
            },
          ]);
        }
        break;
      case "all-time":
        let daysSinceThen = Math.floor(daysSince(new Date(2020, 1, 1)));
        console.log(`Days since then: ${daysSinceThen}`);
        if (
          history_currentlySelectedPeriod.deaths.lastDays !== daysSinceThen ||
          history_currentlySelectedPeriod.deaths.isPeriodChosen
        ) {
          queueRequest(history_updateChartQueueKey, updateHistoryStatsFrom, [
            {
              period: [daysSinceThen],
            },
            {
              updateOnly: onlyTarget,
            },
          ]);
        }
        break;
      case "custom":
        console.warn("Feature not yet implemented");
        break;
      default:
        return;
    }
  }
});

emailSubscribeButton.addEventListener("click", (ev) => {
  if (emailSubscribeField.value.length === 0) {
    emailSubscribeNotice.innerHTML = " - Required field";
    emailSubscribeNotice.style.color = "#ff0000";
    emailSubscribeNotice.style.fontStyle = "italic";
    emailSubscribeField.style.borderColor = "#ff0000";
  } else if (!validateEmail(emailSubscribeField.value)) {
    emailSubscribeNotice.innerHTML = " - Please enter a valid email address";
    emailSubscribeNotice.style.color = "#ff0000";
    emailSubscribeNotice.style.fontStyle = "italic";
    emailSubscribeField.style.borderColor = "#ff0000";
  } else {
    emailSubscribeNotice.innerHTML = " - Subscribed!";
    emailSubscribeNotice.style.color = "#00ff00";
    emailSubscribeNotice.style.fontStyle = "normal";
    emailSubscribeField.style.borderColor = "#00ff00";
  }
});

function onRegionOptionClick(ev) {
  console.log(`Selected region: ${ev.target.getAttribute("data-id")}`);

  var selectedId = ev.target.getAttribute("data-id");
  var selectedId = parseInt(selectedId);
  if (selectedId < 0) {
    // This is a generalized area name.
    var selectedArea = ev.target.getAttribute("data-id-str");
    displayData(selectedId, selectedArea);
  } else {
    displayData(selectedId);
  }
}
