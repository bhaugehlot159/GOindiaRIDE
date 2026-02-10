// Note: This file is currently not used by the HTML pages, which have inline scripts.
// The security improvements should be applied to the inline scripts in the HTML files.

// Check user type and show/hide driver fields
document.querySelectorAll('input[name="userType"]')?.forEach(radio => {
    radio.addEventListener('change', function() {
        const driverFields = document.getElementById('driverFields');
        if (driverFields) {
            driverFields.style.display = this.value === 'driver' ? 'block' : 'none';
        }
    });
});

// Handle Signup Form
document.getElementById('signupForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const fullname = sanitizeInput(document.getElementById('fullname').value);
    const email = sanitizeEmail(document.getElementById('email').value);
    const phone = sanitizePhone(document.getElementById('phone').value);
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const userType = document.querySelector('input[name="userType"]:checked').value;

    // Validate sanitized inputs
    if (!fullname) {
        alert('Please enter a valid full name');
        return;
    }

    if (!email) {
        alert('Please enter a valid email address');
        return;
    }

    if (!phone) {
        alert('Please enter a valid 10-digit Indian phone number');
        return;
    }

    // Validation
    if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
        alert(passwordValidation.message);
        return;
    }

    // Create user object
    const userData = {
        fullname,
        email,
        phone,
        password: await hashPassword(password),
        userType,
        createdAt: new Date().toISOString(),
        profilePicture: null,
        verified: false
    };

    // If driver, add license number
    if (userType === 'driver') {
        userData.licenseNumber = sanitizeInput(document.getElementById('licenseNumber').value);
        userData.vehicleDetails = null;
        userData.rating = 0;
        userData.earnings = 0;
    }

    // Save to localStorage (in production, send to backend)
    const users = JSON.parse(localStorage.getItem('users')) || [];
    
    // Check if email already exists
    if (users.some(u => u.email === email)) {
        alert('Email already registered!');
        return;
    }

    users.push(userData);
    localStorage.setItem('users', JSON.stringify(users));

    alert('Account created successfully! Please login.');
    window.location.href = 'login.html';
});

// Handle Login Form
document.getElementById('loginForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = sanitizeEmail(document.getElementById('email').value);
    const password = document.getElementById('password').value;

    if (!email) {
        alert('Please enter a valid email address');
        return;
    }

    const users = JSON.parse(localStorage.getItem('users')) || [];
    const user = users.find(u => u.email === email && u.password === await hashPassword(password));

    if (user) {
        // Save current user session
        localStorage.setItem('currentUser', JSON.stringify({
            id: users.indexOf(user),
            email: user.email,
            fullname: user.fullname,
            userType: user.userType,
            phone: user.phone
        }));

        alert('Login successful!');
        
        if (user.userType === 'driver') {
            window.location.href = 'driver-dashboard.html';
        } else {
            window.location.href = 'dashboard.html';
        }
    } else {
        alert('Invalid email or password!');
    }
});

// Password hashing function has been moved to security.js
// It now uses SHA-256 instead of Base64 encoding

// Logout Function
function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = '../index.html';
}

// Check if user is logged in
function checkAuth() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        window.location.href = 'login.html';
    }
    return JSON.parse(currentUser);
}
