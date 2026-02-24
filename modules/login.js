window.runLogin = function () {

  console.log("Ahara Auto Bot started");

  /* ===============================
     HARD RESET IF DISCLAIMER PAGE
  ================================ */
  if (window.location.href.includes("admin/Disclaimer.aspx")) {
    console.log("Disclaimer page detected. Resetting bot state.");

    // Remove big captcha if exists
    document.getElementById("bigCaptchaBox")?.remove();

    // Stop further bot execution
    window.__AHARA_BOT_STOPPED__ = true;
  }

  /* ===============================
     LOGIN + CAPTCHA SECTION
  ================================ */
  (function () {
    const NEXT_URL = "admin/bioLogin.aspx";

    document.addEventListener("keydown", function (e) {
      if (!e.altKey || e.repeat) return;

      const pressedKey = e.key.toLowerCase();
      if (!pressedKey.match(/^[a-z]$/)) return;

      chrome.storage.sync.get(["profiles"], function (res) {
        const profiles = res.profiles || {};

        for (const profileName in profiles) {
          if (profiles[profileName].shortcut === pressedKey) {
            chrome.storage.sync.set({ active: profileName }, function () {
              window.location.reload();
            });
            break;
          }
        }
      });
    });

    chrome.storage.sync.get(["profiles", "active"], function (res) {
      const profile = res.profiles && res.profiles[res.active];
      if (!profile) return;

      if (profile.userType === "O") {
        document.getElementById("ctl00_ContentPlaceHolder1_rblSeluser_0")?.click();
      } else if (profile.userType === "A") {
        document.getElementById("ctl00_ContentPlaceHolder1_rblSeluser_1")?.click();
      }

      const mobileInput = document.getElementById("ctl00_ContentPlaceHolder1_txtMobile");
      if (mobileInput) mobileInput.value = profile.mobile;

      const captchaImg = document.getElementById("ctl00_ContentPlaceHolder1_Image2");
      if (captchaImg) {
        showBigCaptcha(captchaImg);
        captchaImg.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      const captchaInput = document.getElementById("ctl00_ContentPlaceHolder1_txt_captcha");
      if (captchaInput) {
        captchaInput.focus();
        captchaInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            setTimeout(checkLoginResult, 3000);
          }
        });
      }
    });

    function showBigCaptcha(img) {
      let box = document.getElementById("bigCaptchaBox");
      if (box) box.remove();

      box = document.createElement("div");
      box.id = "bigCaptchaBox";
      box.style.position = "fixed";
      box.style.top = "50%";
      box.style.left = "50%";
      box.style.transform = "translate(-50%, -50%)";
      box.style.zIndex = "99999";
      box.style.background = "#ffffff";
      box.style.padding = "14px";
      box.style.border = "3px solid #000";
      box.style.borderRadius = "8px";
      box.style.boxShadow = "0 0 25px rgba(0,0,0,0.4)";
      box.style.pointerEvents = "none";

      const bigImg = img.cloneNode(true);
      bigImg.style.width = "300px";

      box.appendChild(bigImg);
      document.body.appendChild(box);
    }

    function checkLoginResult() {
      if (window.location.href.includes(NEXT_URL)) {
        document.getElementById("bigCaptchaBox")?.remove();
      } else {
        document.getElementById("ctl00_ContentPlaceHolder1_txt_captcha")?.focus();
      }
    }
  })();

  /* ===============================
     CONFIG
  ================================ */
  const HELPER_URL = "http://localhost:3499/device";
  const MAX_RETRY = 1; // 🔥 ONLY ONE TRY
  const SUCCESS_WAIT_MS = 2500; // ✅ wait 2.5 sec for success code

  /* ===============================
     GLOBAL GUARD (prevents parallel runs + unlimited capture)
     (kept lightweight, no architecture change)
  ================================ */
  window.__AHARA_LOGIN_GUARD__ = window.__AHARA_LOGIN_GUARD__ || {
    running: false,
    done: false,
    captureClicked: false,
    mode: null
  };

  /* ===============================
     HELPERS
  ================================ */
  function $(id) {
    return document.querySelector(id);
  }

  function click(id, label) {
    const el = $(id);
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.style.outline = "3px solid lime";
    el.click();
    console.log("Clicked:", label);
    return true;
  }

  function waitFor(id, timeout = 6000) {
    return new Promise((resolve, reject) => {
      if ($(id)) return resolve();

      const obs = new MutationObserver(() => {
        if ($(id)) {
          obs.disconnect();
          resolve();
        }
      });

      obs.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        obs.disconnect();
        reject();
      }, timeout);
    });
  }

  function waitForSuccess(getValue, timeout = SUCCESS_WAIT_MS) {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      const timer = setInterval(() => {
        const val = getValue() || "";

        // ✅ SUCCESS DETECT (errCode="0" + success)
        if (val.includes('errCode="0"') && val.toLowerCase().includes("success")) {
          clearInterval(timer);
          resolve(true);
          return;
        }

        if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject(false);
        }
      }, 100);
    });
  }

  async function getMode() {
    try {
      const r = await fetch(HELPER_URL, { cache: "no-store" });
      const j = await r.json();
      return j.selected;
    } catch {
      return null;
    }
  }

  /* ===============================
     BIO FLOW (ONLY 1 TRY + MANUAL AFTER)
  ================================ */
  async function runBIO() {
    console.log("BIO flow start");

    click("#ctl00_ContentPlaceHolder1_rbl_bio_otp_auth_0", "BIO AUTH");
    await waitFor("#ctl00_ContentPlaceHolder1_RadioButtonList1_0");
    click("#ctl00_ContentPlaceHolder1_RadioButtonList1_0", "YES");
    await waitFor("#ctl00_ContentPlaceHolder1_rdbldevice_0");
    click("#ctl00_ContentPlaceHolder1_rdbldevice_0", "BIO MANTRA");
    await waitFor("#ctl00_ContentPlaceHolder1_btnmantra");

    // ✅ CAPTURE ONLY ONCE TOTAL (prevents unlimited capture)
    if (window.__AHARA_LOGIN_GUARD__.captureClicked) {
      console.warn("Capture already clicked once. Manual mode.");
      window.__AHARA_LOGIN_GUARD__.done = true;
      return;
    }
    window.__AHARA_LOGIN_GUARD__.captureClicked = true;

    click("#ctl00_ContentPlaceHolder1_btnmantra", "BIO CAPTURE");

    try {
      await waitForSuccess(() => $("#ctl00_ContentPlaceHolder1_hidBioInfo")?.value);

      await waitFor("#ctl00_ContentPlaceHolder1_btn_verify");
      click("#ctl00_ContentPlaceHolder1_btn_verify", "BIO VERIFY");

      // ✅ STOP EVERYTHING AFTER SUCCESS
      window.__AHARA_LOGIN_GUARD__.done = true;
      window.__AHARA_BOT_STOPPED__ = true;
      console.log("✅ BIO Success + Verify clicked. Bot stopped.");

    } catch {
      console.warn("BIO failed (or timeout). Manual retry allowed.");
      // ✅ After 1 try, stop auto engine (manual only)
      window.__AHARA_LOGIN_GUARD__.done = true;
    }
  }

  /* ===============================
     IRIS FLOW (ONLY 1 TRY + MANUAL AFTER)
  ================================ */
  async function runIRIS() {
    console.log("IRIS flow start");

    click("#ctl00_ContentPlaceHolder1_rbl_bio_otp_auth_1", "IRIS AUTH");
    await waitFor("#ctl00_ContentPlaceHolder1_RadioButtonList1_0");
    click("#ctl00_ContentPlaceHolder1_RadioButtonList1_0", "YES");
    await waitFor("#ctl00_ContentPlaceHolder1_rbl_device_type_2");
    click("#ctl00_ContentPlaceHolder1_rbl_device_type_2", "MANTRA IRIS");
    await waitFor("#ctl00_ContentPlaceHolder1_btnIrisMantra");

    // ✅ CAPTURE ONLY ONCE TOTAL (prevents unlimited capture)
    if (window.__AHARA_LOGIN_GUARD__.captureClicked) {
      console.warn("Capture already clicked once. Manual mode.");
      window.__AHARA_LOGIN_GUARD__.done = true;
      return;
    }
    window.__AHARA_LOGIN_GUARD__.captureClicked = true;

    click("#ctl00_ContentPlaceHolder1_btnIrisMantra", "IRIS CAPTURE");

    try {
      await waitForSuccess(() => $("#ctl00_ContentPlaceHolder1_hidirisInfo")?.value);

      await waitFor("#ctl00_ContentPlaceHolder1_btnIrisVerify");
      click("#ctl00_ContentPlaceHolder1_btnIrisVerify", "IRIS VERIFY");

      // ✅ STOP EVERYTHING AFTER SUCCESS
      window.__AHARA_LOGIN_GUARD__.done = true;
      window.__AHARA_BOT_STOPPED__ = true;
      console.log("✅ IRIS Success + Verify clicked. Bot stopped.");

    } catch {
      console.warn("IRIS failed (or timeout). Manual retry allowed.");
      // ✅ After 1 try, stop auto engine (manual only)
      window.__AHARA_LOGIN_GUARD__.done = true;
    }
  }

  /* ===============================
     START BOT (guarded)
  ================================ */
  async function startBot() {
    if (window.__AHARA_BOT_STOPPED__) return;

    // ✅ prevent parallel runs / re-injections
    if (window.__AHARA_LOGIN_GUARD__.done) return;
    if (window.__AHARA_LOGIN_GUARD__.running) return;

    if (!location.href.includes("bioLogin.aspx")) return;

    const mode = await getMode();
    if (!mode) {
      setTimeout(startBot, 500);
      return;
    }

    window.__AHARA_LOGIN_GUARD__.running = true;
    window.__AHARA_LOGIN_GUARD__.mode = mode;

    try {
      if (mode === "BIO") await runBIO();
      if (mode === "IRIS") await runIRIS();
    } finally {
      // allow no further auto loops
      window.__AHARA_LOGIN_GUARD__.running = false;
    }
  }

  startBot();
};