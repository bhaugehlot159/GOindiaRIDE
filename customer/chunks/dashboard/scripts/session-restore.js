        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                const swVersion = '20260522-booking-back-guard1';
                navigator.serviceWorker
                    .register('../sw.js?v=' + swVersion)
                    .then(function (registration) {
                        registration.update().catch(function () {});
                    })
                    .catch(function () {});
            });
        }
