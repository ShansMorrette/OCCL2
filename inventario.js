
// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://zbplunkujlsxyspiedqe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGx1bmt1amxzeHlzcGllZHFlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg3ODQzOSwiZXhwIjoyMDg0NDU0NDM5fQ.RKI_6VfeNrr3WTjZKBX_70DJEvhahSD190FBg4zu-Iw';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// --- STATE ---
const config = {
    marketPrice: 0.63,
    adenaRate: 30000
};

let assets = [];
let sales = [];
let partners = [];

// --- UTILS ---
const fmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

// --- INITIALIZATION ---
async function initPage() {
    console.log("🚀 Initializing Inventario Module...");
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
        }

        // Load Assets
        const { data: dbAssets } = await supabaseClient.from('assets').select('*');
        if (dbAssets) {
            assets = dbAssets.map(a => ({
                id: a.id,
                name: a.name,
                stock: Number(a.stock) || 0,
                usdtValue: Number(a.usdt_value) || 0
            }));
        }

        // Load Partners
        const { data: dbPartners } = await supabaseClient.from('partners').select('*');
        if (dbPartners) partners = dbPartners;

        // Load Sales
        const { data: dbSales } = await supabaseClient.from('sales').select('*');
        if (dbSales) sales = dbSales;

        renderInventory();
        updateCurrencyPanel();

        console.log("✅ Inventario Data Loaded");
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

    const totalInventoryValue = assets.reduce((sum, a) => sum + (a.stock * a.usdtValue), 0);
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

// --- RENDER INVENTORY ---
function renderInventory() {
    const tbody = document.getElementById('inventory-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (assets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-zinc-500 text-sm">No hay items en el inventario</td></tr>';
        return;
    }

    let totalValue = 0;

    assets.forEach(asset => {
        const itemValue = asset.stock * asset.usdtValue;
        totalValue += itemValue;

        const tr = document.createElement('tr');
        tr.className = 'border-b border-white/5 hover:bg-white/[0.02] transition-colors';
        tr.innerHTML = `
            <td class="py-4 text-sm font-bold uppercase">${asset.name}</td>
            <td class="py-4 text-sm text-center font-mono text-[#00f2ff]">${asset.stock}</td>
            <td class="py-4 text-sm text-center font-mono text-zinc-400">${fmt(asset.usdtValue)}</td>
            <td class="py-4 text-sm font-mono text-emerald-400 font-bold">${fmt(itemValue)}</td>
            <td class="py-4 text-right">
                <button onclick="editStock(${asset.id})" class="p-2 text-[#00f2ff]/50 hover:text-[#00f2ff] transition-all" title="Editar stock">
                    <i data-lucide="edit" class="w-4 h-4"></i>
                </button>
                <button onclick="deleteAsset(${asset.id})" class="p-2 text-red-500/50 hover:text-red-500 transition-all" title="Eliminar item">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const elTotalValue = document.getElementById('total-inventory-value');
    if (elTotalValue) elTotalValue.innerText = fmt(totalValue);

    lucide.createIcons();
}

// --- ASSET ACTIONS ---
async function addAsset() {
    const name = document.getElementById('new-asset-name').value.trim();
    const stock = parseInt(document.getElementById('new-asset-stock').value) || 0;
    const price = parseFloat(document.getElementById('new-asset-price').value) || 0;

    if (!name) {
        alert('Por favor, ingresa el nombre del item.');
        return;
    }
    if (stock <= 0 || price <= 0) {
        alert('Por favor, ingresa valores válidos para stock y precio.');
        return;
    }

    const { data, error } = await supabaseClient
        .from('assets')
        .insert([{ name: name, stock: stock, usdt_value: price }])
        .select()
        .single();

    if (error) { alert('Error DB: ' + error.message); return; }

    assets.push({ id: data.id, name: data.name, stock: data.stock, usdtValue: data.usdt_value });

    document.getElementById('new-asset-name').value = '';
    document.getElementById('new-asset-stock').value = '';
    document.getElementById('new-asset-price').value = '';

    renderInventory();
    updateKPIs();

    alert(`Item ${name} agregado exitosamente!`);
}

async function editStock(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    const newStock = prompt(`Actualizar stock de ${asset.name}\nStock actual: ${asset.stock}`, asset.stock);
    if (newStock === null) return;

    const stock = parseInt(newStock);
    if (isNaN(stock) || stock < 0) {
        alert('Por favor, ingresa un valor válido.');
        return;
    }

    const { error } = await supabaseClient.from('assets').update({ stock: stock }).eq('id', assetId);
    if (error) { alert('Error DB: ' + error.message); return; }

    asset.stock = stock;
    renderInventory();
    updateKPIs();
}

async function deleteAsset(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    if (!confirm(`¿Eliminar ${asset.name} del inventario?`)) return;

    const { error } = await supabaseClient.from('assets').delete().eq('id', assetId);
    if (error) { alert('Error DB: ' + error.message); return; }

    assets = assets.filter(a => a.id !== assetId);
    renderInventory();
    updateKPIs();

    alert(`${asset.name} eliminado correctamente.`);
}

// Start
document.addEventListener('DOMContentLoaded', initPage);
