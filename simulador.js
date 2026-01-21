
// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://zbplunkujlsxyspiedqe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGx1bmt1amxzeHlzcGllZHFlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg3ODQzOSwiZXhwIjoyMDg0NDU0NDM5fQ.RKI_6VfeNrr3WTjZKBX_70DJEvhahSD190FBg4zu-Iw';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// --- STATE ---
const config = {
    marketPrice: 0.63,
    initialCapital: 0,
    adenaRate: 30000
};

let simState = {
    capital: 0,
    monthly: 0,
    risk: 3
};

let sales = [];
let assets = [];
let partners = [];

// --- DOM Elements ---
const els = {
    inputCap: document.getElementById('input-capital'),
    inputMon: document.getElementById('input-monthly'),
    inputRsk: document.getElementById('input-risk'),
    valRsk: document.getElementById('val-risk')
};

// --- UTILS ---
const fmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

// --- INITIALIZATION ---
async function initPage() {
    console.log("🚀 Initializing Simulador Module...");
    await loadData();
    initListeners();
    runSimulation();
}

async function loadData() {
    if (!supabaseClient) {
        alert("CRITICAL: Supabase not initialized.");
        return;
    }

    try {
        const { data: dbConfig } = await supabaseClient.from('config').select('*').eq('id', 1).single();
        if (dbConfig) {
            config.marketPrice = Number(dbConfig.market_price) || 0.63;
            config.initialCapital = Number(dbConfig.initial_capital) || 0;
            config.adenaRate = Number(dbConfig.adena_rate) || 30000;
        }

        // Load Partners
        const { data: dbPartners } = await supabaseClient.from('partners').select('*');
        if (dbPartners) partners = dbPartners;

        // Load Sales
        const { data: dbSales } = await supabaseClient.from('sales').select('*');
        if (dbSales) sales = dbSales;

        // Load Assets
        const { data: dbAssets } = await supabaseClient.from('assets').select('*');
        if (dbAssets) assets = dbAssets;

        simState.capital = config.initialCapital;
        els.inputCap.value = config.initialCapital;

        updateCurrencyPanel();

        console.log("✅ Simulador Data Loaded");
    } catch (err) {
        console.error("Fatal Error Loading Data:", err);
    }
}

function updateCurrencyPanel() {
    const totalCoins = partners.reduce((sum, p) => sum + (p.coins_invested || 0), 0);
    const totalUSDT = (totalCoins / 1000) * config.marketPrice;
    const totalAdena = totalCoins * config.adenaRate;

    const elCoins = document.getElementById('currency-coins');
    const elUsdt = document.getElementById('currency-usdt');
    const elAdena = document.getElementById('currency-adena');

    if (elCoins) elCoins.innerText = new Intl.NumberFormat().format(totalCoins);
    if (elUsdt) elUsdt.innerText = fmt(totalUSDT);
    if (elAdena) elAdena.innerText = new Intl.NumberFormat().format(totalAdena);

    // Update Conversion Rates
    const elRateUsdt = document.getElementById('rate-usdt');
    const elRateAdena = document.getElementById('rate-adena');
    const elRateCross = document.getElementById('rate-cross');

    if (elRateUsdt) elRateUsdt.innerText = `$${config.marketPrice} USDT`;
    if (elRateAdena) elRateAdena.innerText = `${config.adenaRate.toLocaleString()} Adena`;
    if (config.marketPrice > 0 && elRateCross) {
        const cross = (config.adenaRate * 1000) / config.marketPrice;
        elRateCross.innerText = `${Math.floor(cross).toLocaleString()} Adena`;
    }

    // Update ticker
    const ticker = document.getElementById('ticker-price');
    if (ticker) ticker.innerText = `LIVE FEED: $${config.marketPrice.toFixed(2)}/1k`;

    updateKPIs();
}

async function updateKPIs() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let monthlyCoinsSold = 0;
    let totalCoinsSold = 0;
    let totalSalesUSDT = 0;
    let salePrices = [];

    if (sales && sales.length > 0) {
        sales.forEach(s => {
            if (s.type !== 'DEPOSIT' && s.type !== 'WITHDRAWAL') {
                const saleDate = new Date(s.date);
                const amount = s.amount || 0;
                const price = s.price || 0;

                totalCoinsSold += amount;
                totalSalesUSDT += (amount * price) / 1000;
                if (price > 0) salePrices.push(price);

                if (saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
                    monthlyCoinsSold += amount;
                }
            }
        });
    }

    const elKpiIncome = document.getElementById('kpi-income');
    if (elKpiIncome) elKpiIncome.innerText = `${new Intl.NumberFormat().format(monthlyCoinsSold)} Coins`;

    const totalInventoryValue = assets.reduce((sum, a) => sum + (a.stock * (a.usdt_value || 0)), 0);
    const elKpiStock = document.getElementById('kpi-stock');
    if (elKpiStock) elKpiStock.innerText = `$${totalInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const totalCoins = partners.reduce((sum, p) => sum + (p.coins_invested || 0), 0);
    const totalInitialCoins = totalCoins + totalCoinsSold;
    const totalInitialValueUSDT = (totalInitialCoins * config.marketPrice) / 1000;
    const roiHist = totalInitialValueUSDT > 0 ? (totalSalesUSDT / totalInitialValueUSDT) * 100 : 0;

    const elKpiRoi = document.getElementById('kpi-roi');
    if (elKpiRoi) {
        elKpiRoi.innerText = (roiHist >= 0 ? '+' : '') + roiHist.toFixed(2) + '%';
        elKpiRoi.className = `text-2xl font-bold ${roiHist > 0 ? 'text-green-400' : 'text-zinc-500'}`;
    }

    const elKpiVol = document.getElementById('kpi-vol');
    if (elKpiVol) {
        let volText = "0%";
        let volClass = "text-2xl font-bold text-zinc-600";
        if (salePrices.length > 0) {
            const min = Math.min(...salePrices);
            const max = Math.max(...salePrices);
            const spread = min > 0 ? ((max - min) / min) * 100 : 0;
            volText = `${spread.toFixed(1)}%`;
            if (spread > 20) volClass = "text-2xl font-bold text-red-500 neon-text-red";
            else if (spread > 10) volClass = "text-2xl font-bold text-amber-500";
            else volClass = "text-2xl font-bold text-emerald-400";
        }
        elKpiVol.innerText = volText;
        elKpiVol.className = volClass;
    }
}

function initListeners() {
    els.inputCap.addEventListener('input', (e) => {
        simState.capital = Math.max(0, parseFloat(e.target.value) || 0);
        runSimulation();
    });

    els.inputMon.addEventListener('input', (e) => {
        simState.monthly = Math.max(0, parseFloat(e.target.value) || 0);
        runSimulation();
    });

    els.inputRsk.addEventListener('input', (e) => {
        simState.risk = Math.max(1, Math.min(5, parseInt(e.target.value) || 1));
        const labels = ['MUY BAJO', 'BAJO', 'MODERADO', 'ALTO', 'AGRESIVO'];
        if (els.valRsk) els.valRsk.innerText = labels[simState.risk - 1];
        runSimulation();
    });
}

// --- SIMULATION LOGIC ---
function runSimulation() {
    let balance = simState.capital;
    let totalInvested = simState.capital;
    const seriesData = [];
    const baselineData = [];

    const rates = [0.005, 0.01, 0.015, 0.025, 0.04];
    const vols = [0.01, 0.02, 0.04, 0.08, 0.15];

    const r = rates[simState.risk - 1];
    const v = vols[simState.risk - 1];

    for (let i = 0; i < 12; i++) {
        const drift = (Math.random() - 0.5) * 2 * v;
        balance = (balance + simState.monthly) * (1 + r + drift);
        totalInvested += simState.monthly;
        seriesData.push(Math.round(balance));
        baselineData.push(Math.round(totalInvested));
    }

    const roiPerc = totalInvested > 0 ? ((balance / totalInvested) - 1) * 100 : 0;

    // Update displays
    const simFinalCap = document.getElementById('sim-final-capital');
    const simTotalInv = document.getElementById('sim-total-invested');
    const simNetGain = document.getElementById('sim-net-gain');
    const simRoi = document.getElementById('sim-roi');

    if (simFinalCap) simFinalCap.innerText = new Intl.NumberFormat().format(Math.round(balance)) + ' C';
    if (simTotalInv) simTotalInv.innerText = new Intl.NumberFormat().format(Math.round(totalInvested)) + ' C';
    if (simNetGain) {
        const gain = balance - totalInvested;
        simNetGain.innerText = (gain >= 0 ? '+' : '') + new Intl.NumberFormat().format(Math.round(gain)) + ' C';
    }
    if (simRoi) simRoi.innerText = (roiPerc >= 0 ? '+' : '') + roiPerc.toFixed(1) + '%';

    // Update chart
    if (window.simChartInstance) {
        window.simChartInstance.updateSeries([
            { name: 'Portafolio Proyectado', data: seriesData },
            { name: 'Inversión Total', data: baselineData }
        ]);
    }

    return { seriesData, baselineData };
}

// --- CHART INITIALIZATION ---
function initChart() {
    const simChartEl = document.querySelector("#sim-chart");
    if (!simChartEl) return;

    const options = {
        chart: { type: 'line', height: 250, background: 'transparent', toolbar: { show: false }, fontFamily: 'monospace' },
        theme: { mode: 'dark' },
        series: [
            { name: 'Portafolio Proyectado', data: [] },
            { name: 'Inversión Total', data: [] }
        ],
        colors: ['#00f2ff', '#ff00ff'],
        stroke: { curve: 'smooth', width: 2 },
        grid: { borderColor: 'rgba(255,255,255,0.05)' },
        xaxis: {
            categories: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            title: { text: 'Mes', style: { color: '#a1a1aa' } },
            labels: { style: { colors: '#a1a1aa' } }
        },
        yaxis: {
            title: { text: 'Coins', style: { color: '#a1a1aa' } },
            labels: {
                style: { colors: '#a1a1aa' },
                formatter: (val) => new Intl.NumberFormat('en-US', { notation: "compact" }).format(val)
            }
        },
        dataLabels: { enabled: false },
        tooltip: { theme: 'dark' }
    };

    window.simChartInstance = new ApexCharts(simChartEl, options);
    window.simChartInstance.render();
}

// Start
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initPage();
});
