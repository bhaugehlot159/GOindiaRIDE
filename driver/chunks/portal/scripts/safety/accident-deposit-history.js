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
