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
    VEHICLE_PERMIT: {
        name: 'Vehicle Permit',
        icon: 'fa-file-contract',
        required: true,
        fields: ['permitNumber', 'expiryDate']
    },
    ROAD_TAX: {
        name: 'Road Tax Receipt',
        icon: 'fa-receipt',
        required: true,
        fields: ['taxReceiptNumber', 'expiryDate']
    },
    VEHICLE_PHOTOS: {
        name: 'Vehicle Photos',
        icon: 'fa-images',
        required: true,
        fields: ['vehicleFrontPhotoRef', 'vehicleBackPhotoRef']
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
const ADMIN_DOCUMENT_QUEUE_KEY = 'goindiaride_admin_document_queue_v1';
const DRIVER_FALLBACK_ID = 'default_driver';

function getDriverProfile() {
    try {
        const currentDriver = JSON.parse(localStorage.getItem('currentDriver') || '{}');
        if (currentDriver && currentDriver.id) {
            return currentDriver;
        }
    } catch (error) {
        // ignore
    }

    try {
        const driverData = JSON.parse(localStorage.getItem('driver_data') || '{}');
        if (driverData && driverData.id) {
            return driverData;
        }
    } catch (error) {
        // ignore
    }

    return { id: DRIVER_FALLBACK_ID, name: 'Driver' };
}

function getDriverKycStorageKey(driverId) {
    return 'kyc_data_' + String(driverId || DRIVER_FALLBACK_ID);
}

function requiredDocumentKeys() {
    return Object.entries(KYC_DOCUMENTS)
        .filter(([, value]) => Boolean(value.required))
        .map(([key]) => key);
}

function createKycSkeleton() {
    return {
        verified: false,
        trustScore: 0,
        documents: {},
        languages: [],
        requiredVerifiedCount: 0,
        requiredTotalCount: requiredDocumentKeys().length,
        updatedAt: Date.now()
    };
}

function ensureKycShape(raw) {
    const kycData = raw && typeof raw === 'object' ? raw : createKycSkeleton();

    if (!kycData.documents || typeof kycData.documents !== 'object') {
        kycData.documents = {};
    }
    if (!Array.isArray(kycData.languages)) {
        kycData.languages = [];
    }

    const requiredKeys = requiredDocumentKeys();
    const verifiedCount = requiredKeys.filter((key) => {
        return kycData.documents[key] && kycData.documents[key].status === 'verified';
    }).length;

    kycData.requiredTotalCount = requiredKeys.length;
    kycData.requiredVerifiedCount = verifiedCount;
    kycData.verified = verifiedCount === requiredKeys.length;

    if (!Number.isFinite(Number(kycData.trustScore))) {
        kycData.trustScore = kycData.verified ? 98 : Math.max(40, verifiedCount * 8);
    }

    return kycData;
}

function loadKycData() {
    const driver = getDriverProfile();
    const storageKey = getDriverKycStorageKey(driver.id);

    try {
        const scopedRaw = localStorage.getItem(storageKey);
        if (scopedRaw) {
            return ensureKycShape(JSON.parse(scopedRaw));
        }
    } catch (error) {
        // ignore and fallback
    }

    try {
        const legacyRaw = localStorage.getItem('kyc_data');
        if (legacyRaw) {
            const legacy = ensureKycShape(JSON.parse(legacyRaw));
            localStorage.setItem(storageKey, JSON.stringify(legacy));
            return legacy;
        }
    } catch (error) {
        // ignore and fallback
    }

    return createKycSkeleton();
}

function syncDriverRegistry(kycData) {
    try {
        const driver = getDriverProfile();
        const drivers = JSON.parse(localStorage.getItem('drivers') || '[]');

        if (!Array.isArray(drivers) || !driver.id) {
            return;
        }

        const index = drivers.findIndex((item) => String(item.id) === String(driver.id));
        if (index === -1) {
            return;
        }

        drivers[index] = {
            ...drivers[index],
            kycVerified: Boolean(kycData.verified),
            trustScore: Number(kycData.trustScore || 0),
            documentsVerifiedCount: Number(kycData.requiredVerifiedCount || 0),
            documentsRequiredCount: Number(kycData.requiredTotalCount || requiredDocumentKeys().length),
            kycUpdatedAt: new Date().toISOString()
        };

        localStorage.setItem('drivers', JSON.stringify(drivers));
    } catch (error) {
        // ignore
    }
}

function saveKycData(rawData) {
    const kycData = ensureKycShape(rawData);
    const driver = getDriverProfile();
    const storageKey = getDriverKycStorageKey(driver.id);

    try {
        localStorage.setItem(storageKey, JSON.stringify(kycData));
        localStorage.setItem('kyc_data', JSON.stringify(kycData));
    } catch (error) {
        // ignore
    }

    syncDriverRegistry(kycData);
}

function sanitizeText(value) {
    return String(value || '').trim();
}

function getDocumentLabel(docType) {
    return KYC_DOCUMENTS[docType] ? KYC_DOCUMENTS[docType].name : String(docType || 'Document');
}

function runAutomaticAIDocumentScreening(docType, docData) {
    const checks = [];
    const scoreParts = [];

    const fileName = sanitizeText(docData.fileName).toLowerCase();
    const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
    const size = Number(docData.fileSize || 0);
    const hasExpiry = Boolean(docData.expiryDate);

    const allowed = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
    if (!allowed.includes(extension)) {
        checks.push('Unsupported file format');
        scoreParts.push(-35);
    } else {
        scoreParts.push(18);
    }

    if (size < 12 * 1024) {
        checks.push('File too small for verification');
        scoreParts.push(-30);
    } else if (size > 15 * 1024 * 1024) {
        checks.push('File too large, likely invalid upload');
        scoreParts.push(-20);
    } else {
        scoreParts.push(16);
    }

    const textFields = Object.entries(docData)
        .filter(([key, value]) => key !== 'fileData' && typeof value === 'string' && key !== 'fileName')
        .map(([, value]) => sanitizeText(value))
        .join(' ');

    if (!textFields || textFields.length < 6) {
        checks.push('Document fields incomplete');
        scoreParts.push(-28);
    } else {
        scoreParts.push(14);
    }

    if (hasExpiry) {
        const expiryDate = new Date(docData.expiryDate + 'T23:59:59');
        const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

        if (Number.isFinite(daysLeft) && daysLeft < 0) {
            checks.push('Document already expired');
            scoreParts.push(-38);
        } else if (Number.isFinite(daysLeft) && daysLeft <= 30) {
            checks.push('Document near expiry');
            scoreParts.push(-12);
        } else {
            scoreParts.push(12);
        }
    }

    if (docType === 'DRIVING_LICENSE') {
        const normalized = sanitizeText(docData.licenseNumber).replace(/-/g, '').toUpperCase();
        if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,16}$/.test(normalized)) {
            checks.push('Driving license format mismatch');
            scoreParts.push(-30);
        } else {
            scoreParts.push(20);
        }
    }

    if (docType === 'AADHAAR') {
        const normalized = sanitizeText(docData.aadhaarNumber).replace(/\s+/g, '');
        if (!/^[0-9]{12}$/.test(normalized)) {
            checks.push('Aadhaar number invalid');
            scoreParts.push(-26);
        } else {
            scoreParts.push(18);
        }
    }

    if (docType === 'PAN') {
        const normalized = sanitizeText(docData.panNumber).toUpperCase();
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalized)) {
            checks.push('PAN format invalid');
            scoreParts.push(-24);
        } else {
            scoreParts.push(18);
        }
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(50 + scoreParts.reduce((sum, item) => sum + item, 0) / 2)));
    let decision = 'approve';

    if (finalScore < 45) {
        decision = 'reject';
    } else if (finalScore < 70) {
        decision = 'review';
    }

    return {
        score: finalScore,
        decision,
        reason: checks.length ? checks.join(', ') : 'Document structure and metadata look valid'
    };
}

function queueForAdminReview(docType, docData) {
    const driver = getDriverProfile();
    let queue = [];

    try {
        const raw = JSON.parse(localStorage.getItem(ADMIN_DOCUMENT_QUEUE_KEY) || '[]');
        queue = Array.isArray(raw) ? raw : [];
    } catch (error) {
        queue = [];
    }

    const existingIndex = queue.findIndex((item) => {
        return String(item.driverId) === String(driver.id) && String(item.docType) === String(docType);
    });

    const entry = {
        id: existingIndex !== -1 ? queue[existingIndex].id : ('queue_' + Date.now() + '_' + Math.floor(Math.random() * 10000)),
        driverId: driver.id || DRIVER_FALLBACK_ID,
        driverName: driver.name || driver.fullname || 'Driver',
        docType,
        docName: getDocumentLabel(docType),
        status: 'pending_admin',
        fileName: docData.fileName || '',
        fileSize: Number(docData.fileSize || 0),
        aiScore: Number(docData.aiScore || 0),
        aiDecision: docData.aiDecision || 'review',
        aiReason: docData.aiReason || '',
        submittedAt: new Date().toISOString()
    };

    if (existingIndex === -1) {
        queue.unshift(entry);
    } else {
        queue[existingIndex] = { ...queue[existingIndex], ...entry };
    }

    localStorage.setItem(ADMIN_DOCUMENT_QUEUE_KEY, JSON.stringify(queue));

    if (window.PortalConnector && typeof PortalConnector.broadcastToAll === 'function') {
        PortalConnector.broadcastToAll({
            type: 'driver_document_submitted',
            title: 'Driver Document Submitted',
            message: entry.driverName + ' uploaded ' + entry.docName + ' for admin approval',
            sourcePortal: 'driver',
            metadata: {
                driverId: entry.driverId,
                docType: entry.docType,
                aiScore: entry.aiScore
            }
        });
    }
}

function getDocumentStatusMeta(status) {
    const value = String(status || 'pending').toLowerCase();

    if (value === 'verified') {
        return { className: 'success', label: 'Verified' };
    }

    if (value === 'rejected' || value === 'rejected_ai') {
        return { className: 'danger', label: 'Rejected' };
    }

    if (value === 'pending_admin') {
        return { className: 'warning', label: 'Pending Admin Approval' };
    }

    if (value === 'ai_review') {
        return { className: 'warning', label: 'AI Review Required' };
    }

    return { className: 'warning', label: 'Pending' };
}

// Open KYC Modal
function openKYC() {
    const modal = createModal('KYC Verification', getKYCContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get KYC Content
function getKYCContent() {
    const kycData = loadKycData();
    
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
        const statusMeta = getDocumentStatusMeta(status);
        
        html += `
            <div class="document-card">
                <div class="doc-header">
                    <i class="fas ${doc.icon}"></i>
                    <h4>${doc.name}</h4>
                    ${doc.required ? '<span class="required">*</span>' : ''}
                </div>
                <div class="doc-status badge-${statusMeta.className}">
                    ${statusMeta.label}
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
    const kycData = loadKycData();
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

    const kycData = loadKycData();
    if (!kycData.documents) {
        kycData.documents = {};
    }

    const docData = {
        status: 'pending_admin',
        uploadedAt: Date.now(),
        uploaded: true
    };

    for (const [key, value] of formData.entries()) {
        docData[key] = value;
    }

    const fileInput = document.getElementById(`file-${docType}`);

    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        showToast('Please upload a document file.', 'error');
        return;
    }

    docData.fileName = fileInput.files[0].name;
    docData.fileSize = fileInput.files[0].size;

    const reader = new FileReader();
    reader.onload = function(e) {
        docData.fileData = e.target.result;
        finalizeDocumentSubmission();
    };
    reader.readAsDataURL(fileInput.files[0]);

    function finalizeDocumentSubmission() {
        const aiResult = runAutomaticAIDocumentScreening(docType, docData);
        docData.aiDecision = aiResult.decision;
        docData.aiScore = aiResult.score;
        docData.aiReason = aiResult.reason;

        if (aiResult.decision === 'reject') {
            docData.status = 'rejected_ai';
            docData.rejectionReason = 'AI verification failed: ' + aiResult.reason;
        } else {
            docData.status = 'pending_admin';
            docData.rejectionReason = '';
            queueForAdminReview(docType, docData);
        }

        kycData.documents[docType] = docData;
        const normalizedKyc = updateDocumentStatus(kycData);
        saveKycData(normalizedKyc);

        if (aiResult.decision === 'reject') {
            showToast(KYC_DOCUMENTS[docType].name + ' rejected by AI screening. Re-upload clear valid document.', 'error');
        } else {
            showToast(KYC_DOCUMENTS[docType].name + ' uploaded. AI score ' + aiResult.score + '. Sent to admin for final approval.', 'success');
        }

        if (normalizedKyc.verified) {
            showToast('All mandatory documents verified. KYC complete.', 'success');
        }

        closeAllModals();
        setTimeout(() => openKYC(), 250);

        if (typeof updateKYCStatus === 'function') {
            updateKYCStatus();
        }
    }
}

// Update Document Status
function updateDocumentStatus(rawData) {
    const kycData = ensureKycShape(rawData);
    const requiredDocs = requiredDocumentKeys();
    const verifiedDocs = requiredDocs.filter((key) => kycData.documents?.[key]?.status === 'verified');

    kycData.requiredVerifiedCount = verifiedDocs.length;
    kycData.requiredTotalCount = requiredDocs.length;
    kycData.verified = verifiedDocs.length === requiredDocs.length;

    if (kycData.verified) {
        kycData.trustScore = Math.max(95, Number(kycData.trustScore || 0));
        kycData.verifiedAt = Date.now();
    } else {
        kycData.trustScore = Math.max(35, Math.min(94, verifiedDocs.length * 8 + 30));
        delete kycData.verifiedAt;
    }

    const docStatus = document.getElementById('docStatus');
    if (docStatus) {
        docStatus.textContent = `${verifiedDocs.length}/${requiredDocs.length} Verified`;
    }

    return kycData;
}

// Open Languages Modal
function openLanguagesModal() {
    const modal = createModal('Language Skills', getLanguagesContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Languages Content
function getLanguagesContent() {
    const kycData = loadKycData();
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
    const kycData = loadKycData();
    
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
    
    saveKycData(kycData);
    
    // Refresh modal
    closeAllModals();
    setTimeout(() => openLanguagesModal(), 100);
}

// Update Proficiency
function updateProficiency(code) {
    const select = document.getElementById(`prof-${code}`);
    const kycData = loadKycData();
    
    const lang = kycData.languages.find(l => l.code === code);
    if (lang) {
        lang.proficiency = select.value;
        saveKycData(kycData);
    }
}

// Save Languages
function saveLanguages() {
    const kycData = loadKycData();
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

function refreshKycSummaryWidgets() {
    const normalized = updateDocumentStatus(loadKycData());
    saveKycData(normalized);

    if (typeof updateKYCStatus === 'function') {
        updateKYCStatus();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    refreshKycSummaryWidgets();
});

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
