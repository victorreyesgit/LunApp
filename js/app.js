/**
 * app.js
 * ---------------------------------------------------------------------------
 * Wires the DOM to the astronomy module. This is the only file that
 * touches `document`, `navigator`, or `localStorage`. Nothing here does
 * network I/O of any kind — geolocation stays on the device, and the
 * optional cached coordinates live only in the browser's own
 * localStorage (never sent anywhere).
 */

import {
  moonPhase,
  riseSetForDay,
  findNextRiseSet,
  nextNewMoon,
  nextFullMoon,
} from "./astro.js";
import { createMoonRenderer } from "./moonView.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const el = (id) => document.getElementById(id);

const locationStatus = el("location-status");
const changeLocationBtn = el("change-location-btn");
const locationForm = el("location-form");
const latInput = el("lat-input");
const lonInput = el("lon-input");
const locationSaveBtn = el("location-save-btn");
const locationCancelBtn = el("location-cancel-btn");
const locationDeniedNote = el("location-denied-note");

const phaseNameEl = el("phase-name");
const illuminationEl = el("illumination-value");
const ageEl = el("moon-age");
const trendEl = el("moon-trend");

const todayRiseEl = el("today-rise");
const todaySetEl = el("today-set");
const nextRiseEl = el("next-rise");
const nextSetEl = el("next-set");
const nextNewMoonEl = el("next-new-moon");
const nextFullMoonEl = el("next-full-moon");
const locationDependentNote = el("location-dependent-note");

const slider = el("date-slider");
const sliderDateLabel = el("slider-date-label");
const jumpToNowBtn = el("jump-to-now");

const clipCircle = el("lit-clip-circle");
const renderMoon = createMoonRenderer(clipCircle, 80, 100);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Reference "now", captured once so the slider has a stable center. */
let referenceNow = new Date();

/** Observer location, once known. Never sent anywhere. */
let location = null; // { lat, lon }

const STORAGE_KEY = "moon-site-location-v1";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateOnlyFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function fmtTime(date) {
  return date ? timeFormatter.format(date) : "—";
}

function fmtDateTime(date) {
  return date ? dateTimeFormatter.format(date) : "—";
}

// ---------------------------------------------------------------------------
// Location acquisition
// ---------------------------------------------------------------------------

function loadCachedLocation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
      return parsed;
    }
  } catch (_) {
    /* ignore malformed/blocked storage */
  }
  return null;
}

function cacheLocation(loc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } catch (_) {
    /* private browsing / storage disabled — fine, just don't persist */
  }
}

function setLocation(loc, sourceLabel) {
  location = loc;
  cacheLocation(loc);
  locationStatus.textContent = `${sourceLabel} — ${loc.lat.toFixed(
    2
  )}°, ${loc.lon.toFixed(2)}°`;
  locationForm.hidden = true;
  locationDependentNote.hidden = true;
  updateAll();
}

function requestGeolocation() {
  const cached = loadCachedLocation();
  if (cached) {
    // Show something immediately; a fresh geolocation fix (if granted)
    // will override it a moment later.
    location = cached;
    locationStatus.textContent = `Last known location — ${cached.lat.toFixed(
      2
    )}°, ${cached.lon.toFixed(2)}°`;
    locationDependentNote.hidden = true;
    updateAll();
  } else {
    locationStatus.textContent = "Finding your location…";
  }

  if (!("geolocation" in navigator)) {
    locationStatus.textContent = cached
      ? locationStatus.textContent
      : "Geolocation isn't available in this browser.";
    if (!cached) locationForm.hidden = false;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setLocation(
        { lat: pos.coords.latitude, lon: pos.coords.longitude },
        "Your location"
      );
    },
    () => {
      if (!cached) {
        locationStatus.textContent = "Location unavailable.";
        locationDeniedNote.hidden = false;
        locationForm.hidden = false;
      }
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
  );
}

changeLocationBtn.addEventListener("click", () => {
  if (location) {
    latInput.value = location.lat.toFixed(4);
    lonInput.value = location.lon.toFixed(4);
  }
  locationForm.hidden = !locationForm.hidden;
});

locationCancelBtn.addEventListener("click", () => {
  locationForm.hidden = true;
});

locationSaveBtn.addEventListener("click", () => {
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);
  if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    locationStatus.textContent = "Enter a valid latitude (-90…90) and longitude (-180…180).";
    return;
  }
  setLocation({ lat, lon }, "Manual location");
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function tzOffsetMinutes(date) {
  // Minutes to ADD to UTC to get local time (browser's system timezone,
  // DST-aware for the given instant).
  return -date.getTimezoneOffset();
}

function updatePhasePanel(date) {
  const phase = moonPhase(date);
  phaseNameEl.textContent = phase.phaseName;
  illuminationEl.textContent = `${Math.round(phase.illumination * 100)}%`;
  ageEl.textContent = `${phase.ageDays.toFixed(1)} days`;
  trendEl.textContent = phase.waxing ? "Waxing" : "Waning";
  renderMoon(phase.elongationDeg);
}

function updateLocationDependentPanel(date) {
  if (!location) {
    locationDependentNote.hidden = false;
    [todayRiseEl, todaySetEl, nextRiseEl, nextSetEl].forEach((n) => (n.textContent = "—"));
    return;
  }
  locationDependentNote.hidden = true;

  const { lat, lon } = location;

  const today = riseSetForDay(date, lat, lon, tzOffsetMinutes(date));
  todayRiseEl.textContent = fmtTime(today.rise);
  todaySetEl.textContent = fmtTime(today.set);

  const now = referenceNow;
  const nextRise = findNextRiseSet(now, lat, lon, "rise");
  const nextSet = findNextRiseSet(now, lat, lon, "set");
  nextRiseEl.textContent = fmtDateTime(nextRise);
  nextSetEl.textContent = fmtDateTime(nextSet);
}

function updateNextPhasesPanel() {
  nextNewMoonEl.textContent = fmtDateTime(nextNewMoon(referenceNow));
  nextFullMoonEl.textContent = fmtDateTime(nextFullMoon(referenceNow));
}

function selectedDateFromSlider() {
  const hours = parseFloat(slider.value);
  return new Date(referenceNow.getTime() + hours * 3600 * 1000);
}

function updateAll() {
  const selected = selectedDateFromSlider();
  updatePhasePanel(selected);
  updateLocationDependentPanel(selected);
  updateNextPhasesPanel();

  const isNow = Math.abs(parseFloat(slider.value)) < 0.01;
  sliderDateLabel.textContent = isNow
    ? `Now — ${fmtDateTime(selected)}`
    : fmtDateTime(selected);
}

// ---------------------------------------------------------------------------
// Slider wiring
// ---------------------------------------------------------------------------

slider.addEventListener("input", updateAll);

jumpToNowBtn.addEventListener("click", () => {
  referenceNow = new Date();
  slider.value = "0";
  updateAll();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

updateNextPhasesPanel();
updatePhasePanel(referenceNow);
requestGeolocation();
updateAll();
