console.log("🔥 Ahara Mother Extension Loaded");

/* ===============================
   CONFIG
================================ */
const HELPER_URL = "http://localhost:3499/device";
const LICENSE_API =
  "https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLiGLCdPMWo71rKL2u3kLzArMtSxvh3NHPDd92KAvWwykC1PMA5DY-6h1Qy8kNkxbW4xJ4XlW25b9PebWr2HcVVRbhYvQQZcFN16OFWaMjy0nuK2QTDqn_dkH19bR4V_OWcZCWPsGj_AEwlAalGyLgnxahUuq3Rg1y5idPISG8oWeklSqeQQ9Fj5PTadS8zdN5uGC80GEhpD4Nd5XEXOwrr1xWZOeVdY8ZPW5uzjsRPcDSlXqrALG03sN3IvenfpTif7MmV-HEq6GzNbrEGcpvecAKORf1aS4KXOAi1I&lib=MTJhM8Gn2lXueT0KWTQVUJZANKMxfD81f";

const CACHE_VALID_MS = 60 * 60 * 1000;     // 1 hour
const CACHE_INVALID_MS = 2 * 60 * 1000;    // 2 minutes
const GRACE_ALLOW_IF_PREVIOUS_VALID = true;

// show license alert max times per device
const MAX_ALERTS_PER_DEVICE = 2;

let LICENSE_OK = false;
let CURRENT_DEVICE = null;

/* ===============================
   UI: LICENSE BLOCK BOX + RECHECK BUTTON
================================ */
function ensureLicenseBox() {
  let box = document.getElementById("ahara-license-box");
  if (box) return box;

  box = document.createElement("div");
  box.id = "ahara-license-box";
  box.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 999999;
    background: #fff;
    border-left: 4px solid #f44336;
    box-shadow: 0 4px 14px rgba(0,0,0,0.18);
    border-radius: 8px;
    padding: 10px 12px;
    font-family: Arial, sans-serif;
    font-size: 12px;
    max-width: 260px;
    line-height: 1.35;
  `;

  box.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px;">Ahara License</div>
    <div id="ahara-license-msg" style="margin-bottom:8px;color:#333;">Blocked</div>
    <div style="display:flex;gap:8px;">
      <button id="ahara-license-recheck" type="button"
        style="flex:1;background:#2196F3;color:#fff;border:0;border-radius:6px;padding:8px 10px;font-weight:700;cursor:pointer;">
        RECHECK
      </button>
      <button id="ahara-license-close" type="button"
        style="background:#eee;color:#111;border:0;border-radius:6px;padding:8px 10px;font-weight:700;cursor:pointer;">
        X
      </button>
    </div>
    <div id="ahara-license-hint" style="margin-top:8px;color:#666;font-size:11px;"></div>
  `;

  document.body.appendChild(box);

  // Close
  box.querySelector("#ahara-license-close").onclick = () => box.remove();

  // Recheck: clear cache → reverify → run modules if ok
  box.querySelector("#ahara-license-recheck").onclick = async () => {
    setLicenseBoxText("Rechecking license...", "Please wait…", "info");
    await clearLicenseCache();

    // Reset the one-load lock so it re-checks immediately
    LICENSE_OK = false;

    // Try immediately
    await startSystem();
  };

  return box;
}

function setLicenseBoxText(msg, hint = "", type = "error") {
  const box = ensureLicenseBox();
  const msgEl = box.querySelector("#ahara-license-msg");
  const hintEl = box.querySelector("#ahara-license-hint");

  msgEl.textContent = msg;
  hintEl.textContent = hint;

  box.style.borderLeftColor =
    type === "info" ? "#2196F3" :
    type === "warning" ? "#FF9800" :
    "#f44336";
}

async function clearLicenseCache() {
  try {
    await chrome.storage.local.remove(["licenseCache"]);
    console.log("🧹 License cache cleared");
  } catch (e) {
    console.warn("Cache clear failed:", e);
  }
}

/* ===============================
   ALERT LIMIT (max 2 times per device)
================================ */
async function shouldShowAlert(deviceId) {
  try {
    const obj = await chrome.storage.local.get(["licenseAlertState"]);
    const state = obj.licenseAlertState || { deviceId: null, count: 0 };

    // if device changed, reset count
    if (state.deviceId !== deviceId) {
      await chrome.storage.local.set({
        licenseAlertState: { deviceId, count: 0 }
      });
      return true; // allow first alert for new device
    }

    if (state.count >= MAX_ALERTS_PER_DEVICE) return false;

    return true;
  } catch {
    // if storage fails, just allow (fail-open for UX)
    return true;
  }
}

async function markAlertShown(deviceId) {
  try {
    const obj = await chrome.storage.local.get(["licenseAlertState"]);
    const state = obj.licenseAlertState || { deviceId: null, count: 0 };

    if (state.deviceId !== deviceId) {
      await chrome.storage.local.set({
        licenseAlertState: { deviceId, count: 1 }
      });
      return;
    }

    await chrome.storage.local.set({
      licenseAlertState: { deviceId, count: (state.count || 0) + 1 }
    });
  } catch {}
}

/* ===============================
   GET DEVICE ID
================================ */
async function getDeviceId() {
  try {
    const res = await fetch(HELPER_URL, { cache: "no-store" });
    const data = await res.json();

    CURRENT_DEVICE = data.deviceId || null;
    return CURRENT_DEVICE;
  } catch (e) {
    console.warn("❌ Device server not reachable");
    CURRENT_DEVICE = null;
    return null;
  }
}

/* ===============================
   CHECK LICENSE FROM API
   returns: { ok: boolean, reason: string }
================================ */
async function checkLicenseAPI(deviceId) {
  try {
    const res = await fetch(LICENSE_API, { cache: "no-store" });
    const list = await res.json();

    const today = new Date();

    const found = list.find((row) => {
      const exp = new Date(row.expiry);
      return (
        String(row.deviceId) === String(deviceId) &&
        String(row.status).toUpperCase() === "ACTIVE" &&
        exp.toString() !== "Invalid Date" &&
        exp >= today
      );
    });

    return found
      ? { ok: true, reason: "valid(server)" }
      : { ok: false, reason: "expired_or_invalid(server)" };
  } catch (e) {
    console.warn("❌ License API failed", e);
    return { ok: false, reason: "api_fail" };
  }
}

/* ===============================
   LICENSE WITH SMART CACHE + DEVICE CHANGE RECHECK
================================ */
async function verifyLicense() {
  const now = Date.now();
  const deviceId = await getDeviceId();

  if (!deviceId) {
    console.warn("🟠 No deviceId (device unplugged / reconnecting)");
    return { ok: false, reason: "no_device" };
  }

  const cacheObj = await chrome.storage.local.get(["licenseCache"]);
  const cache = cacheObj.licenseCache;

  // If device changed → re-check now
  if (cache && cache.deviceId && cache.deviceId !== deviceId) {
    console.log("🔄 Device changed:", cache.deviceId, "→", deviceId);

    const result = await checkLicenseAPI(deviceId);

    await chrome.storage.local.set({
      licenseCache: { valid: result.ok, deviceId, time: now }
    });

    return result;
  }

  // Same device → use cache if TTL valid
  if (cache && cache.deviceId === deviceId) {
    const ttl = cache.valid ? CACHE_VALID_MS : CACHE_INVALID_MS;

    if (now - cache.time < ttl) {
      console.log("⚡ License from cache:", cache.valid);
      return {
        ok: !!cache.valid,
        reason: cache.valid ? "valid(cache)" : "invalid(cache)"
      };
    }
  }

  // Check server
  console.log("🌐 Checking license from server...");
  const result = await checkLicenseAPI(deviceId);

  // Grace if API failed but we had valid cache for same device
  if (
    result.reason === "api_fail" &&
    GRACE_ALLOW_IF_PREVIOUS_VALID &&
    cache &&
    cache.deviceId === deviceId &&
    cache.valid === true
  ) {
    console.warn("🟠 Server fail → grace allow (previous valid cache)");
    return { ok: true, reason: "grace(previous_valid)" };
  }

  // Save cache
  await chrome.storage.local.set({
    licenseCache: { valid: result.ok, deviceId, time: now }
  });

  return result;
}

/* ===============================
   START SYSTEM (MAIN CONTROLLER)
   (architecture preserved)
================================ */
async function startSystem() {
  // 🔒 License check (only once per load unless user presses RECHECK)
  if (!LICENSE_OK) {
    const r = await verifyLicense();
    LICENSE_OK = r.ok;

    if (!LICENSE_OK) {
      console.warn("❌ LICENSE BLOCKED:", r.reason);

      // Show box always (user can press RECHECK)
      if (r.reason === "no_device") {
        setLicenseBoxText("🔴 NO DEVICE", "Reconnect device → then press RECHECK.", "warning");
      } else if (r.reason === "api_fail") {
        setLicenseBoxText("🔴 HELPER/NET ISSUE", "Check internet / License API / then press RECHECK.", "warning");
      } else {
        setLicenseBoxText("❌ LICENSE EXPIRED/INVALID", "If renewed, press RECHECK.", "error");
      }

      // Alert only max 2 times per deviceId (until device changes)
      const devId = CURRENT_DEVICE || "NONE";
      const allow = await shouldShowAlert(devId);
      if (allow) {
        await markAlertShown(devId);

        if (r.reason === "no_device") {
          alert("⚠️ Device not detected. Reconnect device and press RECHECK.");
        } else if (r.reason === "api_fail") {
          alert("⚠️ License server not reachable. Press RECHECK once internet is OK.");
        } else {
          alert("❌ License expired / invalid device. Press RECHECK after renewal.");
        }
      }

      return;
    }
  }

  // If license becomes OK, remove license box if it exists
  document.getElementById("ahara-license-box")?.remove();

  console.log("✅ License Verified → Running Modules");

  // 🚀 RUN MODULES (SAFE CALL)
  window.runLogin?.();
  window.runMainMenu?.();
  window.runIssue?.();
}

/* ===============================
   AUTO START (FAST + SAFE)
================================ */
startSystem();
setTimeout(startSystem, 1200);
