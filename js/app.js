/**
 * app.js
 * ---------------------------------------------------------------------------
 * Wires the DOM to the astronomy module. This is the only file that
 * touches `document`, `navigator`, or `localStorage`. Nothing here does
 * network I/O of any kind — geolocation stays on the device, and the
 * optional cached coordinates live only in the browser's own
 * localStorage (never sent anywhere).
 */

import { moonPhase, findNextRiseSet, nextFullMoon } from "./astro.js";
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

const locationDependentNote = el("location-dependent-note");
const moonOutNote = el("moon-out-note");
const comingUpFirstLabel = el("coming-up-first-label");
const comingUpFirstValue = el("coming-up-first-value");
const comingUpSecondLabel = el("coming-up-second-label");
const comingUpSecondValue = el("coming-up-second-value");
const nextFullMoonDateEl = el("next-full-moon-date");

const slider = el("date-slider");
const sliderDateLabel = el("slider-date-label");
const jumpToNowBtn = el("jump-to-now");

const clipPolygon = el("lit-clip-polygon");
const renderMoon = createMoonRenderer(clipPolygon, 80, 100, 100);

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

function fmtDateTime(date) {
  return date ? dateTimeFormatter.format(date) : "—";
}

/** Time-only if `date` falls on the same local calendar day as `reference`,
 *  otherwise a short "weekday, time" so a next-day event isn't mistaken
 *  for today. */
function fmtUpcoming(date, reference) {
  if (!date) return "—";
  const sameDay = date.toDateString() === reference.toDateString();
  return sameDay ? timeFormatter.format(date) : dateTimeFormatter.format(date);
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

function updatePhasePanel(date) {
  const phase = moonPhase(date);
  phaseNameEl.textContent = phase.phaseName;
  illuminationEl.textContent = `${Math.round(phase.illumination * 100)}%`;
  ageEl.textContent = `${phase.ageDays.toFixed(1)} days`;
  trendEl.textContent = phase.waxing ? "Waxing" : "Waning";
  renderMoon(phase.elongationDeg);
}

/**
 * "Coming up": whichever of the next moonrise/moonset happens sooner is
 * shown first, the other below it. If the moonset is the sooner of the
 * two, the Moon is currently up, so a small note says so.
 */
function updateComingUpPanel() {
  if (!location) {
    locationDependentNote.hidden = false;
    moonOutNote.hidden = true;
    comingUpFirstLabel.textContent = "Moonrise";
    comingUpFirstValue.textContent = "—";
    comingUpSecondLabel.textContent = "Moonset";
    comingUpSecondValue.textContent = "—";
    return;
  }
  locationDependentNote.hidden = true;

  const { lat, lon } = location;
  const now = referenceNow;
  const nextRise = findNextRiseSet(now, lat, lon, "rise");
  const nextSet = findNextRiseSet(now, lat, lon, "set");

  const moonIsUp = Boolean(nextSet) && (!nextRise || nextSet.getTime() < nextRise.getTime());
  moonOutNote.hidden = !moonIsUp;

  const first = moonIsUp
    ? { label: "Moonset", value: nextSet }
    : { label: "Moonrise", value: nextRise };
  const second = moonIsUp
    ? { label: "Moonrise", value: nextRise }
    : { label: "Moonset", value: nextSet };

  comingUpFirstLabel.textContent = first.label;
  comingUpFirstValue.textContent = fmtUpcoming(first.value, now);
  comingUpSecondLabel.textContent = second.label;
  comingUpSecondValue.textContent = fmtUpcoming(second.value, now);
}

function updateNextFullMoon() {
  nextFullMoonDateEl.textContent = fmtDateTime(nextFullMoon(referenceNow));
}

function selectedDateFromSlider() {
  const hours = parseFloat(slider.value);
  return new Date(referenceNow.getTime() + hours * 3600 * 1000);
}

function updateAll() {
  const selected = selectedDateFromSlider();
  updatePhasePanel(selected);
  updateComingUpPanel();
  updateNextFullMoon();

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

updateNextFullMoon();
updatePhasePanel(referenceNow);
requestGeolocation();
updateAll();
