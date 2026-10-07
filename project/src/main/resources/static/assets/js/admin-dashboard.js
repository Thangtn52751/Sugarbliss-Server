(async function initializeDashboard() {
    const admin = window.SugarBlissAdmin;
    const user = await admin.ready;
    if (!user) return;

    const numberFormat = new Intl.NumberFormat("vi-VN");
    const money = (value) => `${numberFormat.format(Number(value) || 0)} \u20ab`;
    const date = document.querySelector("[data-dashboard-date]");
    const today = new Date();
    date.dateTime = today.toISOString();
    date.textContent = `Today: ${new Intl.DateTimeFormat("en-US", {
        month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
    }).format(today)}`;

    const rangeSelect = document.querySelector("[data-dashboard-range]");
    const errorBanner = document.querySelector("[data-dashboard-error]");
    const dataContainer = document.querySelector("[data-dashboard-data]");
    const chart = document.querySelector("[data-sales-chart]");
    const canvas = document.querySelector("[data-sales-canvas]");
    const tooltip = document.querySelector("[data-chart-tooltip]");
    const chartState = document.querySelector("[data-chart-state]");
    const chartLabels = document.querySelector("[data-chart-labels]");
    const context = canvas.getContext("2d");
    let salesPoints = [];
    let chartCoordinates = [];
    let requestController;
    let hasLoadedData = false;

    function renderKpis(kpis) {
        document.querySelectorAll("[data-kpi]").forEach((card) => {
            const key = card.dataset.kpi;
            const metric = kpis[key];
            const value = Number(metric.value) || 0;
            const change = Number(metric.changePercent) || 0;
            card.querySelector("[data-kpi-value]").textContent = key === "totalRevenue"
                ? money(value)
                : `${numberFormat.format(value)}${key === "productsListed" ? " Items" : ""}`;

            const changeElement = card.querySelector("[data-kpi-change]");
            const amount = document.createElement("strong");
            amount.textContent = change === 0 ? "Stable" : `${change > 0 ? "+" : ""}${change}%`;
            const comparison = document.createElement("span");
            comparison.textContent = metric.comparisonLabel || "vs previous period";
            changeElement.classList.toggle("is-down", change < 0);
            changeElement.replaceChildren(amount, comparison);
        });
    }

    function renderBestSellers(products) {
        const container = document.querySelector("[data-best-sellers]");
        container.replaceChildren();
        if (!products.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty-state";
            empty.textContent = "No product sales in this period.";
            container.append(empty);
            return;
        }

        products.forEach((product) => {
            const item = document.createElement("div");
            item.className = "admin-best-seller";
            const media = document.createElement("span");
            media.className = "admin-best-seller-media";
            const imageUrl = admin.assetUrl(product.image);
            if (imageUrl) {
                const image = document.createElement("img");
                image.src = imageUrl;
                image.alt = product.name;
                image.addEventListener("error", () => { image.hidden = true; }, { once: true });
                media.append(image);
            }

            const copy = document.createElement("span");
            copy.className = "admin-best-seller-copy";
            const name = document.createElement("strong");
            name.textContent = product.name;
            const units = document.createElement("span");
            units.textContent = `${numberFormat.format(product.unitsSold)} units sold`;
            copy.append(name, units);
            const revenue = document.createElement("span");
            revenue.className = "admin-best-seller-revenue";
            revenue.title = "Sales revenue";
            revenue.textContent = money(product.revenue);
            item.append(media, copy, revenue);
            container.append(item);
        });
    }

    function renderOrders(orders) {
        const body = document.querySelector("[data-recent-orders]");
        body.replaceChildren();
        if (!orders.length) {
            const cell = document.createElement("td");
            cell.colSpan = 5;
            cell.className = "admin-empty-state";
            cell.textContent = "No orders yet.";
            const row = document.createElement("tr");
            row.append(cell);
            body.append(row);
            return;
        }

        orders.forEach((order) => {
            const row = document.createElement("tr");
            const values = [order.orderNumber, order.customer.name, order.itemsSummary, money(order.total)];
            values.forEach((value, index) => {
                const cell = document.createElement("td");
                cell.textContent = value;
                if (index === 2) cell.className = "admin-order-summary";
                if (index === 3) cell.className = "admin-amount-column";
                row.append(cell);
            });

            const statusCell = document.createElement("td");
            const status = document.createElement("span");
            status.className = "admin-order-status";
            status.dataset.tone = order.status.tone;
            status.dataset.code = order.status.code;
            status.textContent = order.status.label;
            statusCell.append(status);
            row.append(statusCell);
            body.append(row);
        });
    }

    function drawChart(activeIndex = -1) {
        if (!context || !salesPoints.length) return;
        const width = chart.clientWidth;
        const height = chart.clientHeight;
        if (!width || !height) return;

        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, width, height);
        const maxRevenue = Math.max(...salesPoints.map((point) => Number(point.revenue) || 0), 1);
        const padding = 10;
        const plotHeight = height - (padding * 2);
        const plotWidth = width - (padding * 2);
        chartCoordinates = salesPoints.map((point, index) => ({
            x: padding + (index * plotWidth / Math.max(salesPoints.length - 1, 1)),
            y: padding + plotHeight - ((Number(point.revenue) || 0) / maxRevenue * plotHeight),
        }));

        context.beginPath();
        chartCoordinates.forEach((point, index) => {
            if (index === 0) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
        });
        context.lineWidth = 2;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.strokeStyle = "#e24262";
        context.stroke();

        const activePoint = chartCoordinates[activeIndex];
        if (activePoint) {
            context.beginPath();
            context.arc(activePoint.x, activePoint.y, 4, 0, Math.PI * 2);
            context.fillStyle = "#e24262";
            context.fill();
        }
    }

    function renderSales(points) {
        salesPoints = points;
        tooltip.hidden = true;
        const total = points.reduce((sum, point) => sum + Number(point.revenue || 0), 0);
        chartState.hidden = total > 0;
        chartState.textContent = "No sales in this period.";
        canvas.setAttribute("aria-label", `Sales revenue: ${money(total)} for ${rangeSelect.selectedOptions[0].textContent.toLowerCase()}.`);
        document.querySelector("[data-chart-summary]").textContent = points.map((point) => `${point.label}: ${money(point.revenue)}`).join(". ");
        chartLabels.replaceChildren();
        const labelCount = Math.min(4, points.length);
        for (let index = 0; index < labelCount; index += 1) {
            const pointIndex = Math.round(index * (points.length - 1) / Math.max(labelCount - 1, 1));
            const label = document.createElement("span");
            label.textContent = points[pointIndex].label;
            chartLabels.append(label);
        }
        drawChart();
    }

    chart.addEventListener("pointermove", (event) => {
        if (!chartCoordinates.length) return;
        const rectangle = chart.getBoundingClientRect();
        const x = event.clientX - rectangle.left;
        const index = chartCoordinates.reduce((nearest, point, pointIndex) => (
            Math.abs(point.x - x) < Math.abs(chartCoordinates[nearest].x - x) ? pointIndex : nearest
        ), 0);
        const point = salesPoints[index];
        tooltip.textContent = `${point.label}\n${money(point.revenue)}\n${point.orderCount} orders`;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.max(8, Math.min(x + 12, chart.clientWidth - tooltip.offsetWidth - 8))}px`;
        tooltip.style.top = `${Math.max(8, Math.min(chartCoordinates[index].y - tooltip.offsetHeight - 12, chart.clientHeight - tooltip.offsetHeight - 8))}px`;
        drawChart(index);
    });
    chart.addEventListener("pointerleave", () => { tooltip.hidden = true; drawChart(); });
    const resizeObserver = new ResizeObserver(() => { tooltip.hidden = true; drawChart(); });
    resizeObserver.observe(chart);

    async function loadDashboard() {
        requestController?.abort();
        const controller = new AbortController();
        requestController = controller;
        const timeout = window.setTimeout(() => controller.abort("timeout"), 15000);
        dataContainer.setAttribute("aria-busy", "true");
        errorBanner.hidden = true;

        try {
            const query = new URLSearchParams({
                range: rangeSelect.value,
                timezoneOffset: "420",
                bestSellerLimit: "4",
                recentOrderLimit: "5",
            });
            const data = await admin.request(`/api/admin/dashboard/overview?${query}`, { signal: controller.signal });
            if (!data || requestController !== controller) return;
            renderKpis(data.kpis);
            renderBestSellers(data.bestSellingProducts);
            renderOrders(data.recentOrders);
            renderSales(data.salesVolume.points);
            hasLoadedData = true;
        } catch (error) {
            if (requestController !== controller) return;
            errorBanner.hidden = false;
            errorBanner.querySelector("p").textContent = hasLoadedData
                ? "Unable to refresh the dashboard. The last loaded figures are still displayed."
                : "Unable to load the dashboard. Please try again.";
            if (!hasLoadedData) {
                document.querySelectorAll("[data-kpi-change]").forEach((element) => { element.textContent = "Unavailable"; });
                chartState.textContent = "Sales data unavailable.";
                document.querySelector("[data-best-sellers] .admin-empty-state").textContent = "Best sellers unavailable.";
                document.querySelector("[data-recent-orders] .admin-empty-state").textContent = "Orders unavailable.";
            }
        } finally {
            window.clearTimeout(timeout);
            if (requestController === controller) dataContainer.setAttribute("aria-busy", "false");
        }
    }

    rangeSelect.addEventListener("change", loadDashboard);
    document.querySelector("[data-dashboard-retry]").addEventListener("click", loadDashboard);
    await loadDashboard();
}());
