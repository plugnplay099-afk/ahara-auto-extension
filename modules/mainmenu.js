window.runMainMenu = function() {
   




// ================================================
// AHARA AUTO - FINAL VERSION WITH HARD TIMEOUT
// ================================================
console.log('✅ Ahara Auto - Final Version with Timeout Loaded');

// State management
let actionInProgress = false;
let serverSpeed = 'unknown';
let pingTime = 0;
let stopRequested = false;
let automationActive = false;
let currentStep = 0;
let checkInterval = null;
let navigationInitiated = false;
let lastActionTime = 0;
let automationStartTime = 0; // For timeout tracking
let hardTimeoutId = null;    // For the 1-minute hard timeout

// ================================================
// EMERGENCY STOP FUNCTION
// ================================================
function emergencyStop(reason = 'User stopped') {
    console.log(`🛑 ${reason}`);
    
    // Clear hard timeout
    if (hardTimeoutId) {
        clearTimeout(hardTimeoutId);
        hardTimeoutId = null;
    }
    
    stopRequested = true;
    actionInProgress = false;
    automationActive = false;
    currentStep = 0;
    navigationInitiated = false;
    automationStartTime = 0;
    
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    
    updateStatusDisplay();
    updateButtonState();
    
    // Don't show notification for hard timeout (it auto-vanishes)
    if (reason !== '1-minute timeout reached') {
        showNotification(`🛑 ${reason}`, 'warning');
    }
    
    chrome.storage.local.remove(['automationActive']);
}

// Hard timeout function (1 minute)
function hardTimeoutStop() {
    if (!actionInProgress) return;
    
    emergencyStop('1-minute timeout reached');
    
    // Show timeout notification that auto-vanishes
    const timeoutMsg = '⏰ Bot stopped (1-minute timeout)';
    showNotification(timeoutMsg, 'error');
    
    // Log for debugging
    console.log('⏰ 1-minute hard timeout triggered');
}

// Start hard timeout timer
function startHardTimeout() {
    // Clear any existing timeout
    if (hardTimeoutId) {
        clearTimeout(hardTimeoutId);
    }
    
    // Set 1-minute hard timeout (60,000ms)
    hardTimeoutId = setTimeout(() => {
        hardTimeoutStop();
    }, 60 * 1000); // 1 minute
    
    console.log('⏰ Hard timeout set for 1 minute');
}

// Reset hard timeout (call when step completes)
function resetHardTimeout() {
    if (hardTimeoutId) {
        clearTimeout(hardTimeoutId);
    }
    
    // Only restart if automation is still active
    if (actionInProgress) {
        startHardTimeout();
    }
}

// ================================================
// SERVER SPEED DETECTION
// ================================================
function detectServerSpeed() {
    const startTime = performance.now();
    const img = new Image();
    
    img.onload = img.onerror = () => {
        pingTime = performance.now() - startTime;
        
        if (pingTime < 300) serverSpeed = 'fast';
        else if (pingTime < 1200) serverSpeed = 'medium';
        else serverSpeed = 'slow';
        
        updateStatusDisplay();
        console.log(`⚡ Server: ${serverSpeed} (${Math.round(pingTime)}ms)`);
    };
    
    img.src = 'https://ahara.karnataka.gov.in/favicon.ico?v=' + Date.now();
    
    setTimeout(() => {
        if (serverSpeed === 'unknown') {
            serverSpeed = 'medium';
            updateStatusDisplay();
        }
    }, 2000);
}

function getCheckFrequency() {
    switch(serverSpeed) {
        case 'fast': return 150;
        case 'medium': return 250;
        case 'slow': return 350;
        default: return 250;
    }
}

// ================================================
// STATUS DISPLAY (TOP LEFT)
// ================================================
function addStatusDisplay() {
    if (document.getElementById('ahara-status')) return;
    
    const statusDiv = document.createElement('div');
    statusDiv.id = 'ahara-status';
    statusDiv.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 9998;
        min-width: 200px;
        border-left: 4px solid #4CAF50;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    
    statusDiv.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 3px; color: #4CAF50">Ahara Auto</div>
        <div>Status: <span id="ahara-status-text">Ready</span></div>
        <div>Step: <span id="ahara-step">0</span>/5</div>
        <div>Server: <span id="ahara-server-status">Detecting...</span></div>
        <div>Timer: <span id="ahara-timer">00:00</span></div>
    `;
    
    
    updateStatusDisplay();
}

function updateStatusDisplay() {
    const statusDiv = document.getElementById('ahara-status');
    if (!statusDiv) return;
    
    const elements = {
        status: document.getElementById('ahara-status-text'),
        step: document.getElementById('ahara-step'),
        server: document.getElementById('ahara-server-status'),
        timer: document.getElementById('ahara-timer')
    };
    
    if (elements.status) {
        elements.status.textContent = navigationInitiated ? 'NAVIGATING' : 
                                    actionInProgress ? 'RUNNING' : 'READY';
        elements.status.style.color = navigationInitiated ? '#FF9800' : 
                                    actionInProgress ? '#4CAF50' : '#FF9800';
    }
    
    if (elements.step) {
        elements.step.textContent = currentStep;
        elements.step.style.color = '#2196F3';
        elements.step.style.fontWeight = 'bold';
    }
    
    if (elements.server && serverSpeed !== 'unknown') {
        elements.server.textContent = serverSpeed.toUpperCase();
        elements.server.style.color = 
            serverSpeed === 'fast' ? '#4CAF50' : 
            serverSpeed === 'medium' ? '#FF9800' : '#F44336';
    }
    
    // Update timer display
    if (elements.timer && automationStartTime > 0 && actionInProgress) {
        const elapsed = Math.floor((Date.now() - automationStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        elements.timer.textContent = `${minutes}:${seconds}`;
        
        // Change color as time passes
        if (elapsed > 50) { // 50 seconds
            elements.timer.style.color = '#FF9800'; // Orange warning
        } else if (elapsed > 30) { // 30 seconds
            elements.timer.style.color = '#4CAF50'; // Green (normal)
        }
    } else if (elements.timer) {
        elements.timer.textContent = '00:00';
        elements.timer.style.color = '';
    }
    
    // Update border color
    statusDiv.style.borderLeftColor = stopRequested ? '#F44336' :
                                     navigationInitiated ? '#FF9800' :
                                     actionInProgress ? '#2196F3' : '#4CAF50';
}

// ================================================
// MAIN AUTOMATION CONTROL
// ================================================
function startAutomation() {
    if (actionInProgress) return;
    
    stopRequested = false;
    actionInProgress = true;
    automationActive = true;
    currentStep = 0;
    navigationInitiated = false;
    lastActionTime = Date.now();
    automationStartTime = Date.now();
    
    console.log('🚀 Starting Automation (1-minute timeout active)');
    updateStatusDisplay();
    updateButtonState();
    
    // Start the 1-minute hard timeout
    startHardTimeout();
    
    chrome.storage.local.set({ 
        automationActive: true,
        startTime: automationStartTime
    });
    
    startSmartMonitoring();
}

function startSmartMonitoring() {
    if (checkInterval) clearInterval(checkInterval);
    
    const frequency = getCheckFrequency();
    console.log(`Monitoring every ${frequency}ms`);
    
    checkInterval = setInterval(() => {
        if (stopRequested || !actionInProgress) {
            clearInterval(checkInterval);
            checkInterval = null;
            return;
        }
        
        smartStepExecution();
    }, frequency);
}

function smartStepExecution() {
    if (stopRequested) return;
    
    // Update timer display on each check
    updateStatusDisplay();
    
    // Check if we're approaching timeout (50+ seconds)
    if (automationStartTime > 0) {
        const elapsedSeconds = Math.floor((Date.now() - automationStartTime) / 1000);
        if (elapsedSeconds > 50 && elapsedSeconds < 60) {
            // Show warning at 50+ seconds
            console.log(`⚠️ Approaching timeout: ${elapsedSeconds}s elapsed`);
        }
    }
    
    // Prevent actions too close together
    if (Date.now() - lastActionTime < 500 && currentStep > 0) return;
    
    const url = location.href;
    
    if (url.includes('Print_Kero_Cupon.aspx')) {
        handlePrintKeroLogic();
    }
    else if (url.includes('ProcessSelection.aspx')) {
        handleProcessSelectionLogic();
    }
    else if (url.includes('MainMenu.aspx')) {
        handleMainMenuLogic();
    }
    else if (url.includes('ahara.karnataka.gov.in')) {
        handleHomePageLogic();
    }
    else {
        emergencyStop('Not on Ahara portal');
    }
}

// ================================================
// STEP HANDLERS
// ================================================
function handleHomePageLogic() {
    if (navigationInitiated) return;
    
    currentStep = 1;
    updateStatusDisplay();
    
    const link = document.getElementById('ctl00_lnkMain') || 
                 document.querySelector('a[href*="MainMenu.aspx"]');
    
    if (link) {
        console.log('Step 1: Clicking menu link');
        link.click();
        lastActionTime = Date.now();
        navigationInitiated = true;
        
        setTimeout(() => navigationInitiated = false, 1500);
    }
}

function handleMainMenuLogic() {
    if (navigationInitiated) return;
    
    currentStep = 2;
    updateStatusDisplay();
    
    console.log('Step 2: Navigating to ProcessSelection');
    window.location.href = 'https://ahara.karnataka.gov.in/shopowner_bserver/Reports/ProcessSelection.aspx';
    
    navigationInitiated = true;
    lastActionTime = Date.now();
    
    setTimeout(() => navigationInitiated = false, 
               serverSpeed === 'fast' ? 3000 : 5000);
}

function handleProcessSelectionLogic() {
    navigationInitiated = false;
    currentStep = 3;
    updateStatusDisplay();
    
    const field = document.getElementById('ctl00_ContentPlaceHolder1_txt_rc_no');
    const radio = document.getElementById('ctl00_ContentPlaceHolder1_rbl_card_type_0');
    
    if (field) {
        executeFillTextField();
    } else if (radio && !radio.checked) {
        executeClickFirstRadio(radio);
    } else if (radio && radio.checked && !navigationInitiated) {
        navigationInitiated = true;
        setTimeout(() => navigationInitiated = false, 
                   serverSpeed === 'fast' ? 2000 : 4000);
    }
}

function handlePrintKeroLogic() {
    navigationInitiated = false;
    currentStep = 4;
    updateStatusDisplay();
    
    const field = document.getElementById('ctl00_ContentPlaceHolder1_txt_rc_no');
    const radio = document.getElementById('ctl00_ContentPlaceHolder1_rbl_card_type_0');
    
    if (field) {
        executeFillTextField();
    } else if (radio) {
        if (!radio.checked) {
            executeClickSecondRadio(radio);
        } else if (!navigationInitiated) {
            navigationInitiated = true;
            setTimeout(() => navigationInitiated = false, 3000);
        }
    }
}

// ================================================
// ACTION FUNCTIONS
// ================================================
function executeClickFirstRadio(radio) {
    console.log('Step 3: Clicking first radio');
    
    radio.click();
    radio.checked = true;
    navigationInitiated = true;
    lastActionTime = Date.now();
    
    const onclick = radio.getAttribute('onclick');
    if (onclick && onclick.includes('__doPostBack')) {
        try {
            const postback = onclick.match(/__doPostBack\('[^']+','[^']*'\)/);
            if (postback) {
                setTimeout(() => {
                    eval(postback[0]);
                    console.log('Postback executed');
                    
                    setTimeout(() => {
                        navigationInitiated = false;
                    }, serverSpeed === 'fast' ? 2000 : 4000);
                }, 100);
                return;
            }
        } catch(e) {
            console.log('Postback error:', e);
        }
    }
    
    setTimeout(() => navigationInitiated = false, 1000);
}

function executeClickSecondRadio(radio) {
    console.log('Step 4: Clicking second radio');
    
    radio.click();
    radio.checked = true;
    lastActionTime = Date.now();
    
    const onclick = radio.getAttribute('onclick');
    if (onclick) {
        try {
            setTimeout(() => {
                eval(onclick.replace('javascript:', ''));
            }, 100);
        } catch(e) {}
    }
}

function executeFillTextField() {
    currentStep = 5;
    console.log('Step 5: Filling text field');
    updateStatusDisplay();
    
    const field = document.getElementById('ctl00_ContentPlaceHolder1_txt_rc_no');
    
    if (field) {
        field.value = '350100';
        
        setTimeout(() => {
            field.focus();
            field.setSelectionRange(6, 6);
            field.style.outline = '2px solid #00ff00';
        }, 50);
        
        console.log('✅✅✅ AUTOMATION COMPLETE!');
        showNotification('✅ Automation Complete!', 'success');
        
        // Clear hard timeout since we completed successfully
        if (hardTimeoutId) {
            clearTimeout(hardTimeoutId);
            hardTimeoutId = null;
        }
        
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
        
        actionInProgress = false;
        automationActive = false;
        navigationInitiated = false;
        chrome.storage.local.remove(['automationActive']);
        updateStatusDisplay();
        updateButtonState();
    }
}

// ================================================
// UI CONTROLS
// ================================================
function addControlButtons() {
    if (document.getElementById('ahara-controls')) return;
    
    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'ahara-controls';
    controlsDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        gap: 10px;
        z-index: 9999;
    `;
    
    // Start Button
    const startBtn = document.createElement('button');
    startBtn.id = 'ahara-start-btn';
    startBtn.textContent = '▶️ START';
    startBtn.style.cssText = `
    background: #4CAF50;
    color: white;
    border: none;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 11px;
    font-family: Arial;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    min-width: auto;
`;

    
    // Stop Button
    const stopBtn = document.createElement('button');
    stopBtn.id = 'ahara-stop-btn';
    stopBtn.textContent = '🛑 STOP';
    stopBtn.style.cssText = `
    background: #F44336;
    color: white;
    border: none;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: not-allowed;
    font-weight: bold;
    font-size: 11px;
    font-family: Arial;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    min-width: auto;
    opacity: 0.6;
`;

    
    startBtn.onclick = () => !actionInProgress && startAutomation();
    stopBtn.onclick = () => actionInProgress && emergencyStop('User stopped');
    
    controlsDiv.appendChild(startBtn);
    controlsDiv.appendChild(stopBtn);
    document.body.appendChild(controlsDiv);
}

function updateButtonState() {
    const startBtn = document.getElementById('ahara-start-btn');
    const stopBtn = document.getElementById('ahara-stop-btn');
    
    if (!startBtn || !stopBtn) return;
    
    if (actionInProgress) {
        startBtn.textContent = '⏳ RUNNING...';
        startBtn.style.background = '#2196F3';
        startBtn.disabled = true;
        startBtn.style.opacity = '0.7';
        
        stopBtn.style.opacity = '1';
        stopBtn.disabled = false;
        stopBtn.style.cursor = 'pointer';
    } else {
        startBtn.textContent = '▶️ START';
        startBtn.style.background = '#4CAF50';
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        
        stopBtn.style.opacity = '0.6';
        stopBtn.disabled = true;
        stopBtn.style.cursor = 'not-allowed';
    }
}

function showNotification(message, type = 'info') {
    const existing = document.getElementById('ahara-notif');
    if (existing) existing.remove();
    
    const colors = { 
        success: '#4CAF50', 
        warning: '#FF9800', 
        error: '#F44336', 
        info: '#2196F3' 
    };
    
    const notif = document.createElement('div');
    notif.id = 'ahara-notif';
    notif.innerHTML = `
        <div style="
            position: fixed;
            top: 50px;
            right: 20px;
            background: white;
            border-left: 4px solid ${colors[type]};
            padding: 12px 18px;
            border-radius: 6px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            z-index: 99999;
            font-family: Arial;
            font-size: 13px;
            max-width: 280px;
            animation: slideIn 0.3s ease;
        ">
            <strong>Ahara Auto</strong><br>${message}
        </div>
    `;
    
    if (!document.getElementById('ahara-notif-style')) {
        const style = document.createElement('style');
        style.id = 'ahara-notif-style';
        style.textContent = `
            @keyframes slideIn { 
                from { transform: translateX(100%); opacity: 0; } 
                to { transform: translateX(0); opacity: 1; } 
            }
            @keyframes vanish {
                0% { opacity: 1; }
                70% { opacity: 1; }
                100% { opacity: 0; transform: translateY(-20px); }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notif);
    
    // Auto-vanish after 3 seconds with fade-out animation
    setTimeout(() => {
        if (notif.parentNode) {
            notif.style.animation = 'vanish 1s ease forwards';
            setTimeout(() => notif.remove(), 1000);
        }
    }, 3000);
}

// ================================================
// INITIALIZATION
// ================================================
function initialize() {
    addStatusDisplay();
    addControlButtons();
    detectServerSpeed();
    
    chrome.storage.local.get(['automationActive'], (result) => {
        if (result.automationActive) {
            setTimeout(() => startAutomation(), 500);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start') {
        startAutomation();
        sendResponse({ status: 'started', serverSpeed: serverSpeed });
    } else if (request.action === 'stop') {
        emergencyStop('User stopped');
        sendResponse({ status: 'stopped' });
    }
    return true;
});

console.log('✅ Ahara Auto Ready - 1-minute timeout protection active');


}