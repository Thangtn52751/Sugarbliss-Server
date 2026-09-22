(function configureSugarBlissApi() {
    const configuredBaseUrl = window.SUGAR_BLISS_API_BASE_URL;
    const hostname = window.location.hostname || "localhost";
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const baseUrl = String(configuredBaseUrl || `${protocol}//${hostname}:3000`).replace(/\/$/, "");

    window.SugarBlissApi = Object.freeze({
        baseUrl,
        url(path = "") {
            const normalizedPath = String(path).startsWith("/") ? path : `/${path}`;
            return `${baseUrl}${normalizedPath}`;
        }
    });
}());
