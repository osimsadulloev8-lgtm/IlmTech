// Минимальный service worker для IlmTech.
// Нужен, чтобы сайт считался «устанавливаемым приложением» (PWA) и собирался в APK.
// Ничего не кэширует — сайт всегда берёт свежие данные из интернета.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
