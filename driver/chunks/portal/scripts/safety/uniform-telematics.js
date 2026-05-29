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
    
    safetyData.uniformCheck.verificationStatus = 'pending_admin_review';
    localStorage.setItem('safety_data', JSON.stringify(safetyData));
    showToast('Uniform check photo captured and sent for live verification.', 'success');
    closeAllModals();
    setTimeout(() => openUniformCheck(), 300);
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
