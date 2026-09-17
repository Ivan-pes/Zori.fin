/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy: что браузеру разрешено грузить/исполнять.
// 'unsafe-inline' для стилей нужен (в приложении много inline-стилей).
// 'unsafe-eval' — только в dev (нужен React Fast Refresh); в проде убираем.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // YAXI open banking: фронтовый клиент (routex-client) ходит к их API напрямую
  // (сквозное шифрование клиент↔банк) — разрешаем оба окружения.
  "connect-src 'self' https://api.yaxi.tech https://integration.yaxi.tech",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // апгрейд на https ТОЛЬКО в проде — на localhost (http) он ломает загрузку
  // стилей/скриптов (браузер пытается тянуть их по https://localhost).
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// Заголовки безопасности на все ответы.
const securityHeaders = [
  // принудительный HTTPS на год + поддомены (HSTS)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // запрет встраивания в iframe (анти-кликджекинг)
  { key: "X-Frame-Options", value: "DENY" },
  // не угадывать MIME-тип (анти-«MIME sniffing»)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // не утекать полный URL в Referer на сторонние сайты
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // отключаем доступ к камере/микрофону/геолокации
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // не светим "X-Powered-By: Next.js"
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
