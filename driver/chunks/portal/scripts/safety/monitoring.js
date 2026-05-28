// Safety & Health Features
// Speed monitoring
let speedMonitoring = {
    enabled: false,
    currentSpeed: 0,
    maxSpeed: 80, // km/h
    violations: []
};

// Telematics data
let telematicsData = {
    harshBraking: 0,
    sharpTurns: 0,
    rapidAcceleration: 0,
    drivingScore: 100
};

// Open Safety Dashboard
function openSafety() {
    const modal = createModal('Safety Dashboard', getSafetyContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Safety Content
function getSafetyContent() {
    const safetyData = JSON.parse(localStorage.getItem('safety_data') || '{}');
    
    let html = '<div class="safety-container">';
    
    // Safety Score
    html += `
        <div class="safety-score-card">
            <div class="score-circle">
                <div class="score-value">${safetyData.safetyScore || 100}</div>
                <div class="score-label">Safety Score</div>
            </div>
        </div>
    `;
    
    // Safety Features Grid
    html += '<div class="safety-features">';
    
    // Speed Monitor
    html += `
        <div class="safety-feature-card" onclick="openSpeedMonitor()">
            <i class="fas fa-gauge-high"></i>
            <h4>Speed Monitor</h4>
            <p>Current: ${speedMonitoring.currentSpeed} km/h</p>
        </div>
    `;
    
    // Uniform Check
    html += `
        <div class="safety-feature-card" onclick="openUniformCheck()">
            <i class="fas fa-camera"></i>
            <h4>Uniform Check</h4>
            <p>${safetyData.uniformCheck?.today ? '✓ Done Today' : '⏳ Pending'}</p>
        </div>
    `;
    
    // Fatigue Alert
    html += `
        <div class="safety-feature-card" onclick="openFatigueMonitor()">
            <i class="fas fa-bed"></i>
            <h4>Fatigue Monitor</h4>
            <p>Driving: ${driverState.drivingHours.toFixed(1)}h</p>
        </div>
    `;
    
    // SOS
    html += `
        <div class="safety-feature-card" onclick="triggerSOS()">
            <i class="fas fa-exclamation-triangle"></i>
            <h4>Emergency SOS</h4>
            <p>Quick Access</p>
        </div>
    `;
    
    // Health Check
    html += `
        <div class="safety-feature-card" onclick="openHealthCheck()">
            <i class="fas fa-heart-pulse"></i>
            <h4>Health Check</h4>
            <p>${safetyData.healthCheck?.nextDue ? 'Due: ' + new Date(safetyData.healthCheck.nextDue).toLocaleDateString() : 'Update Status'}</p>
        </div>
    `;
    
    // Accident Report
    html += `
        <div class="safety-feature-card" onclick="openAccidentReport()">
            <i class="fas fa-car-burst"></i>
            <h4>Accident Report</h4>
            <p>Report Incident</p>
        </div>
    `;
    
    html += '</div>';
    html += '</div>';
    
    return html;
}

// Open Speed Monitor
function openSpeedMonitor() {
    const modal = createModal('AI Speed Monitor', getSpeedMonitorContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Speed Monitor Content
function getSpeedMonitorContent() {
    const violations = speedMonitoring.violations || [];
    
    let html = '<div class="speed-monitor-container">';
    
    // Current Speed Display
    html += `
        <div class="speed-display">
            <div class="speed-meter">
                <div class="speed-number" id="speedNumber">${speedMonitoring.currentSpeed}</div>
                <div class="speed-unit">km/h</div>
            </div>
            <div class="speed-limit">
                <i class="fas fa-sign"></i>
                Speed Limit: ${speedMonitoring.maxSpeed} km/h
            </div>
        </div>
    `;
    
    // Speed Status
    const isOverSpeed = speedMonitoring.currentSpeed > speedMonitoring.maxSpeed;
    html += `
        <div class="speed-status ${isOverSpeed ? 'danger' : 'good'}">
            <i class="fas ${isOverSpeed ? 'fa-triangle-exclamation' : 'fa-check-circle'}"></i>
            <span>${isOverSpeed ? 'OVER SPEED! Slow Down!' : 'Speed Normal'}</span>
        </div>
    `;
    
    // Violations History
    html += '<div class="violations-section">';
    html += '<h3><i class="fas fa-list"></i> Speed Violations</h3>';
    
    if (violations.length > 0) {
        html += '<div class="violations-list">';
        violations.slice(0, 10).forEach(v => {
            html += `
                <div class="violation-item">
                    <div class="violation-icon">
                        <i class="fas fa-exclamation-circle"></i>
                    </div>
                    <div class="violation-details">
                        <p class="violation-speed">${v.speed} km/h</p>
                        <p class="violation-date">${new Date(v.timestamp).toLocaleString()}</p>
                    </div>
                    <div class="violation-penalty">-${v.penalty} points</div>
                </div>
            `;
        });
        html += '</div>';
    } else {
        html += '<p class="empty-state">No violations! Keep driving safely.</p>';
    }
    
    html += '</div>';
    html += '</div>';
    
    return html;
}

// Update Speed Monitoring
function updateSpeedMonitoring(speed) {
    if (!speed || speed < 0) return;
    
    // Convert m/s to km/h
    const speedKmh = (speed * 3.6).toFixed(0);
    speedMonitoring.currentSpeed = parseInt(speedKmh);
    
    // Check for overspeed
    if (speedMonitoring.currentSpeed > speedMonitoring.maxSpeed) {
        // Record violation
        speedMonitoring.violations.push({
            speed: speedMonitoring.currentSpeed,
            timestamp: Date.now(),
            penalty: 5
        });
        
        // Update driving score
        telematicsData.drivingScore = Math.max(0, telematicsData.drivingScore - 5);
        
        // Alert driver
        showToast(`Speed Alert! Current: ${speedMonitoring.currentSpeed} km/h`, 'warning');
        
        // Play alert sound (if available)
        playAlertSound();
    }
    
    // Update display if modal is open
    const speedNumber = document.getElementById('speedNumber');
    if (speedNumber) {
        speedNumber.textContent = speedMonitoring.currentSpeed;
    }
}

// Play Alert Sound
function playAlertSound() {
    // Use Web Audio API for alert sound
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        console.error('Audio not available:', e);
    }
}

// Open Uniform Check
