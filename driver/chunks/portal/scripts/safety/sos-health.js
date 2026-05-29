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
                    driverInfo: getLiveSosDriverInfo(),
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
                driverInfo: getLiveSosDriverInfo(),
                status: 'active'
            };
            showSOSAlert(sosData);
        }
    }
}

function getLiveSosDriverInfo() {
    try {
        const currentDriver = JSON.parse(localStorage.getItem('currentDriver') || 'null');
        const driverData = JSON.parse(localStorage.getItem('driver_data') || '{}');
        const driver = currentDriver && typeof currentDriver === 'object'
            ? { ...driverData, ...currentDriver }
            : driverData;
        return {
            id: driver.id || driver.driverId || '',
            name: driver.name || driver.fullName || 'Driver'
        };
    } catch (_error) {
        return { id: '', name: 'Driver' };
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
