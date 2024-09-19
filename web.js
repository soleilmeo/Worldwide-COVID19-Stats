// Web display assistant.

const scrollToTopButton = document.querySelector(".web-scroll-back-to-top");
const scrollBorderIndicator = document.querySelector(
  ".web-scroll-border-detect"
); // Changes border color when body/html is not on top.
const scrollTopTopAppearAt = 25;

const blockHoverOnClickElement = document.querySelectorAll(
  ".web-block-hover-on-click"
);
const blockHoverClickTargets = document.querySelectorAll(
  ".web-block-hover-on-click .web-block-hover-click-target"
);

const __suppressor = 40;
const __max = 10; //deg
const __lookers = document.querySelectorAll(".__looker");
const __lookers_size = {};

class WebTimer {
  constructor() {
    this.timerStart = 0;
    this.timerStarted = false;
  }

  startTimer() {
    this.timerStart = new Date().getTime();
    this.timerStarted = true;
  }

  get timePassed() {
    if (!this.timerStarted) {
      console.log("WebTimer not started yet");
      return 0;
    }

    var t = new Date().getTime() - this.timerStart;
    if (t < 0) {
      console.log("Hello, fellow time traveler");
    }
    return t;
  }

  stopTimer() {
    this.timerStarted = false;
    this.timerStart = 0;
  }
}

let web_textFluid;
window.addEventListener("load", documentLoaded);
window.onscroll = scrollCheck;
scrollCheck();

fitty(".web-text-fluid", {
  minSize: 12,
  maxSize: 92,
});

fitty(".web-text-fluid-mini", {
  minSize: 8,
  maxSize: 64,
});

fitty(".web-text-fluid-h2-wrap", {
  minSize: 14,
  maxSize: 27,
  alwaysWrap: true,
});

fitty(".web-text-fluid-h4", {
  minSize: 14,
  maxSize: 27,
});

fitty(".web-text-fluid-lead", {
  minSize: 12,
  maxSize: 20,
  alwaysWrap: true,
});

function documentLoaded(ev) {
  console.log("Document loaded, running web.js");
}

// Block hover on click events
// Must use web-block-hover-click-target on targets where user will have to click on in order to dismiss specific content.
const ALLOW_BLOCK_HOVER_AFTER_MOUSEENTER_DURATION = 500; // milliseconds
blockHoverOnClickElement.forEach((ele) => {
  const thisTimer = new WebTimer();
  ele.onmouseenter = function () {
    thisTimer.startTimer();
  };
  ele.onmousemove = function () {
    if (!thisTimer.timerStarted) thisTimer.startTimer();
  };
  ele.addEventListener("focusin", function (ev) {
    if (!thisTimer.timerStarted) thisTimer.startTimer();
  });

  ele.onmouseleave = function () {
    thisTimer.stopTimer();
    ele.classList.remove("web-block-hover");
  };

  ele.addEventListener("click", function (ev) {
    if (thisTimer.timePassed < ALLOW_BLOCK_HOVER_AFTER_MOUSEENTER_DURATION)
      return;

    console.log("Event fired!");
    if (!ev.target) return;

    if (ev.target.classList.contains("web-block-hover-click-target")) {
      if (ele === ev.target || containsElement(ele, ev.target)) {
        if (ele.classList.contains("web-block-hover"))
          ele.classList.remove("web-block-hover");
        else ele.classList.add("web-block-hover");
      }
    }
  });
});

// Scroll to top event
scrollToTopButton.addEventListener("click", function (ev) {
  if (document.body.scrollTop != 0) {
    document.body.animate({ scrollTop: 0 });
  }
  if (document.documentElement.scrollTop != 0) {
    window.scrollTo({ top: 0 });
  }
});

// Is document on top?

function scrollCheck() {
  if (
    document.body.scrollTop > scrollTopTopAppearAt ||
    document.documentElement.scrollTop > scrollTopTopAppearAt
  ) {
    scrollToTopButton.style.cssText = "";
    scrollToTopButton.classList.remove("web-hidden");
    scrollBorderIndicator.style.cssText = "outline-color: #fff !important";
  } else {
    scrollToTopButton.style.cssText = "pointer-events: none;";
    scrollToTopButton.classList.add("web-hidden");
    scrollBorderIndicator.style.cssText = "";
  }
}

// Keeping aspect ratio (for browsers that don't support aspect-ratio yet)
{
  let cssAspectRatioSupport = false;
  try {
    cssAspectRatioSupport = CSS.supports("aspect-ratio", "16 / 9");
  } catch {
    console.log("Browser does not support CSS.supports()");
  }

  if (!cssAspectRatioSupport) {
    console.log("Detected no aspect ratio support. Using JS instead.");
    window.addEventListener("resize", (ev) => {
      // 16:9 calculate height based on width
      let ratio_h_16_9 = document.querySelectorAll(".web-h-ratio-16-9");
      ratio_h_16_9.forEach((ele) => {
        let rect = ele.getBoundingClientRect();
        let rect_width = rect.width;
        ele.style.cssText = `height: ${(rect_width / 16) * 9}px`;
      });

      let ratio_h_4_3 = document.querySelectorAll(".web-h-ratio-4-3");
      ratio_h_4_3.forEach((ele) => {
        let rect = ele.getBoundingClientRect();
        let rect_width = rect.width;
        ele.style.cssText = `height: ${(rect_width / 4) * 3}px`;
      });
    });
  }
}

// Convenient functions

// Give judgement on similarities (without context)
function similar(s1, s2) {
  var longer = s1;
  var shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  var longerLength = longer.length;
  if (longerLength == 0) {
    return 1.0;
  }
  return (
    (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength)
  );
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  var costs = new Array();
  for (var i = 0; i <= s1.length; i++) {
    var lastValue = i;
    for (var j = 0; j <= s2.length; j++) {
      if (i == 0) costs[j] = j;
      else {
        if (j > 0) {
          var newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// Check URL queries
function checkQuery() {
  return new Proxy(new URLSearchParams(window.location.search), {
    get: (search, properties) => search.get(properties),
  });
}

// Read date object and return readable date in DDMMYYYY or MMDDYYYY if isUSA = true. Uses UTC standard, no timezone offsets.
function getReadableDate_en(date, isUSA = false, shortMonth = false) {
  var d = "";
  var day = date.getUTCDate();
  var month = date.getUTCMonth();
  var year = date.getUTCFullYear();

  switch (month) {
    case 0:
    default:
      d = "January";
      break;
    case 1:
      d = "Feburary";
      break;
    case 2:
      d = "March";
      break;
    case 3:
      d = "April";
      break;
    case 4:
      d = "May";
      break;
    case 5:
      d = "June";
      break;
    case 6:
      d = "July";
      break;
    case 7:
      d = "August";
      break;
    case 8:
      d = "September";
      break;
    case 9:
      d = "October";
      break;
    case 10:
      d = "November";
      break;
    case 11:
      d = "December";
      break;
  }

  if (shortMonth) {
    d = d.substring(0, 3);
  }

  if (isUSA) {
    d += ` ${day}, ${year}`;
  } else {
    d = `${day} ${d} ${year}`;
  }
  return d;
}

function shortenNumber(num, useAccurateMetric = false) {
  const shortenUnit = {
    [1000]: "k",
    [1000000]: "M",
    [1000000000]: useAccurateMetric ? "G" : "B",
    [1000000000000]: "T",
  };

  var shuKeys = Object.keys(shortenUnit);
  shuKeys.sort();
  var briefForm = "";

  breakableForEach(shuKeys, (key) => {
    if (num / key >= 1) {
      briefForm = `${(num / key).toLocaleString()}${shortenUnit[key]}`;
    } else {
      return false;
    }
  });

  if (briefForm.length === 0) {
    briefForm = num.toLocaleString();
  }

  return briefForm;
}

function delayAsync(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function breakableForEach(object, callback, scope) {
  var result = undefined;
  if (typeof object.length != "undefined") {
    for (var iterator = 0; iterator < object.length; iterator++) {
      result = callback.call(scope, object[iterator], iterator, object);
      if (result !== undefined) {
        break;
      }
    }
  } else {
    for (var property in object) {
      if (Object.prototype.hasOwnProperty.call(object, property)) {
        result = callback.call(scope, object[property], property, object);
        if (result !== undefined) {
          break;
        }
      }
    }
  }
  return result;
}

function fillString(str, len, filler) {
  if (str.length >= len) return str;
  else {
    var extension = "";
    for (let i = str.length; i < len; i++) {
      extension += filler;
    }
    return str + extension;
  }
}

function getKeysByValue(list, v) {
  return Object.keys(list).filter((k) => list[k] === v);
}

function daysSince(sinceDate) {
  return (new Date().getTime() - sinceDate.getTime()) / 86400000;
}

function containsElement(parent, child) {
  return parent !== child && parent.contains(child);
}

function transformer(x, y, psize, ele) {
  var rect = ele.getBoundingClientRect();
  var xDeg = -(y - rect.y - rect.height / 2) / __suppressor;
  var yDeg = (x - rect.x - rect.width / 2) / __suppressor;

  return (
    "perspective(" +
    psize +
    "px) " +
    "   rotateX(" +
    xDeg +
    "deg) " +
    "   rotateY(" +
    yDeg +
    "deg) "
  );
}

function transformerResetRotation(ele, psize) {
  return (
    "perspective(" +
    psize +
    "px) " +
    "   rotateX(" +
    0 +
    "deg) " +
    "   rotateY(" +
    0 +
    "deg) "
  );
}

function validateEmail(email) {
  if (
    /[a-z0-9!#$%&'*+/=?^_‘{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_‘{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/.test(
      email.toLowerCase()
    )
  ) {
    if (email.replace(" ", "").length < email.length) return false;
    return true;
  }
  return false;
}

function arrayElementEquals(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((v, i) => v === b[i])
  );
}

function transformElement(ele, xyEle) {
  ele.style.transform = transformer.apply(null, xyEle);
}

function transformResetElement(ele, psize) {
  ele.style.transform = transformerResetRotation(ele, psize);
}

__lookers.forEach((__looker) => {
  __lookers_size[__looker] = __looker.getBoundingClientRect();
});

if (__lookers && __lookers.length > 0) {
  window.onmousemove = function (ev) {
    if (__lookers.length > 0) {
      var xy = [ev.clientX, ev.clientY];
      __lookers.forEach((__looker) => {
        var position = xy.concat([
          Math.max(
            __lookers_size[__looker].width,
            __lookers_size[__looker].height
          ),
          __looker,
        ]);
        __looker.classList.add("___notransition");

        window.requestAnimationFrame(() => {
          transformElement(__looker, position);
        });
      });
    }
  };

  window.onmouseout = function (ev) {
    __lookers.forEach((__looker) => {
      window.requestAnimationFrame(() => {
        transformResetElement(
          __looker,
          Math.max(
            __lookers_size[__looker].width,
            __lookers_size[__looker].height
          )
        );
        __looker.classList.remove("___notransition");
      });
    });
  };

  window.onmouseover = function (ev) {
    __lookers.forEach((__looker) => {
      __looker.classList.add("___notransition");
    });
  };

  window.onresize = function (ev) {
    __lookers.forEach((__looker) => {
      __lookers_size[__looker] = __looker.getBoundingClientRect();
    });
  };
}

// .web-option-switch behavior
var webOptionSwitches = document.querySelectorAll(
  ".web-option-switch-container"
);
webOptionSwitches.forEach((ele) => {
  ele.addEventListener("click", (ev) => {
    const clickedEle = ev.target;
    if (clickedEle) {
      if (clickedEle.classList.contains("web-option-switch")) {
        // Option switch detected
        if (!clickedEle.classList.contains("web-option-switch-enabled")) {
          var currentAttr = clickedEle.getAttribute("data-option-group");
          ele
            .querySelectorAll(".web-option-switch.web-option-switch-enabled")
            .forEach((enabledSwitches) => {
              if (
                enabledSwitches.getAttribute("data-option-group") ===
                currentAttr
              ) {
                enabledSwitches.classList.remove("web-option-switch-enabled");
              }
            });
          clickedEle.classList.add("web-option-switch-enabled");
        }
      }
    }
  });
});
