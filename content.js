console.log("🔥 Ahara Mother Extension Loaded");

/* ===============================
   CONFIG
================================ */
const HELPER_URL = "http://localhost:3499/device";
const LICENSE_API = "https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLiGLCdPMWo71rKL2u3kLzArMtSxvh3NHPDd92KAvWwykC1PMA5DY-6h1Qy8kNkxbW4xJ4XlW25b9PebWr2HcVVRbhYvQQZcFN16OFWaMjy0nuK2QTDqn_dkH19bR4V_OWcZCWPsGj_AEwlAalGyLgnxahUuq3Rg1y5idPISG8oWeklSqeQQ9Fj5PTadS8zdN5uGC80GEhpD4Nd5XEXOwrr1xWZOeVdY8ZPW5uzjsRPcDSlXqrALG03sN3IvenfpTif7MmV-HEq6GzNbrEGcpvecAKORf1aS4KXOAi1I&lib=MTJhM8Gn2lXueT0KWTQVUJZANKMxfD81f"; // 🔴 paste your deployed web app URL

const CACHE_TIME = 60 * 60 * 1000; // ✅ 1 hour cache

let LICENSE_OK = false;
let CURRENT_DEVICE = null;

/* ===============================
   GET DEVICE ID
================================ */
async function getDevice() {
  try {
    const res = await fetch(HELPER_URL);
    const data = await res.json();

    CURRENT_DEVICE = data.deviceId;
    return data.deviceId;

  } catch (e) {
    console.warn("❌ Device server not reachable");
    return null;
  }
}

/* ===============================
   CHECK LICENSE FROM API
================================ */
async function checkLicenseAPI(deviceId) {
  try {
    const res = await fetch(LICENSE_API);
    const list = await res.json();

    const today = new Date();

    const found = list.find(row =>
      row.deviceId == deviceId &&
      row.status === "ACTIVE" &&
      new Date(row.expiry) >= today
    );

    return !!found;

  } catch (e) {
    console.warn("❌ License API failed");
    return false;
  }
}

/* ===============================
   LICENSE WITH SMART CACHE
================================ */
async function verifyLicense() {
  const now = Date.now();
  const deviceId = await getDevice();

  if (!deviceId) return false;

  const cache = await chrome.storage.local.get(["licenseCache"]);

  // ✅ USE CACHE (ONLY IF SAME DEVICE)
  if (
    cache.licenseCache &&
    cache.licenseCache.deviceId === deviceId &&
    (now - cache.licenseCache.time < CACHE_TIME)
  ) {
    console.log("⚡ License from cache");
    return cache.licenseCache.valid;
  }

  // 🔄 FETCH FROM GOOGLE SHEET
  console.log("🌐 Checking license from server...");
  const valid = await checkLicenseAPI(deviceId);

  // 💾 SAVE CACHE WITH DEVICE LOCK
  await chrome.storage.local.set({
    licenseCache: {
      valid,
      deviceId,
      time: now
    }
  });

  return valid;
}

/* ===============================
   START SYSTEM (MAIN CONTROLLER)
================================ */
async function startSystem() {

  // 🔒 License check (only once per load)
  if (!LICENSE_OK) {
    LICENSE_OK = await verifyLicense();

    if (!LICENSE_OK) {
      console.warn("❌ LICENSE BLOCKED");
      alert("❌ License expired / invalid device");
      return;
    }
  }

  console.log("✅ License Verified → Running Modules");

  // 🚀 RUN MODULES (SAFE CALL)
  window.runLogin?.();
  window.runMainMenu?.();
  window.runIssue?.();
}

/* ===============================
   AUTO START (FAST + SAFE)
================================ */

// Instant try
startSystem();

// Backup retry (for slow pages)
setTimeout(startSystem, 1200);
