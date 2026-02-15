///////////////////////////////
// LOGIN PROFILE LOGIC
///////////////////////////////

const profileSelect = document.getElementById("profileSelect");
const mobileInput = document.getElementById("mobile");
const shortcutInput = document.getElementById("shortcut");
const userTypeSelect = document.getElementById("userType");

function loadProfiles() {
  chrome.storage.sync.get(["profiles", "active"], res => {
    const profiles = res.profiles || {};
    profileSelect.innerHTML = "";

    for (const name in profiles) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === res.active) option.selected = true;
      profileSelect.appendChild(option);
    }

    if (res.active && profiles[res.active]) {
      fillForm(profiles[res.active]);
    }
  });
}

function fillForm(profile) {
  mobileInput.value = profile.mobile || "";
  shortcutInput.value = (profile.shortcut || "").toUpperCase();
  userTypeSelect.value = profile.userType || "O";
}

profileSelect.addEventListener("change", () => {
  const selected = profileSelect.value;

  chrome.storage.sync.get(["profiles"], res => {
    const profile = res.profiles[selected];
    if (profile) fillForm(profile);

    chrome.storage.sync.set({ active: selected });
  });
});

document.getElementById("save").addEventListener("click", () => {
  const mobile = mobileInput.value.trim();
  const shortcut = shortcutInput.value.trim().toLowerCase();
  const userType = userTypeSelect.value;

  if (!mobile.match(/^\d{10}$/)) {
    alert("Enter valid mobile");
    return;
  }

  if (!shortcut.match(/^[a-z]$/)) {
    alert("Shortcut must be A-Z");
    return;
  }

  chrome.storage.sync.get(["profiles"], res => {
    const profiles = res.profiles || {};

    profiles[mobile] = { mobile, shortcut, userType };

    chrome.storage.sync.set(
      {
        profiles,
        active: mobile
      },
      () => {
        loadProfiles();
        document.getElementById('status').innerText = "✅ Profile Saved";
      }
    );
  });
});

///////////////////////////////
// START BUTTON
///////////////////////////////

document.getElementById('startBtn').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {

    chrome.tabs.sendMessage(tabs[0].id, {action: 'startFast'});

    document.getElementById('status').innerHTML = '⚡ ULTRA FAST STARTED';

    chrome.storage.local.get('aharaSpeed', r => {
      const speedBox = document.getElementById('status');

      if (!r.aharaSpeed) {
        speedBox.innerText += "\nServer: AUTO";
        return;
      }

      const speed =
        r.aharaSpeed < 1000 ? '🟢 FAST' :
        r.aharaSpeed < 2000 ? '🟡 NORMAL' : '🔴 SLOW';

      speedBox.innerText += `\n${speed}`;
    });

  });
});

///////////////////////////////
// RESET BUTTON
///////////////////////////////

document.getElementById('resetBtn').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {

    chrome.tabs.reload(tabs[0].id);

    document.getElementById('status').innerHTML = '🔄 RESET DONE';

  });
});

///////////////////////////////
// FAST MODE
///////////////////////////////

document.getElementById("fast").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
});

///////////////////////////////
// DEVICE STATUS 🔥 FINAL
///////////////////////////////

let lastStatus = "";

async function loadDeviceStatus() {
  const el = document.getElementById("deviceStatus");
  if (!el) return;

  try {
    const res = await fetch("http://localhost:3499/device");
    const data = await res.json();

    let status = "";

    if (data.selected === "BIO") {
      status = "🟢 BIO";
    } 
    else if (data.selected === "IRIS") {
      status = "🟣 IRIS";
    } 
    else {
      status = "🔴 NO DEVICE";
    }

    // update only if changed (performance boost 🚀)
    if (status !== lastStatus) {
      el.innerText = status;
      lastStatus = status;
    }

  } catch (err) {
    if (lastStatus !== "🔴 HELPER NOT RUNNING") {
      el.innerText = "🔴 HELPER NOT RUNNING";
      lastStatus = "🔴 HELPER NOT RUNNING";
    }
  }
}

// run immediately + refresh
loadDeviceStatus();
setInterval(loadDeviceStatus, 2000);

///////////////////////////////
// INIT
///////////////////////////////

loadProfiles();
