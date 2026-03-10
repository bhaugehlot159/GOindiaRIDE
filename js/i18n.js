/**
 * GO India RIDE - Internationalization (i18n) System
 * Multi-language and currency support
 */

// Language translations
const translations = {
    en: {
        // Navbar
        'nav.features': 'Features',
        'nav.how': 'How It Works',
        'nav.pricing': 'Pricing',
        'nav.contact': 'Contact',
        'nav.login': 'Login',
        'nav.signup': 'Sign Up',
        
        // Hero
        'hero.title': 'GO India RIDE',
        'hero.subtitle': 'Your Trusted Ride Partner Across India',
        'hero.tagline': 'Safe, Affordable Rides for International & Domestic Travelers',
        'hero.book': 'Book a Ride',
        'hero.driver': 'Become a Driver',
        
        // Welcome Banner
        'banner.welcome': 'Welcome International Travelers!',
        'banner.text': 'Experience safe and comfortable rides across India with English-speaking drivers',
        
        // Features
        'features.title': 'Why Choose GO India RIDE?',
        'features.safe': 'Safe & Secure',
        'features.safe.desc': 'Verified drivers and real-time tracking ensure your safety on every ride.',
        'features.price': 'Best Prices',
        'features.price.desc': 'Transparent pricing with no hidden charges. Get the best deal every time.',
        'features.support': '24/7 Support',
        'features.support.desc': 'Our customer support team is always available to help you.',
        'features.coverage': '50+ Districts',
        'features.coverage.desc': 'Available across all 50 districts of Rajasthan with coverage in 5000+ locations.',
        'features.quality': 'Quality Service',
        'features.quality.desc': 'Professional drivers with 4.5+ ratings and well-maintained vehicles.',
        'features.pickup': 'Quick Pickup',
        'features.pickup.desc': 'Average pickup time of 2-3 minutes. Fast, reliable, and convenient.',
        
        // Trust Badges
        'trust.tourists': 'Safe for Tourists',
        'trust.english': 'English Speaking Drivers',
        'trust.fixed': 'Fixed Prices',
        
        // Services
        'services.airport': 'Airport Pickup',
        'services.hotel': 'Hotel Transfer',
        'services.tour': 'City Tour',
        
        // Booking
        'booking.title': 'Book Your Ride',
        'booking.pickup': 'Pickup Location',
        'booking.dropoff': 'Drop-off Location',
        'booking.date': 'Ride Date & Time',
        'booking.passengers': 'Number of Passengers',
        'booking.ridetype': 'Select Ride Type',
        'booking.confirm': 'Confirm Booking',
        'booking.finding': 'Finding your driver...',
        
        // Status
        'status.pending': 'Pending',
        'status.assigned': 'Driver Assigned',
        'status.enroute': 'Driver En Route',
        'status.started': 'Ride Started',
        'status.completed': 'Ride Completed',
        
        // Payment
        'payment.title': 'Payment',
        'payment.fare': 'Total Fare',
        'payment.pay': 'Pay Now',
        'payment.cash': 'Cash',
        'payment.upi': 'UPI',
        'payment.card': 'Card',
        
        // Common
        'common.close': 'Close',
        'common.submit': 'Submit',
        'common.cancel': 'Cancel',
        'common.download': 'Download',
        'common.share': 'Share',
        'common.receipt': 'Receipt'
    },
    
    hi: {
        // Navbar
        'nav.features': 'सुविधाएं',
        'nav.how': 'कैसे काम करता है',
        'nav.pricing': 'मूल्य निर्धारण',
        'nav.contact': 'संपर्क करें',
        'nav.login': 'लॉगिन',
        'nav.signup': 'साइन अप करें',
        
        // Hero
        'hero.title': 'GO India RIDE',
        'hero.subtitle': 'भारत भर में आपका विश्वसनीय सवारी साथी',
        'hero.tagline': 'अंतर्राष्ट्रीय और घरेलू यात्रियों के लिए सुरक्षित, किफायती सवारी',
        'hero.book': 'सवारी बुक करें',
        'hero.driver': 'ड्राइवर बनें',
        
        // Welcome Banner
        'banner.welcome': 'अंतर्राष्ट्रीय यात्रियों का स्वागत है!',
        'banner.text': 'अंग्रेजी बोलने वाले ड्राइवरों के साथ भारत भर में सुरक्षित और आरामदायक यात्रा का अनुभव करें',
        
        // Features
        'features.title': 'GO India RIDE क्यों चुनें?',
        'features.safe': 'सुरक्षित और सुरक्षित',
        'features.safe.desc': 'सत्यापित ड्राइवर और वास्तविक समय ट्रैकिंग हर सवारी पर आपकी सुरक्षा सुनिश्चित करते हैं।',
        'features.price': 'सर्वोत्तम मूल्य',
        'features.price.desc': 'बिना किसी छिपे शुल्क के पारदर्शी मूल्य निर्धारण।',
        'features.support': '24/7 समर्थन',
        'features.support.desc': 'हमारी ग्राहक सहायता टीम हमेशा आपकी मदद के लिए उपलब्ध है।',
        
        // Trust Badges
        'trust.tourists': 'पर्यटकों के लिए सुरक्षित',
        'trust.english': 'अंग्रेजी बोलने वाले ड्राइवर',
        'trust.fixed': 'निश्चित कीमतें',
        
        // Booking
        'booking.title': 'अपनी सवारी बुक करें',
        'booking.pickup': 'पिकअप स्थान',
        'booking.dropoff': 'ड्रॉप-ऑफ स्थान',
        'booking.confirm': 'बुकिंग की पुष्टि करें',
        
        // Common
        'common.close': 'बंद करें',
        'common.submit': 'जमा करें',
        'common.cancel': 'रद्द करें'
    },
    
    fr: {
        'hero.subtitle': 'Votre Partenaire de Voyage de Confiance à Travers l\'Inde',
        'hero.tagline': 'Trajets Sûrs et Abordables pour Voyageurs Internationaux et Locaux',
        'hero.book': 'Réserver un Trajet',
        'banner.welcome': 'Bienvenue aux Voyageurs Internationaux!',
        'features.safe': 'Sûr et Sécurisé',
        'trust.tourists': 'Sûr pour les Touristes',
        'trust.english': 'Chauffeurs Anglophones',
        'booking.confirm': 'Confirmer la Réservation'
    },
    
    de: {
        'hero.subtitle': 'Ihr Vertrauenswürdiger Fahrpartner in Ganz Indien',
        'hero.tagline': 'Sichere, Erschwingliche Fahrten für Internationale und Inländische Reisende',
        'hero.book': 'Fahrt Buchen',
        'banner.welcome': 'Willkommen Internationale Reisende!',
        'features.safe': 'Sicher und Geschützt',
        'trust.tourists': 'Sicher für Touristen',
        'trust.english': 'Englischsprachige Fahrer',
        'booking.confirm': 'Buchung Bestätigen'
    },
    
    es: {
        'hero.subtitle': 'Su Socio de Viaje de Confianza en Toda la India',
        'hero.tagline': 'Viajes Seguros y Asequibles para Viajeros Internacionales y Locales',
        'hero.book': 'Reservar un Viaje',
        'banner.welcome': '¡Bienvenidos Viajeros Internacionales!',
        'features.safe': 'Seguro y Protegido',
        'trust.tourists': 'Seguro para Turistas',
        'trust.english': 'Conductores que Hablan Inglés',
        'booking.confirm': 'Confirmar Reserva'
    },
    
    ja: {
        'hero.subtitle': 'インド全土の信頼できる乗車パートナー',
        'hero.tagline': '国際および国内旅行者向けの安全で手頃な乗車',
        'hero.book': '乗車を予約',
        'banner.welcome': '国際旅行者の皆様へようこそ！',
        'features.safe': '安全・安心',
        'trust.tourists': '観光客に安全',
        'trust.english': '英語を話すドライバー',
        'booking.confirm': '予約を確認'
    },
    
    zh: {
        'hero.subtitle': '您在印度各地值得信赖的出行伙伴',
        'hero.tagline': '为国际和国内旅客提供安全、实惠的出行服务',
        'hero.book': '预订行程',
        'banner.welcome': '欢迎国际旅客！',
        'features.safe': '安全可靠',
        'trust.tourists': '游客安全',
        'trust.english': '英语司机',
        'booking.confirm': '确认预订'
    },
    
    ar: {
        'hero.subtitle': 'شريك السفر الموثوق به في جميع أنحاء الهند',
        'hero.tagline': 'رحلات آمنة وبأسعار معقولة للمسافرين الدوليين والمحليين',
        'hero.book': 'احجز رحلة',
        'banner.welcome': 'مرحباً بالمسافرين الدوليين!',
        'features.safe': 'آمن ومحمي',
        'trust.tourists': 'آمن للسياح',
        'trust.english': 'سائقون يتحدثون الإنجليزية',
        'booking.confirm': 'تأكيد الحجز'
    }
};

// Currency conversion rates (relative to INR)
// Note: These are approximate rates. For production, consider using a live exchange rate API
// Last updated: January 2026
const currencyRates = {
    INR: { symbol: '₹', rate: 1, name: 'Indian Rupee' },
    USD: { symbol: '$', rate: 0.012, name: 'US Dollar' },
    EUR: { symbol: '€', rate: 0.011, name: 'Euro' },
    GBP: { symbol: '£', rate: 0.0095, name: 'British Pound' },
    AED: { symbol: 'د.إ', rate: 0.044, name: 'UAE Dirham' },
    JPY: { symbol: '¥', rate: 1.78, name: 'Japanese Yen' }
};

// Current language and currency
let currentLang = localStorage.getItem('goride_language') || 'en';
let currentCurrency = localStorage.getItem('goride_currency') || 'INR';

// Get translation
function t(key, lang = currentLang) {
    const langData = translations[lang] || translations['en'];
    return langData[key] || translations['en'][key] || key;
}

// Convert currency
function convertCurrency(amountINR, targetCurrency = currentCurrency) {
    const rate = currencyRates[targetCurrency]?.rate || 1;
    const converted = amountINR * rate;
    const symbol = currencyRates[targetCurrency]?.symbol || '₹';
    
    // Format based on currency
    if (targetCurrency === 'JPY') {
        return `${symbol}${Math.round(converted)}`;
    } else {
        return `${symbol}${converted.toFixed(2)}`;
    }
}

// Set language
function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        localStorage.setItem('goride_language', lang);
        updatePageLanguage();
    }
}

// Set currency
function setCurrency(currency) {
    if (currencyRates[currency]) {
        currentCurrency = currency;
        localStorage.setItem('goride_currency', currency);
        updatePageCurrency();
    }
}

// Update all elements with data-lang attribute
function updatePageLanguage() {
    document.querySelectorAll('[data-lang]').forEach(element => {
        const key = element.getAttribute('data-lang');
        let translation = t(key);

        if (typeof translation !== 'string') {
            translation = String(translation || '');
        }

        if (translation === key) {
            const englishFallback = translations.en[key];
            if (typeof englishFallback === 'string' && englishFallback.trim()) {
                translation = englishFallback;
            }
        }

        if (!translation.trim()) {
            const englishFallback = translations.en[key];
            if (typeof englishFallback === 'string' && englishFallback.trim()) {
                translation = englishFallback;
            } else {
                return;
            }
        }

        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            element.placeholder = translation;
        } else {
            element.textContent = translation;
        }
    });
}

// Update all currency displays
function updatePageCurrency() {
    document.querySelectorAll('[data-currency]').forEach(element => {
        const amountINR = parseFloat(element.getAttribute('data-currency'));
        element.textContent = convertCurrency(amountINR);
    });
}

// Create language switcher HTML
function createLanguageSwitcher() {
    const flags = {
        en: '🇬🇧',
        hi: '🇮🇳',
        fr: '🇫🇷',
        de: '🇩🇪',
        es: '🇪🇸',
        ja: '🇯🇵',
        zh: '🇨🇳',
        ar: '🇸🇦'
    };

    const languageNames = {
        en: 'English',
        hi: 'Hindi',
        fr: 'French',
        de: 'German',
        es: 'Spanish',
        ja: 'Japanese',
        zh: 'Chinese',
        ar: 'Arabic'
    };

    let html = '<div class="language-switcher" style="position: relative; display: inline-block;">';
    html += `<button class="lang-btn" style="background: rgba(255,255,255,0.78); border: 1px solid rgba(11,31,58,0.22); color: #0B1F3A; padding: 0.42rem 0.65rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem; font-weight: 700; white-space: nowrap;">`;
    html += `${flags[currentLang]} ${languageNames[currentLang] || currentLang.toUpperCase()} ▼</button>`;
    html += '<div class="lang-dropdown" style="display: none; position: absolute; top: 100%; right: 0; background: white; border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.2); margin-top: 0.5rem; min-width: 180px; max-width: calc(100vw - 24px); z-index: 1000;">';

    Object.keys(flags).forEach(lang => {
        html += `<button class="lang-option" data-lang="${lang}" style="display: block; width: 100%; text-align: left; padding: 0.7rem 0.85rem; border: none; background: none; cursor: pointer; font-size: 0.9rem; color: #333; transition: all 0.3s;">`;
        html += `${flags[lang]} ${languageNames[lang] || lang.toUpperCase()}</button>`;
    });

    html += '</div></div>';
    return html;
}

// Create currency switcher HTML
function createCurrencySwitcher() {
    let html = '<div class="currency-switcher" style="position: relative; display: inline-block;">';
    html += `<button class="currency-btn" style="background: rgba(255,255,255,0.78); border: 1px solid rgba(11,31,58,0.22); color: #0B1F3A; padding: 0.42rem 0.65rem; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.9rem; white-space: nowrap;">`;
    html += `${currencyRates[currentCurrency].symbol} ${currencyRates[currentCurrency].name} ▼</button>`;
    html += '<div class="currency-dropdown" style="display: none; position: absolute; top: 100%; right: 0; background: white; border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.2); margin-top: 0.5rem; min-width: 210px; max-width: calc(100vw - 24px); z-index: 1000;">';

    Object.keys(currencyRates).forEach(curr => {
        html += `<button class="currency-option" data-currency="${curr}" style="display: block; width: 100%; text-align: left; padding: 0.7rem 0.85rem; border: none; background: none; cursor: pointer; font-size: 0.88rem; color: #333; transition: all 0.3s;">`;
        html += `${currencyRates[curr].symbol} ${currencyRates[curr].name} (${curr})</button>`;
    });

    html += '</div></div>';
    return html;
}

// Initialize i18n system
function initI18n() {
    // Add switchers to navbar if exists
    const navbarRight = document.querySelector('.navbar-links') || document.querySelector('.navbar-right');
    if (navbarRight) {
        const switchersDiv = document.createElement('div');
        switchersDiv.className = 'navbar-switchers';
        switchersDiv.style.display = 'flex';
        switchersDiv.style.alignItems = 'center';
        switchersDiv.style.gap = '0.5rem';
        switchersDiv.style.flexWrap = 'wrap';
        switchersDiv.style.maxWidth = '100%';
        switchersDiv.innerHTML = createLanguageSwitcher() + createCurrencySwitcher();
        navbarRight.appendChild(switchersDiv);
        
        // Add event listeners
        const langBtn = switchersDiv.querySelector('.lang-btn');
        const langDropdown = switchersDiv.querySelector('.lang-dropdown');
        langBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            langDropdown.style.display = langDropdown.style.display === 'none' ? 'block' : 'none';
        });
        
        switchersDiv.querySelectorAll('.lang-option').forEach(btn => {
            btn.addEventListener('click', () => {
                setLanguage(btn.getAttribute('data-lang'));
                langDropdown.style.display = 'none';
            });
            btn.addEventListener('mouseenter', function() {
                this.style.background = '#f0f0f0';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = 'none';
            });
        });
        
        const currencyBtn = switchersDiv.querySelector('.currency-btn');
        const currencyDropdown = switchersDiv.querySelector('.currency-dropdown');
        currencyBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            currencyDropdown.style.display = currencyDropdown.style.display === 'none' ? 'block' : 'none';
        });
        
        switchersDiv.querySelectorAll('.currency-option').forEach(btn => {
            btn.addEventListener('click', () => {
                setCurrency(btn.getAttribute('data-currency'));
                currencyDropdown.style.display = 'none';
            });
            btn.addEventListener('mouseenter', function() {
                this.style.background = '#f0f0f0';
            });
            btn.addEventListener('mouseleave', function() {
                this.style.background = 'none';
            });
        });
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            langDropdown.style.display = 'none';
            currencyDropdown.style.display = 'none';
        });
    }
    
    // Update page with current language and currency
    updatePageLanguage();
    updatePageCurrency();
}

// Initialize on DOM load
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initI18n);
    } else {
        initI18n();
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        t,
        convertCurrency,
        setLanguage,
        setCurrency,
        currentLang,
        currentCurrency
    };
}

