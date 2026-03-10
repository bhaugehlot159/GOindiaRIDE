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
    },

    // International coverage (falls back to English where key is missing)
    bn: {},
    pt: {},
    ru: {},
    ko: {},
    it: {},
    tr: {},
    nl: {},
    th: {},
    vi: {},
    id: {},
    ms: {},
    fa: {},
    ur: {},
    mr: {},
    gu: {},
    pa: {},
    ta: {},
    te: {},
    kn: {},
    ml: {},
    or: {},
    as: {},
    pl: {},
    sv: {},
    no: {},
    da: {},
    fi: {},
    he: {},
    uk: {}
};

// Currency conversion rates (relative to INR)
// Note: These are approximate rates. For production, consider using a live exchange rate API
// Last updated: January 2026
const currencyRates = {
    INR: { symbol: '₹', rate: 1, name: 'Indian Rupee' },
    USD: { symbol: '$', rate: 0.012, name: 'United States Dollar' },
    EUR: { symbol: '€', rate: 0.011, name: 'Euro' },
    GBP: { symbol: '£', rate: 0.0095, name: 'British Pound Sterling' },
    AED: { symbol: 'د.إ', rate: 0.044, name: 'UAE Dirham' },
    SAR: { symbol: '﷼', rate: 0.045, name: 'Saudi Riyal' },
    QAR: { symbol: '﷼', rate: 0.044, name: 'Qatari Riyal' },
    KWD: { symbol: 'KD', rate: 0.0037, name: 'Kuwaiti Dinar' },
    OMR: { symbol: '﷼', rate: 0.0046, name: 'Omani Rial' },
    SGD: { symbol: 'S$', rate: 0.016, name: 'Singapore Dollar' },
    AUD: { symbol: 'A$', rate: 0.019, name: 'Australian Dollar' },
    CAD: { symbol: 'C$', rate: 0.016, name: 'Canadian Dollar' },
    NZD: { symbol: 'NZ$', rate: 0.021, name: 'New Zealand Dollar' },
    CHF: { symbol: 'CHF', rate: 0.011, name: 'Swiss Franc' },
    JPY: { symbol: '¥', rate: 1.78, name: 'Japanese Yen' },
    CNY: { symbol: '¥', rate: 0.086, name: 'Chinese Yuan' },
    HKD: { symbol: 'HK$', rate: 0.095, name: 'Hong Kong Dollar' },
    THB: { symbol: '฿', rate: 0.42, name: 'Thai Baht' },
    IDR: { symbol: 'Rp', rate: 195, name: 'Indonesian Rupiah' },
    MYR: { symbol: 'RM', rate: 0.053, name: 'Malaysian Ringgit' },
    ZAR: { symbol: 'R', rate: 0.22, name: 'South African Rand' },
    RUB: { symbol: '₽', rate: 1.09, name: 'Russian Ruble' }
};

const languageCatalog = [
    { code: 'en', flag: '🇬🇧', name: 'English' },
    { code: 'hi', flag: '🇮🇳', name: 'Hindi' },
    { code: 'bn', flag: '🇧🇩', name: 'Bengali' },
    { code: 'mr', flag: '🇮🇳', name: 'Marathi' },
    { code: 'gu', flag: '🇮🇳', name: 'Gujarati' },
    { code: 'pa', flag: '🇮🇳', name: 'Punjabi' },
    { code: 'ta', flag: '🇮🇳', name: 'Tamil' },
    { code: 'te', flag: '🇮🇳', name: 'Telugu' },
    { code: 'kn', flag: '🇮🇳', name: 'Kannada' },
    { code: 'ml', flag: '🇮🇳', name: 'Malayalam' },
    { code: 'or', flag: '🇮🇳', name: 'Odia' },
    { code: 'as', flag: '🇮🇳', name: 'Assamese' },
    { code: 'ar', flag: '🇸🇦', name: 'Arabic' },
    { code: 'fr', flag: '🇫🇷', name: 'French' },
    { code: 'de', flag: '🇩🇪', name: 'German' },
    { code: 'es', flag: '🇪🇸', name: 'Spanish' },
    { code: 'pt', flag: '🇵🇹', name: 'Portuguese' },
    { code: 'ru', flag: '🇷🇺', name: 'Russian' },
    { code: 'ja', flag: '🇯🇵', name: 'Japanese' },
    { code: 'ko', flag: '🇰🇷', name: 'Korean' },
    { code: 'zh', flag: '🇨🇳', name: 'Chinese' },
    { code: 'it', flag: '🇮🇹', name: 'Italian' },
    { code: 'tr', flag: '🇹🇷', name: 'Turkish' },
    { code: 'nl', flag: '🇳🇱', name: 'Dutch' },
    { code: 'pl', flag: '🇵🇱', name: 'Polish' },
    { code: 'sv', flag: '🇸🇪', name: 'Swedish' },
    { code: 'no', flag: '🇳🇴', name: 'Norwegian' },
    { code: 'da', flag: '🇩🇰', name: 'Danish' },
    { code: 'fi', flag: '🇫🇮', name: 'Finnish' },
    { code: 'he', flag: '🇮🇱', name: 'Hebrew' },
    { code: 'fa', flag: '🇮🇷', name: 'Persian' },
    { code: 'ur', flag: '🇵🇰', name: 'Urdu' },
    { code: 'uk', flag: '🇺🇦', name: 'Ukrainian' },
    { code: 'vi', flag: '🇻🇳', name: 'Vietnamese' },
    { code: 'id', flag: '🇮🇩', name: 'Indonesian' },
    { code: 'ms', flag: '🇲🇾', name: 'Malay' },
    { code: 'th', flag: '🇹🇭', name: 'Thai' }
];

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
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.setAttribute('lang', lang);
        }
        updatePageLanguage();
        updateSwitcherButtonLabels();
    }
}

// Set currency
function setCurrency(currency) {
    if (currencyRates[currency]) {
        currentCurrency = currency;
        localStorage.setItem('goride_currency', currency);
        updatePageCurrency();
        updateSwitcherButtonLabels();
    }
}
// Update all elements with data-lang attribute
function updatePageLanguage() {
    document.querySelectorAll('[data-lang]').forEach(element => {
        if (element.closest('.language-switcher') || element.closest('.currency-switcher')) {
            return;
        }

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
        if (!Number.isFinite(amountINR)) {
            return;
        }
        element.textContent = convertCurrency(amountINR);
    });
}

function ensureI18nStyles() {
    if (typeof document === 'undefined' || document.getElementById('goi-i18n-style')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'goi-i18n-style';
    style.textContent = `
        .switcher-compact { display: none; }

        @media (max-width: 768px) {
            .switcher-full { display: none; }
            .switcher-compact { display: inline; }
            .navbar-switchers .lang-btn,
            .navbar-switchers .currency-btn {
                width: 100%;
                justify-content: space-between;
                display: inline-flex;
                align-items: center;
            }
            .navbar-switchers .language-switcher,
            .navbar-switchers .currency-switcher {
                width: 100%;
            }
            .navbar-switchers .lang-dropdown,
            .navbar-switchers .currency-dropdown {
                left: 0;
                right: 0;
                min-width: 0 !important;
                max-width: 100% !important;
            }
        }
    `;
    document.head.appendChild(style);
}
function getLanguageMeta(code) {
    return languageCatalog.find((item) => item.code === code) || languageCatalog[0];
}

function updateSwitcherButtonLabels() {
    const langBtn = document.querySelector('.lang-btn');
    const currencyBtn = document.querySelector('.currency-btn');

    if (langBtn) {
        const selectedLanguage = getLanguageMeta(currentLang);
        langBtn.innerHTML = `<span class="switcher-full">${selectedLanguage.flag} ${selectedLanguage.name}</span><span class="switcher-compact">${selectedLanguage.flag} Language</span> ▼`;
    }

    if (currencyBtn) {
        const selectedCurrency = currencyRates[currentCurrency] ? currentCurrency : 'INR';
        const currencyInfo = currencyRates[selectedCurrency];
        currencyBtn.innerHTML = `<span class="switcher-full">${currencyInfo.symbol} ${currencyInfo.name}</span><span class="switcher-compact">${currencyInfo.symbol} Currency</span> ▼`;
    }
}

// Create language switcher HTML
function createLanguageSwitcher() {
    const selectedLanguage = getLanguageMeta(currentLang);

    let html = '<div class="language-switcher" style="position: relative; display: inline-block;">';
    html += `<button class="lang-btn" style="background: rgba(255,255,255,0.78); border: 1px solid rgba(11,31,58,0.22); color: #0B1F3A; padding: 0.42rem 0.65rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem; font-weight: 700; white-space: nowrap;"><span class="switcher-full">${selectedLanguage.flag} ${selectedLanguage.name}</span><span class="switcher-compact">${selectedLanguage.flag} Language</span> ▼</button>`;
    html += '<div class="lang-dropdown" style="display: none; position: absolute; top: 100%; right: 0; background: white; border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.2); margin-top: 0.5rem; min-width: 220px; max-width: min(94vw, 260px); max-height: 60vh; overflow-y: auto; z-index: 1000;">';

    languageCatalog.forEach((language) => {
        html += `<button class="lang-option" data-lang-code="${language.code}" style="display: block; width: 100%; text-align: left; padding: 0.7rem 0.85rem; border: none; background: none; cursor: pointer; font-size: 0.9rem; color: #333; transition: all 0.3s;">`;
        html += `${language.flag} ${language.name}</button>`;
    });

    html += '</div></div>';
    return html;
}

// Create currency switcher HTML
function createCurrencySwitcher() {
    const selectedCurrency = currencyRates[currentCurrency] ? currentCurrency : 'INR';
    const selectedInfo = currencyRates[selectedCurrency];

    let html = '<div class="currency-switcher" style="position: relative; display: inline-block;">';
    html += `<button class="currency-btn" style="background: rgba(255,255,255,0.78); border: 1px solid rgba(11,31,58,0.22); color: #0B1F3A; padding: 0.42rem 0.65rem; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.9rem; white-space: nowrap;"><span class="switcher-full">${selectedInfo.symbol} ${selectedInfo.name}</span><span class="switcher-compact">${selectedInfo.symbol} Currency</span> ▼</button>`;
    html += '<div class="currency-dropdown" style="display: none; position: absolute; top: 100%; right: 0; background: white; border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.2); margin-top: 0.5rem; min-width: 260px; max-width: min(94vw, 300px); max-height: 60vh; overflow-y: auto; z-index: 1000;">';

    Object.keys(currencyRates).forEach((curr) => {
        const data = currencyRates[curr];
        html += `<button class="currency-option" data-currency-code="${curr}" style="display: block; width: 100%; text-align: left; padding: 0.7rem 0.85rem; border: none; background: none; cursor: pointer; font-size: 0.88rem; color: #333; transition: all 0.3s;">`;
        html += `${data.symbol} ${data.name} (${curr})</button>`;
    });

    html += '</div></div>';
    return html;
}
// Initialize i18n system
function initI18n() {
    ensureI18nStyles();
    // Add switchers to navbar if exists
    const navbarRight = document.querySelector('.navbar-links') || document.querySelector('.navbar-right');
    if (navbarRight) {
        let switchersDiv = navbarRight.querySelector('.navbar-switchers');
        if (!switchersDiv) {
            switchersDiv = document.createElement('div');
            switchersDiv.className = 'navbar-switchers';
            switchersDiv.style.display = 'flex';
            switchersDiv.style.alignItems = 'center';
            switchersDiv.style.gap = '0.5rem';
            switchersDiv.style.flexWrap = 'wrap';
            switchersDiv.style.maxWidth = '100%';
            navbarRight.appendChild(switchersDiv);
        }
        switchersDiv.innerHTML = createLanguageSwitcher() + createCurrencySwitcher();
        
        // Add event listeners
        const langBtn = switchersDiv.querySelector('.lang-btn');
        const langDropdown = switchersDiv.querySelector('.lang-dropdown');
        langBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            langDropdown.style.display = langDropdown.style.display === 'none' ? 'block' : 'none';
        });
        
        switchersDiv.querySelectorAll('.lang-option').forEach(btn => {
            btn.addEventListener('click', () => {
                setLanguage(btn.getAttribute('data-lang-code'));
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
                setCurrency(btn.getAttribute('data-currency-code'));
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
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('lang', currentLang);
    }
    updatePageLanguage();
    updatePageCurrency();
    updateSwitcherButtonLabels();
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



