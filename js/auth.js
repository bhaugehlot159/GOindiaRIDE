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
document.getElementById('signupForm')?.addEventListener('submit', function(e) {
    e.preventDefault();

    const fullname = document.getElementById('fullname').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const userType = document.querySelector('input[name="userType"]:checked').value;

    // Validation
    if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
    }

    if (password.length < 6) {
        alert('Password should be at least 6 characters long!');
        return;
    }

    // Create user object
    const userData = {
        fullname,
        email,
        phone,
        password: hashPassword(password),
        userType,
        createdAt: new Date().toISOString(),
        profilePicture: null,
        verified: false
    };

    // If driver, add license number
    if (userType === 'driver') {
        userData.licenseNumber = document.getElementById('licenseNumber').value;
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
document.getElementById('loginForm')?.addEventListener('submit', function(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const users = JSON.parse(localStorage.getItem('users')) || [];
    const user = users.find(u => u.email === email && u.password === hashPassword(password));

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

// Simple password hashing (for demo only, use proper hashing in production)
function hashPassword(password) {
    return btoa(password); // Base64 encoding (NOT secure, for demo only)
}

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
