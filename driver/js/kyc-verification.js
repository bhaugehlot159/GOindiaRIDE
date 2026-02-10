// KYC Verification System
// Document types and their requirements
const KYC_DOCUMENTS = {
    DRIVING_LICENSE: {
        name: 'Driving License',
        icon: 'fa-id-card',
        required: true,
        fields: ['licenseNumber', 'expiryDate', 'issueDate']
    },
    AADHAAR: {
        name: 'Aadhaar Card',
        icon: 'fa-id-badge',
        required: true,
        fields: ['aadhaarNumber']
    },
    PAN: {
        name: 'PAN Card',
        icon: 'fa-credit-card',
        required: true,
        fields: ['panNumber']
    },
    POLICE_VERIFICATION: {
        name: 'Police Verification',
        icon: 'fa-shield-halved',
        required: true,
        fields: ['verificationNumber', 'issueDate']
    },
    RC: {
        name: 'Vehicle RC',
        icon: 'fa-car',
        required: true,
        fields: ['rcNumber', 'vehicleNumber']
    },
    INSURANCE: {
        name: 'Vehicle Insurance',
        icon: 'fa-file-shield',
        required: true,
        fields: ['policyNumber', 'expiryDate']
    },
    PUC: {
        name: 'PUC Certificate',
        icon: 'fa-leaf',
        required: true,
        fields: ['pucNumber', 'expiryDate']
    },
    FITNESS: {
        name: 'Fitness Certificate',
        icon: 'fa-certificate',
        required: true,
        fields: ['certificateNumber', 'expiryDate']
    },
    GUIDE_CERT: {
        name: 'Guide Certification',
        icon: 'fa-user-graduate',
        required: false,
        fields: ['certificationNumber', 'issueDate']
    }
};

// Languages available
const LANGUAGES = [
    { code: 'hi', name: 'Hindi' },
    { code: 'en', name: 'English' },
    { code: 'mr', name: 'Marathi' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'kn', name: 'Kannada' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'bn', name: 'Bengali' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'or', name: 'Odia' },
    { code: 'as', name: 'Assamese' }
];

// Proficiency levels
const PROFICIENCY_LEVELS = ['Basic', 'Fluent', 'Native'];

// Open KYC Modal
function openKYC() {
    const modal = createModal('KYC Verification', getKYCContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get KYC Content
function getKYCContent() {
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    
    let html = '<div class="kyc-container">';
    
    // Verification Status
    html += `
        <div class="verification-status">
            <div class="status-badge ${kycData.verified ? 'badge-success' : 'badge-warning'}">
                <i class="fas ${kycData.verified ? 'fa-check-circle' : 'fa-clock'}"></i>
                ${kycData.verified ? 'Verified Driver' : 'Verification Pending'}
            </div>
            ${kycData.trustScore ? `<p>Trust Score: <strong>${kycData.trustScore}/100</strong></p>` : ''}
        </div>
    `;
    
    // Document Upload Sections
    html += '<div class="documents-grid">';
    
    for (const [key, doc] of Object.entries(KYC_DOCUMENTS)) {
        const docData = kycData.documents?.[key] || {};
        const status = docData.status || 'pending';
        const statusClass = status === 'verified' ? 'success' : status === 'rejected' ? 'danger' : 'warning';
        
        html += `
            <div class="document-card">
                <div class="doc-header">
                    <i class="fas ${doc.icon}"></i>
                    <h4>${doc.name}</h4>
                    ${doc.required ? '<span class="required">*</span>' : ''}
                </div>
                <div class="doc-status badge-${statusClass}">
                    ${status === 'verified' ? '✓ Verified' : status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                </div>
                ${docData.expiryDate ? `<p class="doc-expiry">Expires: ${new Date(docData.expiryDate).toLocaleDateString()}</p>` : ''}
                ${docData.rejectionReason ? `<p class="rejection-reason">${docData.rejectionReason}</p>` : ''}
                <button class="btn-secondary" onclick="uploadDocument('${key}')">
                    ${docData.uploaded ? 'Re-upload' : 'Upload'}
                </button>
            </div>
        `;
    }
    
    html += '</div>';
    
    // Language Skills Section
    html += '<div class="languages-section" style="margin-top: 2rem;">';
    html += '<h3><i class="fas fa-language"></i> Language Skills</h3>';
    html += '<button class="btn-primary" onclick="openLanguagesModal()">Manage Languages</button>';
    
    const languages = kycData.languages || [];
    if (languages.length > 0) {
        html += '<div class="languages-list" style="margin-top: 1rem;">';
        languages.forEach(lang => {
            html += `
                <div class="language-item">
                    <span class="language-name">${lang.name}</span>
                    <span class="badge badge-info">${lang.proficiency}</span>
                </div>
            `;
        });
        html += '</div>';
    }
    
    html += '</div>';
    
    // Guide Certification Badge
    if (kycData.documents?.GUIDE_CERT?.status === 'verified') {
        html += `
            <div class="certification-badge" style="margin-top: 2rem;">
                <i class="fas fa-award"></i>
                <span>Certified Tourist Guide</span>
            </div>
        `;
    }
    
    html += '</div>';
    
    return html;
}

// Upload Document
function uploadDocument(docType) {
    const doc = KYC_DOCUMENTS[docType];
    
    const modal = createModal(`Upload ${doc.name}`, getUploadDocumentContent(docType));
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Upload Document Content
function getUploadDocumentContent(docType) {
    const doc = KYC_DOCUMENTS[docType];
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    const docData = kycData.documents?.[docType] || {};
    
    let html = `<form id="uploadForm-${docType}" onsubmit="submitDocument(event, '${docType}')">`;
    
    // Document fields
    doc.fields.forEach(field => {
        const label = field.replace(/([A-Z])/g, ' $1').trim();
        const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
        
        html += `
            <div class="form-group">
                <label class="form-label">${capitalizedLabel}</label>
                ${field.includes('Date') ? 
                    `<input type="date" name="${field}" class="form-input" value="${docData[field] || ''}" required>` :
                    `<input type="text" name="${field}" class="form-input" value="${docData[field] || ''}" required>`
                }
            </div>
        `;
    });
    
    // File upload
    html += `
        <div class="form-group">
            <label class="form-label">Upload Document</label>
            <div class="file-upload" onclick="document.getElementById('file-${docType}').click()">
                <i class="fas fa-cloud-upload-alt"></i>
                <p id="fileName-${docType}">${docData.fileName || 'Click to upload image/PDF'}</p>
                <input type="file" id="file-${docType}" accept="image/*,.pdf" onchange="handleFileSelect(event, '${docType}')" required>
            </div>
        </div>
    `;
    
    html += `
        <button type="submit" class="btn-primary">Submit for Verification</button>
    </form>`;
    
    return html;
}

// Handle File Select
function handleFileSelect(event, docType) {
    const file = event.target.files[0];
    if (file) {
        const fileName = document.getElementById(`fileName-${docType}`);
        if (fileName) {
            fileName.textContent = file.name;
        }
    }
}

// Submit Document
function submitDocument(event, docType) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Get KYC data
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    if (!kycData.documents) {
        kycData.documents = {};
    }
    
    // Save document data
    const docData = {
        status: 'pending',
        uploadedAt: Date.now(),
        uploaded: true
    };
    
    // Add form fields
    for (const [key, value] of formData.entries()) {
        docData[key] = value;
    }
    
    // Add file info
    const fileInput = document.getElementById(`file-${docType}`);
    if (fileInput?.files[0]) {
        docData.fileName = fileInput.files[0].name;
        docData.fileSize = fileInput.files[0].size;
        
        // Read file as base64 (for demo)
        const reader = new FileReader();
        reader.onload = function(e) {
            docData.fileData = e.target.result;
            saveDocumentData();
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        saveDocumentData();
    }
    
    function saveDocumentData() {
        kycData.documents[docType] = docData;
        
        // Update document count
        updateDocumentStatus(kycData);
        
        localStorage.setItem('kyc_data', JSON.stringify(kycData));
        
        showToast(`${KYC_DOCUMENTS[docType].name} uploaded successfully!`, 'success');
        
        // Close modals
        closeAllModals();
        
        // Reopen KYC modal to show updated status
        setTimeout(() => openKYC(), 300);
        
        // Simulate verification after 2 seconds (demo)
        setTimeout(() => simulateVerification(docType), 2000);
    }
}

// Simulate Verification (Demo)
// NOTE: This is demo/testing code. In production, replace with actual API calls to verification service
function simulateVerification(docType) {
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    
    if (kycData.documents[docType]) {
        // Demo: 90% chance of approval (replace with actual API verification in production)
        const approved = Math.random() > 0.1;
        
        kycData.documents[docType].status = approved ? 'verified' : 'rejected';
        
        if (!approved) {
            kycData.documents[docType].rejectionReason = 'Document not clear. Please upload a better quality image.';
        }
        
        // Update verification status
        updateDocumentStatus(kycData);
        
        localStorage.setItem('kyc_data', JSON.stringify(kycData));
        
        showToast(
            approved ? `${KYC_DOCUMENTS[docType].name} verified!` : `${KYC_DOCUMENTS[docType].name} rejected. Please re-upload.`,
            approved ? 'success' : 'error'
        );
        
        updateKYCStatus();
    }
}

// Update Document Status
function updateDocumentStatus(kycData) {
    const requiredDocs = Object.entries(KYC_DOCUMENTS).filter(([_, doc]) => doc.required);
    const verifiedDocs = requiredDocs.filter(([key, _]) => kycData.documents?.[key]?.status === 'verified');
    
    // Update document count
    const docStatus = document.getElementById('docStatus');
    if (docStatus) {
        docStatus.textContent = `${verifiedDocs.length}/${requiredDocs.length} Verified`;
    }
    
    // Check if all required documents are verified
    if (verifiedDocs.length === requiredDocs.length) {
        kycData.verified = true;
        kycData.trustScore = 95;
        kycData.verifiedAt = Date.now();
        showToast('KYC verification complete! You can now go online.', 'success');
    }
}

// Open Languages Modal
function openLanguagesModal() {
    const modal = createModal('Language Skills', getLanguagesContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Languages Content
function getLanguagesContent() {
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    const selectedLanguages = kycData.languages || [];
    
    let html = '<div class="languages-form">';
    
    html += '<p style="margin-bottom: 1rem;">Select languages you can speak and their proficiency levels:</p>';
    
    LANGUAGES.forEach(lang => {
        const selected = selectedLanguages.find(l => l.code === lang.code);
        
        html += `
            <div class="language-selector">
                <div class="language-check">
                    <input type="checkbox" id="lang-${lang.code}" ${selected ? 'checked' : ''} 
                        onchange="toggleLanguage('${lang.code}', '${lang.name}')">
                    <label for="lang-${lang.code}">${lang.name}</label>
                </div>
                ${selected ? `
                    <select id="prof-${lang.code}" class="proficiency-select" onchange="updateProficiency('${lang.code}')">
                        ${PROFICIENCY_LEVELS.map(level => 
                            `<option value="${level}" ${selected.proficiency === level ? 'selected' : ''}>${level}</option>`
                        ).join('')}
                    </select>
                ` : ''}
            </div>
        `;
    });
    
    html += '<button class="btn-primary" onclick="saveLanguages()" style="margin-top: 1rem;">Save Languages</button>';
    html += '</div>';
    
    return html;
}

// Toggle Language
function toggleLanguage(code, name) {
    const checkbox = document.getElementById(`lang-${code}`);
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    
    if (!kycData.languages) {
        kycData.languages = [];
    }
    
    if (checkbox.checked) {
        // Add language
        if (!kycData.languages.find(l => l.code === code)) {
            kycData.languages.push({
                code: code,
                name: name,
                proficiency: 'Basic'
            });
        }
    } else {
        // Remove language
        kycData.languages = kycData.languages.filter(l => l.code !== code);
    }
    
    localStorage.setItem('kyc_data', JSON.stringify(kycData));
    
    // Refresh modal
    closeAllModals();
    setTimeout(() => openLanguagesModal(), 100);
}

// Update Proficiency
function updateProficiency(code) {
    const select = document.getElementById(`prof-${code}`);
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    
    const lang = kycData.languages.find(l => l.code === code);
    if (lang) {
        lang.proficiency = select.value;
        localStorage.setItem('kyc_data', JSON.stringify(kycData));
    }
}

// Save Languages
function saveLanguages() {
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    const count = kycData.languages?.length || 0;
    
    // Update UI
    const languageCount = document.getElementById('languageCount');
    if (languageCount) {
        languageCount.textContent = `${count} Language${count !== 1 ? 's' : ''}`;
    }
    
    showToast('Language skills updated!', 'success');
    closeAllModals();
    
    // Reopen KYC if it was open
    setTimeout(() => openKYC(), 300);
}

// Open Documents
function openDocuments() {
    openKYC(); // Same as KYC modal
}

// Create Modal Helper
function createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${title}</h2>
                <button class="modal-close" onclick="closeModal(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                ${content}
            </div>
        </div>
    `;
    
    // Close on backdrop click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal(modal.querySelector('.modal-close'));
        }
    });
    
    return modal;
}

// Close Modal
function closeModal(button) {
    const modal = button.closest('.modal');
    if (modal) {
        modal.remove();
    }
}

// Close All Modals
function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => modal.remove());
}

// Add styles for KYC components
const kycStyles = document.createElement('style');
kycStyles.textContent = `
    .kyc-container {
        max-width: 100%;
    }
    
    .verification-status {
        text-align: center;
        padding: 1.5rem;
        background: var(--bg-color);
        border-radius: 8px;
        margin-bottom: 1.5rem;
    }
    
    .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-radius: 20px;
        font-weight: bold;
        margin-bottom: 0.5rem;
    }
    
    .documents-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 1rem;
    }
    
    .document-card {
        background: var(--bg-color);
        padding: 1rem;
        border-radius: 8px;
        border: 2px solid var(--border-color);
    }
    
    .doc-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }
    
    .doc-header i {
        font-size: 1.5rem;
        color: var(--primary-color);
    }
    
    .doc-header h4 {
        flex: 1;
        font-size: 1rem;
    }
    
    .doc-header .required {
        color: var(--danger-color);
        font-weight: bold;
    }
    
    .doc-status {
        margin-bottom: 0.5rem;
    }
    
    .doc-expiry {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin-bottom: 0.5rem;
    }
    
    .rejection-reason {
        color: var(--danger-color);
        font-size: 0.85rem;
        margin-bottom: 0.5rem;
    }
    
    .languages-section h3 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }
    
    .languages-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    
    .language-item {
        background: var(--bg-color);
        padding: 0.5rem 1rem;
        border-radius: 20px;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .language-name {
        font-weight: 600;
    }
    
    .certification-badge {
        text-align: center;
        padding: 1rem;
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }
    
    .certification-badge i {
        font-size: 1.5rem;
    }
    
    .language-selector {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: var(--bg-color);
        border-radius: 8px;
        margin-bottom: 0.5rem;
    }
    
    .language-check {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .language-check input[type="checkbox"] {
        width: 20px;
        height: 20px;
        cursor: pointer;
    }
    
    .proficiency-select {
        padding: 0.5rem;
        border: 2px solid var(--border-color);
        border-radius: 6px;
        background: var(--card-bg);
        color: var(--text-primary);
        cursor: pointer;
    }
`;
document.head.appendChild(kycStyles);
