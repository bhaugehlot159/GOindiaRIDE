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
function openUniformCheck() {
    const modal = createModal('Uniform Check Selfie', getUniformCheckContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Uniform Check Content
function getUniformCheckContent() {
    const safetyData = JSON.parse(localStorage.getItem('safety_data') || '{}');
    const uniformCheck = safetyData.uniformCheck || {};
    
    let html = '<div class="uniform-check-container">';
    
    html += `
        <p class="info-text">
            <i class="fas fa-info-circle"></i>
            Take a selfie daily to verify uniform compliance
        </p>
    `;
    
    // Camera preview
    html += `
        <div class="camera-preview" id="cameraPreview">
            <video id="uniformVideo" autoplay playsinline style="width: 100%; border-radius: 8px;"></video>
            <canvas id="uniformCanvas" style="display: none;"></canvas>
            ${uniformCheck.today ? `
                <img src="${uniformCheck.image}" alt="Uniform Check" style="width: 100%; border-radius: 8px;">
            ` : ''}
        </div>
    `;
    
    // Actions
    if (uniformCheck.today) {
        html += `
            <div class="uniform-status">
                <i class="fas fa-check-circle" style="color: var(--success-color); font-size: 2rem;"></i>
                <p><strong>Uniform Check Complete</strong></p>
                <p>Completed at: ${new Date(uniformCheck.timestamp).toLocaleString()}</p>
                <p>Status: ${uniformCheck.verified ? '✓ Verified' : '⏳ Verifying...'}</p>
            </div>
        `;
    } else {
        html += `
            <div class="camera-actions">
                <button class="btn-primary" onclick="startUniformCamera()">
                    <i class="fas fa-camera"></i> Start Camera
                </button>
                <button class="btn-success" onclick="captureUniformPhoto()" id="captureBtn" style="display: none;">
                    <i class="fas fa-camera"></i> Capture Photo
                </button>
            </div>
        `;
    }
    
    html += '</div>';
    
    return html;
}

// Start Uniform Camera
async function startUniformCamera() {
    try {
        const video = document.getElementById('uniformVideo');
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' },
            audio: false 
        });
        
        video.srcObject = stream;
        video.style.display = 'block';
        
        document.getElementById('captureBtn').style.display = 'block';
        
        showToast('Camera started. Position yourself and click capture.', 'info');
    } catch (error) {
        showToast('Camera access denied or not available', 'error');
    }
}

// Capture Uniform Photo
function captureUniformPhoto() {
    const video = document.getElementById('uniformVideo');
    const canvas = document.getElementById('uniformCanvas');
    const context = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    context.drawImage(video, 0, 0);
    
    const imageData = canvas.toDataURL('image/jpeg');
    
    // Stop camera
    const stream = video.srcObject;
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop());
    
    // Save uniform check
    const safetyData = JSON.parse(localStorage.getItem('safety_data') || '{}');
    safetyData.uniformCheck = {
        today: true,
        timestamp: Date.now(),
        image: imageData,
        verified: false
    };
    
    localStorage.setItem('safety_data', JSON.stringify(safetyData));
    
    showToast('Uniform check photo captured! Verifying...', 'success');
    
    // Simulate AI verification after 2 seconds
    setTimeout(() => {
        safetyData.uniformCheck.verified = true;
        localStorage.setItem('safety_data', JSON.stringify(safetyData));
        showToast('Uniform verified! ✓', 'success');
        
        closeAllModals();
        setTimeout(() => openUniformCheck(), 300);
    }, 2000);
}

// Open Telematics Dashboard
function openTelematics() {
    const modal = createModal('Telematics Dashboard', getTelematicsContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Telematics Content
function getTelematicsContent() {
    const data = JSON.parse(localStorage.getItem('telematics_data') || JSON.stringify(telematicsData));
    
    let html = '<div class="telematics-container">';
    
    // Driving Score
    html += `
        <div class="driving-score">
            <div class="score-circle-large">
                <div class="score-value-large">${data.drivingScore}</div>
                <div class="score-label">Driving Score</div>
            </div>
        </div>
    `;
    
    // Metrics
    html += `
        <div class="telematics-metrics">
            <div class="metric-card ${data.harshBraking > 5 ? 'warning' : 'good'}">
                <i class="fas fa-brake-warning"></i>
                <div>
                    <p class="metric-label">Harsh Braking</p>
                    <p class="metric-value">${data.harshBraking}</p>
                </div>
            </div>
            
            <div class="metric-card ${data.sharpTurns > 10 ? 'warning' : 'good'}">
                <i class="fas fa-turn-up"></i>
                <div>
                    <p class="metric-label">Sharp Turns</p>
                    <p class="metric-value">${data.sharpTurns}</p>
                </div>
            </div>
            
            <div class="metric-card ${data.rapidAcceleration > 5 ? 'warning' : 'good'}">
                <i class="fas fa-rocket"></i>
                <div>
                    <p class="metric-label">Rapid Acceleration</p>
                    <p class="metric-value">${data.rapidAcceleration}</p>
                </div>
            </div>
        </div>
    `;
    
    // Tips
    html += `
        <div class="driving-tips">
            <h3><i class="fas fa-lightbulb"></i> Driving Tips</h3>
            <ul>
                <li>Maintain steady speed to improve fuel efficiency</li>
                <li>Anticipate traffic to avoid harsh braking</li>
                <li>Take wider turns for passenger comfort</li>
                <li>Accelerate smoothly for better score</li>
            </ul>
        </div>
    `;
    
    html += '</div>';
    
    // Update UI
    document.getElementById('drivingScore').textContent = data.drivingScore;
    
    return html;
}

// Open Fatigue Monitor
function openFatigueMonitor() {
    const modal = createModal('Fatigue Monitor', getFatigueMonitorContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Fatigue Monitor Content
function getFatigueMonitorContent() {
    const hours = driverState.drivingHours;
    const restRequired = hours >= 8;
    
    let html = '<div class="fatigue-monitor-container">';
    
    html += `
        <div class="fatigue-status ${restRequired ? 'danger' : 'good'}">
            <i class="fas ${restRequired ? 'fa-bed' : 'fa-check-circle'}"></i>
            <h2>${restRequired ? 'Rest Required!' : 'All Good'}</h2>
            <p>Continuous Driving: ${hours.toFixed(1)} hours</p>
        </div>
    `;
    
    // Progress bar
    const percentage = Math.min((hours / 8) * 100, 100);
    html += `
        <div class="fatigue-progress">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%; background: ${percentage >= 100 ? 'var(--danger-color)' : percentage >= 75 ? 'var(--warning-color)' : 'var(--success-color)'}"></div>
            </div>
            <p>Limit: 8 hours continuous driving</p>
        </div>
    `;
    
    if (restRequired) {
        html += `
            <div class="rest-requirements">
                <h3>Rest Requirements:</h3>
                <ul>
                    <li><i class="fas fa-clock"></i> Minimum 30 minutes rest</li>
                    <li><i class="fas fa-ban"></i> Cannot go online during rest</li>
                    <li><i class="fas fa-repeat"></i> Rest timer will count down</li>
                </ul>
            </div>
        `;
    } else {
        html += `
            <div class="fatigue-tips">
                <h3>Stay Alert:</h3>
                <ul>
                    <li>Take regular breaks</li>
                    <li>Stay hydrated</li>
                    <li>Get adequate sleep (7-8 hours)</li>
                    <li>Stop if feeling drowsy</li>
                </ul>
            </div>
        `;
    }
    
    html += '</div>';
    
    return html;
}

// Trigger SOS
function triggerSOS() {
    const confirmed = confirm('Are you in an emergency situation?\n\nThis will:\n- Alert authorities\n- Share your location\n- Notify emergency contacts\n- Record incident');
    
    if (confirmed) {
        // Get current location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(position) {
                const sosData = {
                    timestamp: Date.now(),
                    location: {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    },
                    driverInfo: {
                        id: 'DRIVER-' + Date.now(),
                        name: 'Demo Driver'
                    },
                    status: 'active'
                };
                
                // Save SOS
                const sosHistory = JSON.parse(localStorage.getItem('sos_history') || '[]');
                sosHistory.unshift(sosData);
                localStorage.setItem('sos_history', JSON.stringify(sosHistory));
                
                // Show SOS modal
                showSOSAlert(sosData);
            });
        } else {
            // No location available
            const sosData = {
                timestamp: Date.now(),
                location: null,
                driverInfo: {
                    id: 'DRIVER-' + Date.now(),
                    name: 'Demo Driver'
                },
                status: 'active'
            };
            showSOSAlert(sosData);
        }
    }
}

// Show SOS Alert
function showSOSAlert(sosData) {
    const modal = createModal('🚨 EMERGENCY SOS ACTIVATED', getSOSAlertContent(sosData));
    modal.querySelector('.modal-content').style.border = '3px solid var(--danger-color)';
    document.getElementById('modalsContainer').appendChild(modal);
    
    // Play alert sound
    playAlertSound();
}

// Get SOS Alert Content
function getSOSAlertContent(sosData) {
    let html = '<div class="sos-alert-container">';
    
    html += `
        <div class="sos-status">
            <i class="fas fa-siren" style="font-size: 3rem; color: var(--danger-color); animation: pulse 1s infinite;"></i>
            <h2>Emergency Services Notified</h2>
            <p>Help is on the way</p>
        </div>
    `;
    
    if (sosData.location) {
        html += `
            <div class="sos-location">
                <h3><i class="fas fa-map-marker-alt"></i> Your Location</h3>
                <p>Lat: ${sosData.location.lat.toFixed(6)}</p>
                <p>Lng: ${sosData.location.lng.toFixed(6)}</p>
                <button class="btn-primary" onclick="window.open('https://www.google.com/maps?q=${sosData.location.lat},${sosData.location.lng}', '_blank')">
                    <i class="fas fa-map"></i> View on Map
                </button>
            </div>
        `;
    }
    
    html += `
        <div class="sos-contacts">
            <h3>Emergency Contacts</h3>
            <button class="btn-danger" onclick="window.open('tel:100')">
                <i class="fas fa-phone"></i> Call Police (100)
            </button>
            <button class="btn-danger" onclick="window.open('tel:108')">
                <i class="fas fa-ambulance"></i> Call Ambulance (108)
            </button>
        </div>
    `;
    
    html += `
        <button class="btn-secondary" onclick="cancelSOS(${sosData.timestamp})">
            Cancel SOS (False Alarm)
        </button>
    `;
    
    html += '</div>';
    
    return html;
}

// Cancel SOS
function cancelSOS(timestamp) {
    const sosHistory = JSON.parse(localStorage.getItem('sos_history') || '[]');
    const sos = sosHistory.find(s => s.timestamp === timestamp);
    if (sos) {
        sos.status = 'cancelled';
        localStorage.setItem('sos_history', JSON.stringify(sosHistory));
    }
    
    showToast('SOS cancelled', 'info');
    closeAllModals();
}

// Open Health Check
function openHealthCheck() {
    const modal = createModal('Health Check', getHealthCheckContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Health Check Content
function getHealthCheckContent() {
    const safetyData = JSON.parse(localStorage.getItem('safety_data') || '{}');
    const healthCheck = safetyData.healthCheck || {};
    
    let html = '<div class="health-check-container">';
    
    html += `
        <p class="info-text">
            <i class="fas fa-info-circle"></i>
            Regular health checks ensure you're fit to drive
        </p>
    `;
    
    // Health status
    if (healthCheck.certificate) {
        html += `
            <div class="health-status good">
                <i class="fas fa-heart-circle-check"></i>
                <h3>Health Certificate Valid</h3>
                <p>Issued: ${new Date(healthCheck.issueDate).toLocaleDateString()}</p>
                <p>Valid Until: ${new Date(healthCheck.expiryDate).toLocaleDateString()}</p>
            </div>
        `;
    } else {
        html += `
            <div class="health-status warning">
                <i class="fas fa-heart-circle-exclamation"></i>
                <h3>Health Certificate Required</h3>
                <p>Upload your health certificate</p>
            </div>
        `;
    }
    
    // Upload form
    html += `
        <form onsubmit="uploadHealthCertificate(event)">
            <div class="form-group">
                <label class="form-label">Issue Date</label>
                <input type="date" name="issueDate" class="form-input" value="${healthCheck.issueDate || ''}" required>
            </div>
            
            <div class="form-group">
                <label class="form-label">Expiry Date</label>
                <input type="date" name="expiryDate" class="form-input" value="${healthCheck.expiryDate || ''}" required>
            </div>
            
            <div class="form-group">
                <label class="form-label">Upload Certificate</label>
                <div class="file-upload" onclick="document.getElementById('healthCertFile').click()">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p id="healthCertFileName">${healthCheck.fileName || 'Click to upload'}</p>
                    <input type="file" id="healthCertFile" accept="image/*,.pdf" onchange="handleHealthFileSelect(event)" required>
                </div>
            </div>
            
            <button type="submit" class="btn-primary">Upload Certificate</button>
        </form>
    `;
    
    // Reminders
    html += `
        <div class="health-reminders">
            <h3><i class="fas fa-bell"></i> Health Reminders</h3>
            <ul>
                <li>Get annual health check-up</li>
                <li>Update certificate before expiry</li>
                <li>Report any health issues immediately</li>
            </ul>
        </div>
    `;
    
    html += '</div>';
    
    return html;
}

// Handle Health File Select
function handleHealthFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('healthCertFileName').textContent = file.name;
    }
}

// Upload Health Certificate
function uploadHealthCertificate(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const safetyData = JSON.parse(localStorage.getItem('safety_data') || '{}');
    
    safetyData.healthCheck = {
        certificate: true,
        issueDate: formData.get('issueDate'),
        expiryDate: formData.get('expiryDate'),
        fileName: document.getElementById('healthCertFile').files[0].name,
        uploadedAt: Date.now()
    };
    
    localStorage.setItem('safety_data', JSON.stringify(safetyData));
    
    showToast('Health certificate uploaded successfully!', 'success');
    closeAllModals();
    setTimeout(() => openHealthCheck(), 300);
}

// Open Accident Report
function openAccidentReport() {
    const modal = createModal('Report Accident', getAccidentReportContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Accident Report Content
function getAccidentReportContent() {
    return `
        <form onsubmit="submitAccidentReport(event)">
            <div class="form-group">
                <label class="form-label">Date & Time</label>
                <input type="datetime-local" name="accidentTime" class="form-input" required>
            </div>
            
            <div class="form-group">
                <label class="form-label">Location</label>
                <input type="text" name="location" class="form-input" placeholder="Accident location" required>
            </div>
            
            <div class="form-group">
                <label class="form-label">Severity</label>
                <select name="severity" class="form-select" required>
                    <option value="">Select severity</option>
                    <option value="minor">Minor (No injuries)</option>
                    <option value="moderate">Moderate (Minor injuries)</option>
                    <option value="major">Major (Serious injuries)</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">Description</label>
                <textarea name="description" class="form-textarea" placeholder="Describe what happened" required></textarea>
            </div>
            
            <div class="form-group">
                <label class="form-label">Upload Photos (if any)</label>
                <div class="file-upload" onclick="document.getElementById('accidentPhotos').click()">
                    <i class="fas fa-camera"></i>
                    <p>Click to upload photos</p>
                    <input type="file" id="accidentPhotos" accept="image/*" multiple>
                </div>
            </div>
            
            <p class="info-text">
                <i class="fas fa-shield-halved"></i>
                This report will be used for insurance claims and investigation
            </p>
            
            <button type="submit" class="btn-danger">Submit Accident Report</button>
        </form>
    `;
}

// Submit Accident Report
function submitAccidentReport(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    
    const accidentData = {
        id: 'ACC-' + Date.now(),
        timestamp: Date.now(),
        accidentTime: formData.get('accidentTime'),
        location: formData.get('location'),
        severity: formData.get('severity'),
        description: formData.get('description'),
        status: 'reported'
    };
    
    // Save accident report
    const accidents = JSON.parse(localStorage.getItem('accident_reports') || '[]');
    accidents.unshift(accidentData);
    localStorage.setItem('accident_reports', JSON.stringify(accidents));
    
    showToast('Accident report submitted. Our team will contact you shortly.', 'success');
    closeAllModals();
}

// Open Security Deposit
function openDeposit() {
    const modal = createModal('Security Deposit', getDepositContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Deposit Content
function getDepositContent() {
    const depositData = JSON.parse(localStorage.getItem('deposit_data') || '{}');
    
    let html = '<div class="deposit-container">';
    
    if (depositData.paid) {
        html += `
            <div class="deposit-status good">
                <i class="fas fa-shield-check"></i>
                <h3>Deposit Paid</h3>
                <p>Amount: ₹${depositData.amount}</p>
                <p>Date: ${new Date(depositData.paidDate).toLocaleDateString()}</p>
                <p>Status: ${depositData.status}</p>
            </div>
            
            <button class="btn-secondary" onclick="requestDepositRefund()">
                Request Refund
            </button>
        `;
    } else {
        html += `
            <div class="deposit-info">
                <h3>Security Deposit Required</h3>
                <p class="deposit-amount">₹5,000</p>
                <p>This refundable deposit is required to start driving</p>
            </div>
            
            <div class="deposit-benefits">
                <h4>Benefits:</h4>
                <ul>
                    <li>Fully refundable</li>
                    <li>Secure payment</li>
                    <li>Quick processing</li>
                    <li>Online refund request</li>
                </ul>
            </div>
            
            <button class="btn-primary" onclick="payDeposit()">
                Pay Deposit ₹5,000
            </button>
        `;
    }
    
    // Deposit history
    if (depositData.history) {
        html += `
            <div class="deposit-history">
                <h3>Deposit History</h3>
                ${depositData.history.map(h => `
                    <div class="history-item">
                        <span>${h.action}</span>
                        <span>${new Date(h.date).toLocaleDateString()}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    html += '</div>';
    
    return html;
}

// Pay Deposit
function payDeposit() {
    showToast('Processing payment...', 'info');
    
    setTimeout(() => {
        const depositData = {
            paid: true,
            amount: 5000,
            paidDate: Date.now(),
            status: 'Active',
            history: [
                { action: 'Deposit Paid', date: Date.now() }
            ]
        };
        
        localStorage.setItem('deposit_data', JSON.stringify(depositData));
        
        document.getElementById('depositStatus').textContent = 'Paid ✓';
        document.getElementById('depositStatus').style.color = 'var(--success-color)';
        
        showToast('Security deposit paid successfully!', 'success');
        closeAllModals();
        setTimeout(() => openDeposit(), 300);
    }, 2000);
}

// Request Deposit Refund
function requestDepositRefund() {
    const confirmed = confirm('Request refund of security deposit?\n\nNote: You will not be able to accept rides until deposit is paid again.');
    
    if (confirmed) {
        showToast('Refund request submitted. Processing in 5-7 business days.', 'success');
    }
}

// Open Trip History
function openTripHistory() {
    const modal = createModal('Trip History', getTripHistoryContent());
    document.getElementById('modalsContainer').appendChild(modal);
    
    updateBottomNav(2);
}

// Get Trip History Content
function getTripHistoryContent() {
    const trips = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRIPS) || '[]');
    
    let html = '<div class="trip-history-container">';
    
    if (trips.length > 0) {
        html += '<div class="trips-list">';
        
        trips.forEach(trip => {
            html += `
                <div class="trip-card">
                    <div class="trip-header">
                        <span class="trip-id">${trip.id}</span>
                        <span class="trip-fare">${trip.fare}</span>
                    </div>
                    <div class="trip-route">
                        <div class="route-point">
                            <i class="fas fa-circle pickup"></i>
                            <span>${trip.pickup}</span>
                        </div>
                        <div class="route-point">
                            <i class="fas fa-circle destination"></i>
                            <span>${trip.drop}</span>
                        </div>
                    </div>
                    <div class="trip-footer">
                        <span><i class="fas fa-calendar"></i> ${new Date(trip.completedAt).toLocaleDateString()}</span>
                        <button class="btn-receipt" onclick="generateReceipt('${trip.id}')">
                            <i class="fas fa-receipt"></i> Receipt
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
    } else {
        html += '<p class="empty-state">No trips yet</p>';
    }
    
    html += '</div>';
    
    return html;
}

// Generate Receipt
function generateReceipt(tripId) {
    const trips = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRIPS) || '[]');
    const trip = trips.find(t => t.id === tripId);
    
    if (!trip) {
        showToast('Trip not found', 'error');
        return;
    }
    
    const modal = createModal('Trip Receipt', getReceiptContent(trip));
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Receipt Content
function getReceiptContent(trip) {
    return `
        <div class="receipt-container">
            <div class="receipt-header">
                <h2>GO India RIDE</h2>
                <p>Trip Receipt</p>
            </div>
            
            <div class="receipt-details">
                <div class="receipt-row">
                    <span>Trip ID:</span>
                    <span>${trip.id}</span>
                </div>
                <div class="receipt-row">
                    <span>Date:</span>
                    <span>${new Date(trip.completedAt).toLocaleString()}</span>
                </div>
                <div class="receipt-row">
                    <span>From:</span>
                    <span>${trip.pickup}</span>
                </div>
                <div class="receipt-row">
                    <span>To:</span>
                    <span>${trip.drop}</span>
                </div>
                <div class="receipt-row total">
                    <span><strong>Total Fare:</strong></span>
                    <span><strong>${trip.fare}</strong></span>
                </div>
            </div>
            
            <div class="receipt-actions">
                <button class="btn-secondary" onclick="downloadReceipt('${trip.id}')">
                    <i class="fas fa-download"></i> Download
                </button>
                <button class="btn-secondary" onclick="shareReceipt('${trip.id}')">
                    <i class="fas fa-share"></i> Share
                </button>
            </div>
        </div>
    `;
}

// Download Receipt
function downloadReceipt(tripId) {
    showToast('Receipt downloaded!', 'success');
}

// Share Receipt
function shareReceipt(tripId) {
    if (navigator.share) {
        navigator.share({
            title: 'Trip Receipt',
            text: `Trip ${tripId} receipt from GO India RIDE`
        });
    } else {
        showToast('Sharing not supported', 'info');
    }
}

// Open Taxes
function openTaxes() {
    const modal = createModal('Tax Summary', getTaxesContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Taxes Content
function getTaxesContent() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    
    // Indian financial year: April to March
    let fyStart, fyEnd;
    if (currentMonth >= 3) { // April (3) to December (11)
        fyStart = currentYear;
        fyEnd = currentYear + 1;
    } else { // January (0) to March (2)
        fyStart = currentYear - 1;
        fyEnd = currentYear;
    }
    
    const earnings = calculateEarnings('month');
    const annualEarnings = earnings.total * 12; // Estimate
    
    return `
        <div class="tax-container">
            <div class="tax-year">
                <h3>Financial Year ${fyStart}-${fyEnd}</h3>
            </div>
            
            <div class="tax-summary">
                <div class="tax-row">
                    <span>Total Earnings:</span>
                    <span>₹${annualEarnings.toFixed(2)}</span>
                </div>
                <div class="tax-row">
                    <span>TDS Deducted:</span>
                    <span>₹${(annualEarnings * 0.01).toFixed(2)}</span>
                </div>
                <div class="tax-row">
                    <span>Commission:</span>
                    <span>₹${(annualEarnings * 0.15).toFixed(2)}</span>
                </div>
                <div class="tax-row total">
                    <span><strong>Net Income:</strong></span>
                    <span><strong>₹${(annualEarnings * 0.84).toFixed(2)}</strong></span>
                </div>
            </div>
            
            <button class="btn-primary" onclick="downloadTaxStatement()">
                <i class="fas fa-download"></i> Download Tax Statement
            </button>
            
            <p class="info-text">
                <i class="fas fa-info-circle"></i>
                Tax statement can be used for ITR filing
            </p>
        </div>
    `;
}

// Download Tax Statement
function downloadTaxStatement() {
    showToast('Tax statement downloaded!', 'success');
}

// Open Languages
function openLanguages() {
    openLanguagesModal();
}

// Open Profile
function openProfile() {
    const modal = createModal('Driver Profile', getProfileContent());
    document.getElementById('modalsContainer').appendChild(modal);
    
    updateBottomNav(3);
}

// Get Profile Content
function getProfileContent() {
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    
    return `
        <div class="profile-container">
            <div class="profile-header">
                <div class="profile-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <h2>Demo Driver</h2>
                <p>Driver ID: DR-${Date.now().toString().slice(-6)}</p>
                ${kycData.verified ? '<span class="badge badge-success">✓ Verified Driver</span>' : ''}
            </div>
            
            <div class="profile-stats">
                <div class="stat-item">
                    <p class="stat-value">${driverState.rating.toFixed(1)}</p>
                    <p class="stat-label">Rating</p>
                </div>
                <div class="stat-item">
                    <p class="stat-value">${driverState.todayTrips}</p>
                    <p class="stat-label">Trips</p>
                </div>
                <div class="stat-item">
                    <p class="stat-value">${telematicsData.drivingScore}</p>
                    <p class="stat-label">Score</p>
                </div>
            </div>
            
            <div class="profile-menu">
                <button class="profile-menu-item" onclick="openKYC()">
                    <i class="fas fa-id-card"></i>
                    <span>KYC & Documents</span>
                </button>
                <button class="profile-menu-item" onclick="openLanguages()">
                    <i class="fas fa-language"></i>
                    <span>Language Skills</span>
                </button>
                <button class="profile-menu-item" onclick="openDeposit()">
                    <i class="fas fa-shield"></i>
                    <span>Security Deposit</span>
                </button>
                <button class="profile-menu-item" onclick="logout()">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Logout</span>
                </button>
            </div>
        </div>
    `;
}

// Logout
function logout() {
    const confirmed = confirm('Are you sure you want to logout?');
    if (confirmed) {
        window.location.href = '../pages/login.html';
    }
}

// Add safety styles
const safetyStyles = document.createElement('style');
safetyStyles.textContent = `
    .safety-score-card {
        text-align: center;
        padding: 2rem;
        background: var(--bg-color);
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    
    .score-circle, .score-circle-large {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        border: 8px solid var(--success-color);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        margin: 0 auto;
    }
    
    .score-circle-large {
        width: 150px;
        height: 150px;
    }
    
    .score-value, .score-value-large {
        font-size: 2.5rem;
        font-weight: bold;
        color: var(--text-primary);
    }
    
    .score-value-large {
        font-size: 3rem;
    }
    
    .score-label {
        font-size: 0.9rem;
        color: var(--text-secondary);
    }
    
    .safety-features {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
    }
    
    .safety-feature-card {
        background: var(--bg-color);
        padding: 1.5rem;
        border-radius: 12px;
        text-align: center;
        cursor: pointer;
        border: 2px solid var(--border-color);
        transition: all 0.2s;
    }
    
    .safety-feature-card:active {
        transform: scale(0.95);
    }
    
    .safety-feature-card i {
        font-size: 2rem;
        color: var(--primary-color);
        margin-bottom: 0.5rem;
    }
    
    .safety-feature-card h4 {
        margin-bottom: 0.5rem;
    }
    
    .safety-feature-card p {
        font-size: 0.85rem;
        color: var(--text-secondary);
    }
    
    .speed-display {
        text-align: center;
        padding: 2rem;
        background: var(--bg-color);
        border-radius: 12px;
        margin-bottom: 1rem;
    }
    
    .speed-meter {
        margin-bottom: 1rem;
    }
    
    .speed-number {
        font-size: 4rem;
        font-weight: bold;
        color: var(--primary-color);
    }
    
    .speed-unit {
        font-size: 1.2rem;
        color: var(--text-secondary);
    }
    
    .speed-status {
        padding: 1rem;
        border-radius: 8px;
        text-align: center;
        font-size: 1.2rem;
        font-weight: bold;
        margin-bottom: 1.5rem;
    }
    
    .speed-status.good {
        background: var(--success-color);
        color: white;
    }
    
    .speed-status.danger {
        background: var(--danger-color);
        color: white;
        animation: pulse 1s infinite;
    }
    
    .violations-list {
        max-height: 300px;
        overflow-y: auto;
    }
    
    .violation-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        background: var(--bg-color);
        border-radius: 8px;
        margin-bottom: 0.5rem;
    }
    
    .violation-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #fee2e2;
        color: #991b1b;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .violation-details {
        flex: 1;
    }
    
    .violation-speed {
        font-weight: bold;
        color: var(--danger-color);
    }
    
    .violation-date {
        font-size: 0.85rem;
        color: var(--text-secondary);
    }
    
    .violation-penalty {
        font-weight: bold;
        color: var(--danger-color);
    }
    
    .camera-preview {
        background: #000;
        border-radius: 8px;
        margin: 1rem 0;
        min-height: 300px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .camera-actions {
        display: flex;
        gap: 1rem;
    }
    
    .uniform-status {
        text-align: center;
        padding: 2rem;
        background: var(--bg-color);
        border-radius: 8px;
        margin: 1rem 0;
    }
    
    .telematics-metrics {
        display: grid;
        gap: 1rem;
        margin-bottom: 2rem;
    }
    
    .metric-card {
        background: var(--bg-color);
        padding: 1rem;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 1rem;
        border-left: 4px solid var(--success-color);
    }
    
    .metric-card.warning {
        border-left-color: var(--warning-color);
    }
    
    .metric-card i {
        font-size: 2rem;
        color: var(--primary-color);
    }
    
    .metric-label {
        font-size: 0.9rem;
        color: var(--text-secondary);
    }
    
    .metric-value {
        font-size: 1.5rem;
        font-weight: bold;
    }
    
    .driving-tips {
        background: #dbeafe;
        padding: 1.5rem;
        border-radius: 8px;
    }
    
    .driving-tips h3 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
        color: #1e40af;
    }
    
    .driving-tips ul {
        list-style: none;
        padding: 0;
    }
    
    .driving-tips li {
        padding: 0.5rem 0;
        padding-left: 1.5rem;
        position: relative;
    }
    
    .driving-tips li:before {
        content: "✓";
        position: absolute;
        left: 0;
        color: #1e40af;
        font-weight: bold;
    }
    
    .fatigue-progress {
        margin: 2rem 0;
    }
    
    .progress-bar {
        width: 100%;
        height: 30px;
        background: var(--border-color);
        border-radius: 15px;
        overflow: hidden;
        margin-bottom: 0.5rem;
    }
    
    .progress-fill {
        height: 100%;
        transition: width 0.3s;
    }
    
    .health-status, .fatigue-status {
        text-align: center;
        padding: 2rem;
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    
    .health-status.good, .fatigue-status.good {
        background: #d1fae5;
        color: #065f46;
    }
    
    .health-status.warning, .fatigue-status.warning {
        background: #fef3c7;
        color: #92400e;
    }
    
    .health-status.danger, .fatigue-status.danger {
        background: #fee2e2;
        color: #991b1b;
    }
    
    .health-status i, .fatigue-status i {
        font-size: 3rem;
        margin-bottom: 1rem;
    }
    
    .sos-alert-container {
        text-align: center;
    }
    
    .sos-status {
        padding: 2rem;
        margin-bottom: 2rem;
    }
    
    .sos-location, .sos-contacts {
        background: var(--bg-color);
        padding: 1.5rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }
    
    .sos-contacts button {
        width: 100%;
        margin-bottom: 0.5rem;
    }
    
    .deposit-status {
        text-align: center;
        padding: 2rem;
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    
    .deposit-info {
        text-align: center;
        padding: 2rem;
        background: var(--bg-color);
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    
    .deposit-amount {
        font-size: 3rem;
        font-weight: bold;
        color: var(--primary-color);
        margin: 1rem 0;
    }
    
    .deposit-benefits {
        background: #dbeafe;
        padding: 1.5rem;
        border-radius: 8px;
        margin-bottom: 2rem;
    }
    
    .deposit-benefits ul {
        list-style: none;
        padding: 0;
    }
    
    .deposit-benefits li {
        padding: 0.5rem 0;
        padding-left: 1.5rem;
        position: relative;
    }
    
    .deposit-benefits li:before {
        content: "✓";
        position: absolute;
        left: 0;
        color: #1e40af;
        font-weight: bold;
    }
    
    .trip-card {
        background: var(--bg-color);
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }
    
    .trip-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 1rem;
    }
    
    .trip-id {
        font-weight: bold;
        color: var(--primary-color);
    }
    
    .trip-fare {
        font-weight: bold;
        color: var(--success-color);
    }
    
    .trip-route {
        margin-bottom: 1rem;
    }
    
    .route-point {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    
    .trip-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 1rem;
        border-top: 1px solid var(--border-color);
    }
    
    .btn-receipt {
        background: var(--primary-color);
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
    }
    
    .receipt-container {
        background: white;
        color: #000;
    }
    
    .receipt-header {
        text-align: center;
        padding: 2rem;
        background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
        color: white;
        border-radius: 12px 12px 0 0;
        margin: -1.5rem -1.5rem 1.5rem -1.5rem;
    }
    
    .receipt-details {
        margin-bottom: 2rem;
    }
    
    .receipt-row {
        display: flex;
        justify-content: space-between;
        padding: 0.75rem 0;
        border-bottom: 1px solid #e5e7eb;
    }
    
    .receipt-row.total {
        border-top: 2px solid #e5e7eb;
        margin-top: 1rem;
        padding-top: 1rem;
    }
    
    .receipt-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }
    
    .profile-header {
        text-align: center;
        padding: 2rem;
        background: var(--bg-color);
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    
    .profile-avatar i {
        font-size: 5rem;
        color: var(--primary-color);
    }
    
    .profile-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
        margin-bottom: 2rem;
    }
    
    .stat-item {
        text-align: center;
        padding: 1rem;
        background: var(--bg-color);
        border-radius: 8px;
    }
    
    .profile-menu {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .profile-menu-item {
        background: var(--bg-color);
        border: none;
        padding: 1rem;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 1rem;
        cursor: pointer;
        text-align: left;
        transition: background 0.2s;
    }
    
    .profile-menu-item:active {
        background: var(--border-color);
    }
    
    .profile-menu-item i {
        font-size: 1.5rem;
        color: var(--primary-color);
        width: 30px;
    }
`;
document.head.appendChild(safetyStyles);
