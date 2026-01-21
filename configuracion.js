
// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://zbplunkujlsxyspiedqe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGx1bmt1amxzeHlzcGllZHFlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg3ODQzOSwiZXhwIjoyMDg0NDU0NDM5fQ.RKI_6VfeNrr3WTjZKBX_70DJEvhahSD190FBg4zu-Iw';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// --- STATE ---
const config = {
    marketPrice: 0.63,
    adenaRate: 30000,
    initialCapital: 0
};

let sales = [];
let partners = [];
let assets = [];

// --- UTILS ---
const fmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

// --- INITIALIZATION ---
async function initPage() {
    console.log("🚀 Initializing Configuración Module...");
    await loadData();
}

async function loadData() {
    if (!supabaseClient) {
        alert("CRITICAL: Supabase not initialized.");
        return;
    }

    try {
        // Load Config
        const { data: dbConfig } = await supabaseClient.from('config').select('*').eq('id', 1).single();
        if (dbConfig) {
            config.marketPrice = Number(dbConfig.market_price) || 0.63;
            config.adenaRate = Number(dbConfig.adena_rate) || 30000;
            config.initialCapital = Number(dbConfig.initial_capital) || 0;

            // Populate form
            document.getElementById('cfg-market-price').value = config.marketPrice;
            document.getElementById('cfg-adena-rate').value = config.adenaRate;
            document.getElementById('cfg-init-cap').value = config.initialCapital;
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

        updateCurrencyPanel();

        console.log("✅ Configuración Data Loaded");
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

// --- CONFIG ACTIONS ---
async function saveConfig() {
    const marketPrice = parseFloat(document.getElementById('cfg-market-price').value) || 0;
    const adenaRate = parseFloat(document.getElementById('cfg-adena-rate').value) || 0;
    const initCap = parseFloat(document.getElementById('cfg-init-cap').value) || 0;

    if (marketPrice <= 0 || adenaRate <= 0) {
        alert('Por favor, ingresa valores válidos.');
        return;
    }

    if (!confirm('¿Guardar estas configuraciones? Esto afectará todos los cálculos del sistema.')) return;

    const { error } = await supabaseClient
        .from('config')
        .update({
            market_price: marketPrice,
            adena_rate: adenaRate,
            initial_capital: initCap
        })
        .eq('id', 1);

    if (error) {
        alert('Error DB: ' + error.message);
        return;
    }

    config.marketPrice = marketPrice;
    config.adenaRate = adenaRate;
    config.initialCapital = initCap;

    updateCurrencyPanel();

    alert('✅ Configuración guardada exitosamente!\n\nRecuerda recargar otras páginas para ver los cambios.');
}

// Start
document.addEventListener('DOMContentLoaded', initPage);
