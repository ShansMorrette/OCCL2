
// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://zbplunkujlsxyspiedqe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGx1bmt1amxzeHlzcGllZHFlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg3ODQzOSwiZXhwIjoyMDg0NDU0NDM5fQ.RKI_6VfeNrr3WTjZKBX_70DJEvhahSD190FBg4zu-Iw';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// --- STATE ---
const config = {
    marketPrice: 0.63,
    adenaRate: 30000,
    partners: []
};

let sales = [];

// --- UTILS ---
const fmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

function coinsToUSDT(coins) {
    return (coins / 1000) * config.marketPrice;
}

// --- INITIALIZATION ---
async function initPage() {
    console.log("🚀 Initializing Socios Module...");
    await loadData();
}

async function loadData() {
    if (!supabaseClient) {
        alert("CRITICAL: Supabase not initialized.");
        return;
    }

    try {
        // 1. Config (Market Price, Adena Rate)
        const { data: dbConfig } = await supabaseClient.from('config').select('*').eq('id', 1).single();
        if (dbConfig) {
            config.marketPrice = Number(dbConfig.market_price) || 0.63;
            config.adenaRate = Number(dbConfig.adena_rate) || 30000;
        }

        // 2. Partners
        const { data: dbPartners } = await supabaseClient.from('partners').select('*').order('id');
        if (dbPartners && dbPartners.length > 0) {
            config.partners = dbPartners.map(p => ({
                id: p.id,
                name: p.name,
                coinsInvested: p.coins_invested || 0,
                perc: 0
            }));
        }

        // 3. Sales (for ROI calculation)
        const { data: dbSales } = await supabaseClient.from('sales').select('*');
        if (dbSales) {
            sales = dbSales.map(s => ({
                amount: s.amount || 0,
                price: s.price || 0,
                date: s.date
            }));
        }

        // Calculate percentages
        calculatePartnerPercentages();

        // Render
        renderPartnersGrid();
        updateCurrencyPanel();

        console.log("✅ Socios Data Loaded");

    } catch (err) {
        console.error("Fatal Error Loading Data:", err);
    }
}

// --- BUSINESS LOGIC ---
function getTotalCoins() {
    return config.partners.reduce((sum, p) => sum + (p.coinsInvested || 0), 0);
}

function calculatePartnerPercentages() {
    const total = getTotalCoins();
    if (total === 0) return;

    config.partners.forEach(p => {
        p.perc = ((p.coinsInvested || 0) / total) * 100;
    });
}

// --- RENDER ---
function renderPartnersGrid() {
    const container = document.getElementById('partners-grid');
    if (!container) return;

    container.innerHTML = '';

    if (config.partners.length === 0) {
        container.innerHTML = `
            <div class="col-span-full glass p-8 rounded-xl text-center">
                <i data-lucide="users" class="w-12 h-12 text-zinc-600 mx-auto mb-4"></i>
                <p class="text-zinc-500">No hay socios registrados</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    config.partners.forEach(p => {
        const coinsInvested = p.coinsInvested || 0;
        const usdtValue = coinsToUSDT(coinsInvested);

        // Determine badge
        let badge = 'MINOR';
        let badgeColor = 'text-zinc-500';
        if (p.perc >= 50) { badge = 'WHALE'; badgeColor = 'text-[#00f2ff]'; }
        else if (p.perc >= 25) { badge = 'MAJOR'; badgeColor = 'text-[#ff00ff]'; }

        const card = document.createElement('div');
        card.className = 'glass p-8 rounded-2xl border-t-2 border-[#00f2ff] hover:border-[#ff00ff] transition-all';
        card.innerHTML = `
            <div class="flex justify-between items-start mb-6">
                <h3 class="text-xl font-bold flex items-center gap-2 uppercase">
                    <i data-lucide="user" class="text-[#00f2ff]"></i>
                    ${p.name}
                </h3>
                <span class="text-[10px] glass px-2 py-1 rounded border-white/5 font-mono ${badgeColor}">${badge}</span>
            </div>
            <div class="space-y-4 text-sm">
                <div class="flex justify-between border-b border-white/5 pb-2">
                    <span class="text-zinc-500 font-bold tracking-widest text-[10px]">COINS INVERTIDOS</span>
                    <span class="neon-text-cyan font-mono">${new Intl.NumberFormat().format(coinsInvested)}</span>
                </div>
                <div class="flex justify-between border-b border-white/5 pb-2">
                    <span class="text-zinc-500 font-bold tracking-widest text-[10px]">PARTICIPACIÓN</span>
                    <span class="font-mono text-[#ff00ff]">${p.perc.toFixed(1)}%</span>
                </div>
                <div class="flex justify-between border-b border-white/5 pb-2">
                    <span class="text-zinc-500 font-bold tracking-widest text-[10px]">VALOR USDT</span>
                    <span class="font-mono">${fmt(usdtValue)}</span>
                </div>
                <div class="flex gap-2 mt-4">
                    <button onclick="depositCoins(${p.id})" class="flex-1 py-2 bg-[#00f2ff]/10 text-[#00f2ff] border border-[#00f2ff]/30 rounded hover:bg-[#00f2ff]/20 transition-all flex items-center justify-center gap-2">
                        <i data-lucide="plus-circle" class="w-4 h-4"></i>
                        <span class="text-xs font-bold uppercase tracking-widest">Agregar</span>
                    </button>
                    <button onclick="withdrawCoins(${p.id})" class="flex-1 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition-all flex items-center justify-center gap-2">
                        <i data-lucide="minus-circle" class="w-4 h-4"></i>
                        <span class="text-xs font-bold uppercase tracking-widest">Retirar</span>
                    </button>
                    <button onclick="deletePartner(${p.id})" class="py-2 px-3 bg-zinc-800/50 text-zinc-500 border border-zinc-700 rounded hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    lucide.createIcons();
}

function updateCurrencyPanel() {
    const totalCoins = getTotalCoins();
    const totalUSDT = coinsToUSDT(totalCoins);
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

    // Update KPIs (sync from sales data)
    updateKPIs();

    // Live feed
    const ticker = document.getElementById('ticker-price');
    if (ticker) ticker.innerText = `LIVE FEED: $${config.marketPrice.toFixed(2)}/1k`;
}

async function updateKPIs() {
    try {
        // Get current month sales for "Venta de Coins"
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let monthlyCoinsSold = 0;
        let totalCoinsSold = 0;
        let totalSalesUSDT = 0;
        let salePrices = [];

        if (sales && sales.length > 0) {
            sales.forEach(s => {
                const saleDate = new Date(s.date);
                const amount = s.amount || 0;
                const price = s.price || 0;

                totalCoinsSold += amount;
                totalSalesUSDT += (amount * price) / 1000;

                if (price > 0) salePrices.push(price);

                if (saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
                    monthlyCoinsSold += amount;
                }
            });
        }

        // KPI: Venta de Coins (Monthly)
        const elKpiIncome = document.getElementById('kpi-income');
        if (elKpiIncome) elKpiIncome.innerText = `${new Intl.NumberFormat().format(monthlyCoinsSold)} Coins`;

        // KPI: Items (USDT) - Get from assets
        const { data: dbAssets } = await supabaseClient.from('assets').select('*');
        let totalInventoryValue = 0;
        if (dbAssets) {
            totalInventoryValue = dbAssets.reduce((sum, a) => sum + (a.stock * (a.usdt_value || 0)), 0);
        }
        const elKpiStock = document.getElementById('kpi-stock');
        if (elKpiStock) elKpiStock.innerText = `$${totalInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // KPI: ROI Histórico
        const totalCoins = getTotalCoins();
        const totalInitialCoins = totalCoins + totalCoinsSold;
        const totalInitialValueUSDT = (totalInitialCoins * config.marketPrice) / 1000;

        let roiHist = 0;
        if (totalInitialValueUSDT > 0) {
            roiHist = (totalSalesUSDT / totalInitialValueUSDT) * 100;
        }

        const elKpiRoi = document.getElementById('kpi-roi');
        if (elKpiRoi) {
            elKpiRoi.innerText = (roiHist >= 0 ? '+' : '') + roiHist.toFixed(2) + '%';
            elKpiRoi.className = `text-2xl font-bold ${roiHist > 0 ? 'text-green-400' : 'text-zinc-500'}`;
        }

        // KPI: Volatilidad Mercado
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

    } catch (err) {
        console.error("Error updating KPIs:", err);
    }
}

// --- PARTNER ACTIONS ---
async function addPartner() {
    const nameInput = document.getElementById('new-partner-name');
    const coinsInput = document.getElementById('new-partner-coins');

    if (!nameInput || !coinsInput) {
        alert('Error interno: No se encuentran los campos de entrada.');
        return;
    }

    const name = nameInput.value.trim().toUpperCase();
    const coins = parseInt(coinsInput.value) || 0;

    if (!name) {
        alert('Por favor, escribe un nombre para el socio.');
        return;
    }
    if (coins <= 0) {
        alert('Por favor, ingresa una cantidad válida de Coins (mayor a 0).');
        return;
    }

    const currentTotal = getTotalCoins();
    const newTotal = currentTotal + coins;

    const confirmMsg = `¿Añadir socio ${name} con ${new Intl.NumberFormat().format(coins)} Coins?\n\n` +
        `Pool actual: ${new Intl.NumberFormat().format(currentTotal)} Coins\n` +
        `Pool nuevo: ${new Intl.NumberFormat().format(newTotal)} Coins\n` +
        `Participación: ${((coins / newTotal) * 100).toFixed(1)}%\n\n` +
        `Nota: Los % de todos los socios se recalcularán automáticamente.`;

    if (!confirm(confirmMsg)) return;

    // DB Insert
    const { data, error } = await supabaseClient
        .from('partners')
        .insert([{ name: name, coins_invested: coins }])
        .select()
        .single();

    if (error) { alert('Error DB: ' + error.message); return; }

    config.partners.push({
        id: data.id,
        name: data.name,
        coinsInvested: data.coins_invested
    });

    calculatePartnerPercentages();
    renderPartnersGrid();
    updateCurrencyPanel();

    nameInput.value = '';
    coinsInput.value = '';

    alert(`¡${new Intl.NumberFormat().format(coins)} Coins agregados exitosamente a ${name}!`);
}

async function depositCoins(partnerId) {
    const partner = config.partners.find(p => p.id === partnerId);
    if (!partner) {
        alert('Socio no encontrado.');
        return;
    }

    const amount = prompt(`¿Cuántos Coins deseas agregar a ${partner.name}?`, '0');
    if (amount === null) return;

    const coinsToAdd = parseInt(amount);
    if (isNaN(coinsToAdd) || coinsToAdd <= 0) {
        alert('Por favor, ingresa una cantidad válida de Coins.');
        return;
    }

    const newBalance = (partner.coinsInvested || 0) + coinsToAdd;
    const newPoolTotal = getTotalCoins() + coinsToAdd;

    const confirmMsg = `¿Confirmar ingreso de Coins?\n\n` +
        `Socio: ${partner.name}\n` +
        `Coins a agregar: ${new Intl.NumberFormat().format(coinsToAdd)}\n\n` +
        `Balance actual: ${new Intl.NumberFormat().format(partner.coinsInvested || 0)} Coins\n` +
        `Nuevo balance: ${new Intl.NumberFormat().format(newBalance)} Coins\n\n` +
        `Pool total actual: ${new Intl.NumberFormat().format(getTotalCoins())} Coins\n` +
        `Nuevo pool total: ${new Intl.NumberFormat().format(newPoolTotal)} Coins`;

    if (!confirm(confirmMsg)) return;

    // DB Update
    const { error } = await supabaseClient
        .from('partners')
        .update({ coins_invested: newBalance })
        .eq('id', partnerId);

    if (error) { alert('Error DB: ' + error.message); return; }

    // Register Transaction (DEPOSIT)
    await supabaseClient
        .from('sales')
        .insert([{
            date: new Date().toISOString(),
            type: 'DEPOSIT',
            partner_id: partnerId,
            partner_name: partner.name,
            amount: coinsToAdd,
            price: 0,
            profit: 0,
            confirmed: true
        }]);

    partner.coinsInvested = newBalance;
    calculatePartnerPercentages();
    renderPartnersGrid();
    updateCurrencyPanel();

    alert(`¡${new Intl.NumberFormat().format(coinsToAdd)} Coins agregados exitosamente a ${partner.name}!`);
}

async function withdrawCoins(partnerId) {
    const partner = config.partners.find(p => p.id === partnerId);
    if (!partner) {
        alert('Socio no encontrado.');
        return;
    }

    const currentCoins = partner.coinsInvested || 0;
    const amount = prompt(`¿Cuántos Coins deseas retirar de ${partner.name}?\nDisponible: ${new Intl.NumberFormat().format(currentCoins)}`, '0');
    if (amount === null) return;

    const coinsToWithdraw = parseInt(amount);
    if (isNaN(coinsToWithdraw) || coinsToWithdraw <= 0) {
        alert('Por favor, ingresa una cantidad válida de Coins.');
        return;
    }

    if (coinsToWithdraw > currentCoins) {
        alert(`No puedes retirar más de lo disponible (${new Intl.NumberFormat().format(currentCoins)} Coins).`);
        return;
    }

    const newBalance = currentCoins - coinsToWithdraw;
    const newPoolTotal = getTotalCoins() - coinsToWithdraw;

    const confirmMsg = `¿Confirmar RETIRO de Coins?\n\n` +
        `Socio: ${partner.name}\n` +
        `Coins a retirar: ${new Intl.NumberFormat().format(coinsToWithdraw)}\n\n` +
        `Balance actual: ${new Intl.NumberFormat().format(currentCoins)} Coins\n` +
        `Nuevo balance: ${new Intl.NumberFormat().format(newBalance)} Coins\n\n` +
        `Pool total actual: ${new Intl.NumberFormat().format(getTotalCoins())} Coins\n` +
        `Nuevo pool total: ${new Intl.NumberFormat().format(newPoolTotal)} Coins`;

    if (!confirm(confirmMsg)) return;

    // DB Update
    const { error } = await supabaseClient
        .from('partners')
        .update({ coins_invested: newBalance })
        .eq('id', partnerId);

    if (error) { alert('Error DB: ' + error.message); return; }

    // Register Transaction (WITHDRAWAL)
    await supabaseClient
        .from('sales')
        .insert([{
            date: new Date().toISOString(),
            type: 'WITHDRAWAL',
            partner_id: partnerId,
            partner_name: partner.name,
            amount: coinsToWithdraw,
            price: 0,
            profit: 0,
            confirmed: true
        }]);

    partner.coinsInvested = newBalance;
    calculatePartnerPercentages();
    renderPartnersGrid();
    updateCurrencyPanel();

    alert(`¡${new Intl.NumberFormat().format(coinsToWithdraw)} Coins retirados exitosamente de ${partner.name}!`);
}

async function deletePartner(partnerId) {
    const partner = config.partners.find(p => p.id === partnerId);
    if (!partner) return;

    if (!confirm(`¿Estás seguro de que deseas eliminar al socio ${partner.name}?\nEsta acción no se puede deshacer.`)) {
        return;
    }

    // DB Delete
    const { error } = await supabaseClient.from('partners').delete().eq('id', partnerId);
    if (error) { alert('Error DB: ' + error.message); return; }

    config.partners = config.partners.filter(p => p.id !== partnerId);
    calculatePartnerPercentages();
    renderPartnersGrid();
    updateCurrencyPanel();

    alert(`Socio ${partner.name} eliminado correctamente.`);
}

// Start
document.addEventListener('DOMContentLoaded', initPage);
