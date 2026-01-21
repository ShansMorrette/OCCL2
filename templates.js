
// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://zbplunkujlsxyspiedqe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGx1bmt1amxzeHlzcGllZHFlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg3ODQzOSwiZXhwIjoyMDg0NDU0NDM5fQ.RKI_6VfeNrr3WTjZKBX_70DJEvhahSD190FBg4zu-Iw';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// --- STATE ---
const config = {
    marketPrice: 0.63,
    adenaRate: 30000,
    initialCapital: 0,
    packages: [],
    customDiscounts: [],
    template_unified: "🎁 *OFERTAS DE HOY* 🎁\n\nStock Total: {stock_total}\nPrecio Base: {tasa}\n\n📦 *PACKS DISPONIBLES:*\n{lista_paquetes}\n\n¡Aprovecha antes de que se acaben!"
};

let assets = [];

// DOM Elements
const els = {
    packagesList: document.getElementById('packages-list'),
    newPkgAmount: document.getElementById('new-pkg-amount'),
    discountSelect: document.getElementById('gen-discount-select'),
    discountToggle: document.getElementById('gen-discount-toggle'),
    messageOutput: document.getElementById('message-output'),
    templateInput: document.getElementById('smart-tpl-master'),
    ticker: document.getElementById('ticker-price')
};


// --- INITIALIZATION ---
async function initPage() {
    console.log("🚀 Initializing Templates Module...");
    await loadData();

    // Set up listeners
    document.getElementById('new-discount-name')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addDiscount() });
    document.getElementById('new-pkg-amount')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addPackage() });
}

async function loadData() {
    if (!supabaseClient) {
        alert("CRITICAL: Supabase not initialized.");
        return;
    }

    try {
        // 1. Config (Market Price, Adena Rate, etc)
        const { data: dbConfig } = await supabaseClient.from('config').select('*').eq('id', 1).single();
        if (dbConfig) {
            config.marketPrice = Number(dbConfig.market_price) || 0.63;
            config.adenaRate = Number(dbConfig.adena_rate) || 30000;
            config.initialCapital = Number(dbConfig.initial_capital) || 0;
            if (dbConfig.template_unified) config.template_unified = dbConfig.template_unified;
        }

        // 2. Assets (Inventory)
        const { data: dbAssets } = await supabaseClient.from('assets').select('*');
        if (dbAssets) {
            assets = dbAssets.map(a => ({
                id: a.id,
                name: a.name,
                stock: Number(a.stock) || 0,
                usdtValue: Number(a.usdt_value) || 0
            }));
        }

        // 3. Packages
        const { data: dbPackages } = await supabaseClient.from('packages').select('*').order('amount');

        if (dbPackages && dbPackages.length > 0) {
            config.packages = dbPackages
                .map(p => Number(p.amount))
                .filter(n => Number.isFinite(n) && n > 0)
                .sort((a, b) => a - b);
        } else {
            config.packages = [10, 15, 20]; // Default fallback
        }

        // 3. Render
        // 3. Render
        syncDashboardData();
        renderPackagesList();
        renderDiscountSelect();

        if (els.templateInput) {
            els.templateInput.value = config.template_unified;
        }

        updateMessagePreview();
        console.log("✅ Data Loaded. Packages:", config.packages);

    } catch (err) {
        console.error("Fatal Error Loading Data:", err);
    }
}


// --- PACKAGES ---
async function addPackage() {
    const val = els.newPkgAmount.value;
    const amount = parseInt(val);

    if (isNaN(amount) || amount <= 0) {
        alert("Cantidad inválida");
        return;
    }

    // Direct Database Action
    try {
        const { error } = await supabaseClient.from('packages').insert([{ amount }]);
        if (error) throw error; // duplicate key likely

        // Refresh
        await refreshPackages();
        els.newPkgAmount.value = '';
    } catch (err) {
        alert("Error al agregar (¿duplicado?): " + err.message);
    }
}

async function removePackage(amount) {
    if (!confirm(`¿Borrar ${amount}k?`)) return;

    try {
        await supabaseClient.from('packages').delete().eq('amount', amount);
        await refreshPackages();
    } catch (err) {
        console.error(err);
    }
}

async function refreshPackages() {
    const { data } = await supabaseClient.from('packages').select('*').order('amount');
    if (data) {
        config.packages = data
            .map(p => Number(p.amount))
            .filter(n => Number.isFinite(n) && n > 0);
        renderPackagesList();
        updateMessagePreview();
    }
}

function renderPackagesList() {
    const container = els.packagesList;
    if (!container) return;

    container.innerHTML = '';

    if (config.packages.length === 0) {
        container.innerHTML = '<div class="text-zinc-600 text-center py-4 text-xs">Sin paquetes</div>';
        return;
    }

    config.packages.forEach(pkg => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between bg-black/20 p-2 rounded border border-white/5 hover:border-[#00f2ff]/30 transition-all';
        div.innerHTML = `
            <label class="flex items-center gap-3 cursor-pointer flex-1">
                <input type="checkbox" class="pkg-checkbox w-4 h-4 rounded border-gray-300 text-[#00f2ff] focus:ring-[#00f2ff]" 
                    value="${pkg}" checked onchange="updateMessagePreview()">
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-[#00f2ff]">${pkg}k Coins</span>
                    <span class="text-[10px] text-zinc-500">${getCalculatedPrice(pkg)} USDT</span>
                </div>
            </label>
            <button onclick="removePackage(${pkg})" class="text-red-500 hover:text-red-400 p-1">
                <i data-lucide="x" class="w-3 h-3"></i>
            </button>
        `;
        container.appendChild(div);
    });

    if (window.lucide) lucide.createIcons();
}


// --- DISCOUNTS (Local Mock for now, simplified) ---
function addDiscount() {
    const name = document.getElementById('new-discount-name').value;
    const val = Number(document.getElementById('new-discount-val').value);

    if (!name || isNaN(val)) return;

    const newId = Date.now();
    config.customDiscounts.push({ id: newId, label: name, value: val });

    document.getElementById('new-discount-name').value = '';
    document.getElementById('new-discount-val').value = '';
    renderDiscountSelect();
}

function renderDiscountSelect() {
    const sel = els.discountSelect;
    if (!sel) return;
    const saved = sel.value;
    sel.innerHTML = '<option value="0">Sin Descuento Extra</option>';

    config.customDiscounts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.label} (-${d.value}%)`;
        sel.appendChild(opt);
    });
    sel.value = saved;
}


// --- PREVIEW LOGIC ---
function getCalculatedPrice(amountK) {
    const rawPrice = (amountK * 1000 / 1000) * config.marketPrice; // simple for 1k rate
    // Apply discount
    const discActive = els.discountToggle?.checked;
    const discId = els.discountSelect?.value || 0;
    const discObj = config.customDiscounts.find(d => d.id == discId);
    const discVal = (discActive && discObj) ? discObj.value : 0;

    const final = rawPrice * (1 - discVal / 100);
    return (Math.ceil(final * 100) / 100).toFixed(2);
}

function updateMessagePreview() {
    const tpl = els.templateInput ? els.templateInput.value : "";

    // Gen list
    let listText = "";
    const checkboxes = document.querySelectorAll('.pkg-checkbox:checked');
    checkboxes.forEach(cb => {
        const val = Number(cb.value);
        if (val > 0) {
            const price = getCalculatedPrice(val);
            listText += `• ${val}k Coins ➔ $${price} USDT\n`;
        }
    });

    let msg = tpl
        .replace(/{stock_total}/g, "100,000") // Mock stock
        .replace(/{stock_k}/g, "100")
        .replace(/{tasa}/g, config.marketPrice)
        .replace(/{lista_paquetes}/g, listText);

    if (els.messageOutput) els.messageOutput.textContent = msg;

    // Auto-save debounced would go here
}


// --- CURRENCY SUMMARY (VISUAL ONLY) ---
// --- DASHBOARD SYNC (KPIs & Currency) ---
async function syncDashboardData() {
    const price = config.marketPrice;
    const adenaRate = config.adenaRate || 30000;

    // 1. Update Rates Visuals
    const elRateUsdt = document.getElementById('rate-usdt');
    const elRateAdena = document.getElementById('rate-adena');
    const elRateCross = document.getElementById('rate-cross');

    if (elRateUsdt) elRateUsdt.innerText = `$${price} USDT`;
    if (elRateAdena) elRateAdena.innerText = `${adenaRate.toLocaleString()} Adena`;
    if (price > 0 && elRateCross) {
        const cross = (adenaRate * 1000) / price;
        elRateCross.innerText = `${Math.floor(cross).toLocaleString()} Adena`;
    }

    // 2. Fetch Real Data for KPIs
    try {
        // A. Partners (Total Pool)
        const { data: partners } = await supabaseClient.from('partners').select('coins_invested');
        const totalPool = partners ? partners.reduce((sum, p) => sum + (p.coins_invested || 0), 0) : 0;

        // B. Sales (Logic mirrored from script.js)
        const { data: sales } = await supabaseClient.from('sales').select('*');

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let monthlyCoinsSold = 0;
        let totalCoinsSold = 0;
        let totalSalesUSDT = 0;
        let salePrices = [];

        if (sales) {
            sales.forEach(s => {
                const amount = Number(s.amount) || 0;
                const sPrice = Number(s.price) || 0;
                const saleDate = new Date(s.date);

                // script.js mirror: Sum amount for ALL sales regardless of type
                totalCoinsSold += amount;

                // script.js mirror: (amount * price) / 1000 for ALL sales in ROI calc
                totalSalesUSDT += (amount * sPrice) / 1000;

                if (sPrice > 0) salePrices.push(sPrice);

                // script.js mirror: calculateMonthlySales sums amount for current month
                if (saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
                    monthlyCoinsSold += amount;
                }
            });
        }

        // C. Inventory Value (kpi-stock in main dashboard uses getInventoryTotal)
        const totalInventoryValue = assets.reduce((sum, a) => sum + (a.stock * a.usdtValue), 0);

        // D. Update DOM
        // Currency Panel
        const elCoins = document.getElementById('currency-coins');
        const elAdena = document.getElementById('currency-adena');
        const elUsdt = document.getElementById('currency-usdt');

        if (elCoins) elCoins.innerText = new Intl.NumberFormat().format(totalPool);
        if (elAdena) elAdena.innerText = new Intl.NumberFormat().format(totalPool * adenaRate);
        if (elUsdt) {
            const poolValueUSDT = (totalPool / 1000) * price;
            elUsdt.innerText = '$' + poolValueUSDT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // KPI Grid
        const elKpiIncome = document.getElementById('kpi-income');
        const elKpiStock = document.getElementById('kpi-stock');
        const elKpiVol = document.getElementById('kpi-vol');
        const elKpiRoi = document.getElementById('kpi-roi');

        if (elKpiIncome) elKpiIncome.innerText = `${new Intl.NumberFormat().format(monthlyCoinsSold)} Coins`;
        if (elKpiStock) elKpiStock.innerText = `$${totalInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // ROI Histórico (Exacting script.js logic)
        const totalInitialCoins = totalPool + totalCoinsSold;
        const totalInitialValueUSDT = (totalInitialCoins * price) / 1000;

        let roiHist = 0;
        if (totalInitialValueUSDT > 0) {
            roiHist = (totalSalesUSDT / totalInitialValueUSDT) * 100;
        }

        if (elKpiRoi) {
            elKpiRoi.innerText = (roiHist >= 0 ? '+' : '') + roiHist.toFixed(2) + '%';
            elKpiRoi.className = `text-2xl font-bold ${roiHist > 0 ? 'text-green-400' : 'text-zinc-500'}`;
        }

        // Volatilidad (Exacting script.js logic: uses ALL sale prices)
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

        // Live Feed Updates
        if (els.ticker) {
            els.ticker.innerText = `LIVE FEED: $${price.toFixed(2)}/1k`;
        }
    } catch (err) {
        console.error("Error syncing dashboard data:", err);
    }
}



// --- COPY ---
function copySmartMessage() {
    const text = els.messageOutput.innerText;
    navigator.clipboard.writeText(text).then(() => {
        alert("Mensaje copiado!");
    });
}

function insertTag(tag) {
    const ta = els.templateInput;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    ta.value = text.substring(0, start) + tag + text.substring(end);
    updateMessagePreview();
}

// Start
document.addEventListener('DOMContentLoaded', initPage);
