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
        'features.safe': 'सुरक्षित और भरोसेमंद',
        'features.safe.desc': 'सत्यापित ड्राइवर और वास्तविक समय ट्रैकिंग हर सवारी पर आपकी सुरक्षा सुनिश्चित करते हैं।',
        'features.price': 'सर्वोत्तम मूल्य',
        'features.price.desc': 'बिना किसी छिपे शुल्क के पारदर्शी मूल्य निर्धारण।',
        'features.support': '24/7 सहायता',
        'features.support.desc': 'हमारी ग्राहक सहायता टीम हमेशा आपकी मदद के लिए उपलब्ध है।',

        // Trust Badges
        'trust.tourists': 'पर्यटकों के लिए सुरक्षित',
        'trust.english': 'अंग्रेजी बोलने वाले ड्राइवर',
        'trust.fixed': 'निश्चित कीमतें',

        // Booking
        'booking.title': 'अपनी सवारी बुक करें',
        'booking.pickup': 'पिकअप स्थान',
        'booking.dropoff': 'ड्रॉप स्थान',
        'booking.confirm': 'बुकिंग की पुष्टि करें',

        // Common
        'common.close': 'बंद करें',
        'common.submit': 'जमा करें',
        'common.cancel': 'रद्द करें'
    },

    fr: {
        'hero.subtitle': 'Votre partenaire de trajet de confiance en Inde',
        'hero.tagline': 'Des trajets sûrs et abordables pour les voyageurs internationaux et locaux',
        'hero.book': 'Réserver un trajet',
        'banner.welcome': 'Bienvenue aux voyageurs internationaux !',
        'features.safe': 'Sûr et sécurisé',
        'trust.tourists': 'Sûr pour les touristes',
        'trust.english': 'Chauffeurs anglophones',
        'booking.confirm': 'Confirmer la réservation'
    },

    de: {
        'hero.subtitle': 'Ihr vertrauenswürdiger Fahrpartner in ganz Indien',
        'hero.tagline': 'Sichere und erschwingliche Fahrten für internationale und inländische Reisende',
        'hero.book': 'Fahrt buchen',
        'banner.welcome': 'Willkommen internationale Reisende!',
        'features.safe': 'Sicher und geschützt',
        'trust.tourists': 'Sicher für Touristen',
        'trust.english': 'Englischsprachige Fahrer',
        'booking.confirm': 'Buchung bestätigen'
    },

    es: {
        'hero.subtitle': 'Tu socio de viaje de confianza en toda la India',
        'hero.tagline': 'Viajes seguros y asequibles para viajeros internacionales y locales',
        'hero.book': 'Reservar viaje',
        'banner.welcome': '¡Bienvenidos viajeros internacionales!',
        'features.safe': 'Seguro y protegido',
        'trust.tourists': 'Seguro para turistas',
        'trust.english': 'Conductores que hablan inglés',
        'booking.confirm': 'Confirmar reserva'
    },

    ja: {
        'hero.subtitle': 'インド全土で信頼できる移動パートナー',
        'hero.tagline': '海外および国内旅行者向けの安全で手頃な移動サービス',
        'hero.book': '配車を予約',
        'banner.welcome': '海外旅行者の皆様へようこそ！',
        'features.safe': '安全で安心',
        'trust.tourists': '観光客に安全',
        'trust.english': '英語対応ドライバー',
        'booking.confirm': '予約を確認'
    },

    zh: {
        'hero.subtitle': '您在印度各地值得信赖的出行伙伴',
        'hero.tagline': '为国际和本地旅客提供安全、实惠的出行服务',
        'hero.book': '预订行程',
        'banner.welcome': '欢迎国际旅客！',
        'features.safe': '安全可靠',
        'trust.tourists': '游客友好安全',
        'trust.english': '英语司机',
        'booking.confirm': '确认预订'
    },

    ar: {
        'hero.subtitle': 'شريكك الموثوق للتنقل في جميع أنحاء الهند',
        'hero.tagline': 'رحلات آمنة وبأسعار مناسبة للمسافرين الدوليين والمحليين',
        'hero.book': 'احجز رحلة',
        'banner.welcome': 'مرحبًا بالمسافرين الدوليين!',
        'features.safe': 'آمن ومحمي',
        'trust.tourists': 'آمن للسياح',
        'trust.english': 'سائقون يتحدثون الإنجليزية',
        'booking.confirm': 'تأكيد الحجز'
    },

    // Remaining languages use English fallback for fixed keys.
    bn: {},
    mr: {},
    gu: {},
    pa: {},
    ta: {},
    te: {},
    kn: {},
    ml: {},
    or: {},
    as: {},
    ur: {},
    pt: {},
    ru: {},
    ko: {},
    it: {},
    tr: {},
    nl: {},
    pl: {},
    sv: {},
    no: {},
    da: {},
    fi: {},
    he: {},
    fa: {},
    uk: {},
    vi: {},
    id: {},
    ms: {},
    th: {},
    ne: {}
};

const languageCatalog = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'bn', name: 'Bengali' },
    { code: 'mr', name: 'Marathi' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'kn', name: 'Kannada' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'or', name: 'Odia' },
    { code: 'as', name: 'Assamese' },
    { code: 'ur', name: 'Urdu' },
    { code: 'ne', name: 'Nepali' },
    { code: 'ar', name: 'Arabic' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'es', name: 'Spanish' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese (Simplified)' },
    { code: 'it', name: 'Italian' },
    { code: 'tr', name: 'Turkish' },
    { code: 'nl', name: 'Dutch' },
    { code: 'pl', name: 'Polish' },
    { code: 'sv', name: 'Swedish' },
    { code: 'no', name: 'Norwegian' },
    { code: 'da', name: 'Danish' },
    { code: 'fi', name: 'Finnish' },
    { code: 'he', name: 'Hebrew' },
    { code: 'fa', name: 'Persian' },
    { code: 'uk', name: 'Ukrainian' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'id', name: 'Indonesian' },
    { code: 'ms', name: 'Malay' },
    { code: 'th', name: 'Thai' }
];

// Currency conversion rates (relative to INR)
// Note: Approximate rates for UI only.
const currencyRates = {
    INR: { symbol: '₹', rate: 1, name: 'Indian Rupee' },
    USD: { symbol: '$', rate: 0.012, name: 'United States Dollar' },
    EUR: { symbol: '€', rate: 0.011, name: 'Euro' },
    GBP: { symbol: '£', rate: 0.0095, name: 'British Pound Sterling' },
    AED: { symbol: 'AED', rate: 0.044, name: 'UAE Dirham' },
    SAR: { symbol: 'SAR', rate: 0.045, name: 'Saudi Riyal' },
    QAR: { symbol: 'QAR', rate: 0.044, name: 'Qatari Riyal' },
    KWD: { symbol: 'KWD', rate: 0.0037, name: 'Kuwaiti Dinar' },
    OMR: { symbol: 'OMR', rate: 0.0046, name: 'Omani Rial' },
    BHD: { symbol: 'BHD', rate: 0.0045, name: 'Bahraini Dinar' },
    SGD: { symbol: 'S$', rate: 0.016, name: 'Singapore Dollar' },
    MYR: { symbol: 'RM', rate: 0.053, name: 'Malaysian Ringgit' },
    THB: { symbol: '฿', rate: 0.42, name: 'Thai Baht' },
    IDR: { symbol: 'Rp', rate: 195, name: 'Indonesian Rupiah' },
    PHP: { symbol: '₱', rate: 0.69, name: 'Philippine Peso' },
    VND: { symbol: '₫', rate: 305, name: 'Vietnamese Dong' },
    AUD: { symbol: 'A$', rate: 0.019, name: 'Australian Dollar' },
    NZD: { symbol: 'NZ$', rate: 0.021, name: 'New Zealand Dollar' },
    CAD: { symbol: 'C$', rate: 0.016, name: 'Canadian Dollar' },
    CHF: { symbol: 'CHF', rate: 0.011, name: 'Swiss Franc' },
    SEK: { symbol: 'SEK', rate: 0.13, name: 'Swedish Krona' },
    NOK: { symbol: 'NOK', rate: 0.13, name: 'Norwegian Krone' },
    DKK: { symbol: 'DKK', rate: 0.082, name: 'Danish Krone' },
    PLN: { symbol: 'PLN', rate: 0.048, name: 'Polish Zloty' },
    TRY: { symbol: 'TRY', rate: 0.39, name: 'Turkish Lira' },
    RUB: { symbol: '₽', rate: 1.09, name: 'Russian Ruble' },
    CNY: { symbol: '¥', rate: 0.086, name: 'Chinese Yuan' },
    JPY: { symbol: '¥', rate: 1.78, name: 'Japanese Yen' },
    KRW: { symbol: '₩', rate: 16.8, name: 'South Korean Won' },
    HKD: { symbol: 'HK$', rate: 0.095, name: 'Hong Kong Dollar' },
    ZAR: { symbol: 'R', rate: 0.22, name: 'South African Rand' },
    BRL: { symbol: 'R$', rate: 0.060, name: 'Brazilian Real' },
    MXN: { symbol: 'MX$', rate: 0.21, name: 'Mexican Peso' }
};

const GOOGLE_TRANSLATE_CONTAINER_ID = 'goiGoogleTranslateContainer';
const GOOGLE_TRANSLATE_SCRIPT_ID = 'goiGoogleTranslateScript';
const googleLanguageMap = {
    zh: 'zh-CN',
    he: 'iw'
};
const GOOGLE_TRANSLATE_ENABLED = typeof window !== 'undefined' && window.GOINDIA_ENABLE_GOOGLE_TRANSLATE === true;

let currentLang = localStorage.getItem('goride_language') || 'en';
let currentCurrency = localStorage.getItem('goride_currency') || 'INR';
let googleTranslateInitialized = false;

function getLanguageMeta(code) {
    return languageCatalog.find((item) => item.code === code) || languageCatalog[0];
}

function getCurrencyMeta(code) {
    return currencyRates[code] || currencyRates.INR;
}

function toGoogleLanguageCode(code) {
    const normalized = String(code || 'en').toLowerCase();
    return googleLanguageMap[normalized] || normalized;
}

function getIncludedGoogleLanguages() {
    const values = languageCatalog.map((lang) => toGoogleLanguageCode(lang.code));
    return Array.from(new Set(values)).join(',');
}

function setGoogleTranslateCookie(langCode) {
    if (!GOOGLE_TRANSLATE_ENABLED) return;
    if (typeof document === 'undefined') return;

    const googleCode = toGoogleLanguageCode(langCode);
    const cookieValue = `/en/${googleCode}`;

    document.cookie = `googtrans=${cookieValue};path=/`;

    if (typeof window !== 'undefined' && window.location && window.location.hostname.includes('.')) {
        document.cookie = `googtrans=${cookieValue};domain=.${window.location.hostname};path=/`;
    }
}

function ensureGoogleTranslateContainer() {
    if (!GOOGLE_TRANSLATE_ENABLED) return;
    if (typeof document === 'undefined') return;

    if (!document.getElementById(GOOGLE_TRANSLATE_CONTAINER_ID)) {
        const container = document.createElement('div');
        container.id = GOOGLE_TRANSLATE_CONTAINER_ID;
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        container.style.width = '1px';
        container.style.height = '1px';
        container.style.overflow = 'hidden';
        document.body.appendChild(container);
    }
}

function initGoogleTranslateElement() {
    if (!GOOGLE_TRANSLATE_ENABLED) return;
    if (googleTranslateInitialized) return;

    if (!window.google || !window.google.translate || !window.google.translate.TranslateElement) {
        return;
    }

    ensureGoogleTranslateContainer();

    try {
        new window.google.translate.TranslateElement(
            {
                pageLanguage: 'en',
                autoDisplay: false,
                includedLanguages: getIncludedGoogleLanguages(),
                layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
            },
            GOOGLE_TRANSLATE_CONTAINER_ID
        );
        googleTranslateInitialized = true;
    } catch (error) {
        console.warn('Google Translate init failed:', error);
    }
}

function ensureGoogleTranslateLoaded() {
    if (!GOOGLE_TRANSLATE_ENABLED) return;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    ensureGoogleTranslateContainer();

    if (window.google && window.google.translate && window.google.translate.TranslateElement) {
        initGoogleTranslateElement();
        return;
    }

    if (document.getElementById(GOOGLE_TRANSLATE_SCRIPT_ID)) {
        return;
    }

    window.googleTranslateElementInit = function googleTranslateElementInit() {
        initGoogleTranslateElement();
        if (GOOGLE_TRANSLATE_ENABLED) {
            applyGoogleTranslateSelection(currentLang);
        }
    };

    const script = document.createElement('script');
    script.id = GOOGLE_TRANSLATE_SCRIPT_ID;
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    script.defer = true;
    script.onerror = () => {
        console.warn('Google Translate script load failed.');
    };
    document.head.appendChild(script);
}

function applyGoogleTranslateSelection(langCode) {
    if (!GOOGLE_TRANSLATE_ENABLED) return;
    if (typeof document === 'undefined') return;

    const googleCode = toGoogleLanguageCode(langCode);
    setGoogleTranslateCookie(langCode);

    if (googleCode !== 'en') {
        ensureGoogleTranslateLoaded();
    }

    const combo = document.querySelector('.goog-te-combo');
    if (!combo) {
        if (googleCode !== 'en') {
            setTimeout(() => {
                const retry = document.querySelector('.goog-te-combo');
                if (retry) {
                    retry.value = googleCode;
                    retry.dispatchEvent(new Event('change'));
                }
            }, 1000);
        }
        return;
    }

    combo.value = googleCode;
    combo.dispatchEvent(new Event('change'));
}

function t(key, lang = currentLang) {
    const langData = translations[lang] || translations.en;
    return langData[key] || translations.en[key] || key;
}

function convertCurrency(amountINR, targetCurrency = currentCurrency) {
    const amount = Number(amountINR);
    const currencyInfo = getCurrencyMeta(targetCurrency);

    if (!Number.isFinite(amount)) {
        return `${currencyInfo.symbol}0.00`;
    }

    const converted = amount * Number(currencyInfo.rate || 1);

    if (targetCurrency === 'JPY' || targetCurrency === 'KRW' || targetCurrency === 'VND' || targetCurrency === 'IDR') {
        return `${currencyInfo.symbol}${Math.round(converted)}`;
    }

    return `${currencyInfo.symbol}${converted.toFixed(2)}`;
}

function setLanguage(lang) {
    const normalized = String(lang || 'en').toLowerCase();
    const selected = getLanguageMeta(normalized);

    currentLang = selected.code;
    localStorage.setItem('goride_language', currentLang);

    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('lang', currentLang);
    }

    updatePageLanguage();
    updateSwitcherButtonLabels();
    applyGoogleTranslateSelection(currentLang);
}

function setCurrency(currency) {
    const selectedCurrency = String(currency || 'INR').toUpperCase();

    if (!currencyRates[selectedCurrency]) {
        return;
    }

    currentCurrency = selectedCurrency;
    localStorage.setItem('goride_currency', currentCurrency);
    updatePageCurrency();
    updateSwitcherButtonLabels();
}

function updatePageLanguage() {
    document.querySelectorAll('[data-lang]').forEach((element) => {
        if (element.closest('.language-switcher') || element.closest('.currency-switcher')) {
            return;
        }

        const key = element.getAttribute('data-lang');
        if (!key) return;

        const translation = t(key);

        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            element.placeholder = translation;
        } else {
            element.textContent = translation;
        }
    });
}

function updatePageCurrency() {
    document.querySelectorAll('[data-currency]').forEach((element) => {
        const amount = Number.parseFloat(element.getAttribute('data-currency'));
        if (!Number.isFinite(amount)) return;
        element.textContent = convertCurrency(amount);
    });
}

function updateSwitcherButtonLabels() {
    const langBtn = document.querySelector('.lang-btn');
    const currencyBtn = document.querySelector('.currency-btn');

    if (langBtn) {
        const language = getLanguageMeta(currentLang);
        langBtn.innerHTML = `<span class="switcher-full">${language.name}</span><span class="switcher-compact">Language</span> ▼`;
    }

    if (currencyBtn) {
        const currencyInfo = getCurrencyMeta(currentCurrency);
        currencyBtn.innerHTML = `<span class="switcher-full">${currencyInfo.symbol} ${currencyInfo.name}</span><span class="switcher-compact">${currencyInfo.symbol} Currency</span> ▼`;
    }
}

function createLanguageSwitcher() {
    const selectedLanguage = getLanguageMeta(currentLang);

    let html = '<div class="language-switcher" style="position: relative; display: inline-block;">';
    html += `<button class="lang-btn" style="background: rgba(255,255,255,0.78); border: 1px solid rgba(11,31,58,0.22); color: #0B1F3A; padding: 0.42rem 0.65rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem; font-weight: 700; white-space: nowrap;"><span class="switcher-full">${selectedLanguage.name}</span><span class="switcher-compact">Language</span> ▼</button>`;
    html += '<div class="lang-dropdown" style="display: none; position: absolute; top: 100%; right: 0; background: white; border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.2); margin-top: 0.5rem; min-width: 230px; max-width: min(94vw, 280px); max-height: 62vh; overflow-y: auto; z-index: 1000;">';

    languageCatalog.forEach((language) => {
        html += `<button class="lang-option" data-lang-code="${language.code}" style="display: block; width: 100%; text-align: left; padding: 0.7rem 0.85rem; border: none; background: none; cursor: pointer; font-size: 0.9rem; color: #333; transition: all 0.3s;">${language.name}</button>`;
    });

    html += '</div></div>';
    return html;
}

function createCurrencySwitcher() {
    const selectedCurrency = getCurrencyMeta(currentCurrency);

    let html = '<div class="currency-switcher" style="position: relative; display: inline-block;">';
    html += `<button class="currency-btn" style="background: rgba(255,255,255,0.78); border: 1px solid rgba(11,31,58,0.22); color: #0B1F3A; padding: 0.42rem 0.65rem; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.9rem; white-space: nowrap;"><span class="switcher-full">${selectedCurrency.symbol} ${selectedCurrency.name}</span><span class="switcher-compact">${selectedCurrency.symbol} Currency</span> ▼</button>`;
    html += '<div class="currency-dropdown" style="display: none; position: absolute; top: 100%; right: 0; background: white; border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.2); margin-top: 0.5rem; min-width: 320px; max-width: min(96vw, 360px); max-height: 62vh; overflow-y: auto; z-index: 1000;">';

    Object.keys(currencyRates).forEach((currencyCode) => {
        const currency = getCurrencyMeta(currencyCode);
        html += `<button class="currency-option" data-currency-code="${currencyCode}" style="display: block; width: 100%; text-align: left; padding: 0.7rem 0.85rem; border: none; background: none; cursor: pointer; font-size: 0.88rem; color: #333; transition: all 0.3s;">${currency.symbol} ${currency.name} (${currencyCode})</button>`;
    });

    html += '</div></div>';
    return html;
}

function ensureI18nStyles() {
    if (typeof document === 'undefined' || document.getElementById('goi-i18n-style')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'goi-i18n-style';
    style.textContent = `
        .switcher-compact { display: none; }

        #goog-gt-tt,
        #goog-gt-vt,
        .goog-te-banner-frame,
        .goog-te-balloon-frame,
        .goog-tooltip,
        .goog-text-highlight {
            display: none !important;
        }

        iframe.goog-te-banner-frame {
            display: none !important;
            visibility: hidden !important;
        }

        body > .skiptranslate {
            display: none !important;
        }

        body { top: 0 !important; }

        @media (max-width: 768px) {
            .switcher-full { display: none; }
            .switcher-compact { display: inline; }

            .navbar-switchers {
                width: 100%;
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 0.4rem;
            }

            .navbar-switchers .language-switcher,
            .navbar-switchers .currency-switcher,
            .navbar-switchers .lang-btn,
            .navbar-switchers .currency-btn {
                width: 100%;
            }

            .navbar-switchers .lang-btn,
            .navbar-switchers .currency-btn {
                display: inline-flex;
                justify-content: space-between;
                align-items: center;
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

function initI18n() {
    ensureI18nStyles();

    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.add('notranslate');
        document.documentElement.setAttribute('translate', 'no');
    }

    if (typeof document !== 'undefined' && !document.querySelector('meta[name="google"][content="notranslate"]')) {
        const meta = document.createElement('meta');
        meta.name = 'google';
        meta.content = 'notranslate';
        document.head.appendChild(meta);
    }

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

        const langBtn = switchersDiv.querySelector('.lang-btn');
        const langDropdown = switchersDiv.querySelector('.lang-dropdown');
        const currencyBtn = switchersDiv.querySelector('.currency-btn');
        const currencyDropdown = switchersDiv.querySelector('.currency-dropdown');

        langBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            langDropdown.style.display = langDropdown.style.display === 'none' ? 'block' : 'none';
            currencyDropdown.style.display = 'none';
        });

        currencyBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            currencyDropdown.style.display = currencyDropdown.style.display === 'none' ? 'block' : 'none';
            langDropdown.style.display = 'none';
        });

        switchersDiv.querySelectorAll('.lang-option').forEach((button) => {
            button.addEventListener('click', () => {
                setLanguage(button.getAttribute('data-lang-code'));
                langDropdown.style.display = 'none';
            });
            button.addEventListener('mouseenter', function onMouseEnter() { this.style.background = '#f0f0f0'; });
            button.addEventListener('mouseleave', function onMouseLeave() { this.style.background = 'none'; });
        });

        switchersDiv.querySelectorAll('.currency-option').forEach((button) => {
            button.addEventListener('click', () => {
                setCurrency(button.getAttribute('data-currency-code'));
                currencyDropdown.style.display = 'none';
            });
            button.addEventListener('mouseenter', function onMouseEnter() { this.style.background = '#f0f0f0'; });
            button.addEventListener('mouseleave', function onMouseLeave() { this.style.background = 'none'; });
        });

        document.addEventListener('click', () => {
            langDropdown.style.display = 'none';
            currencyDropdown.style.display = 'none';
        });
    }

    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('lang', currentLang);
    }

    updatePageLanguage();
    updatePageCurrency();
    updateSwitcherButtonLabels();

    applyGoogleTranslateSelection(currentLang);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initI18n);
    } else {
        initI18n();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        t,
        convertCurrency,
        setLanguage,
        setCurrency,
        currentLang,
        currentCurrency,
        languageCatalog,
        currencyRates
    };
}
