
// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://zbplunkujlsxyspiedqe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGx1bmt1amxzeHlzcGllZHFlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg3ODQzOSwiZXhwIjoyMDg0NDU0NDM5fQ.RKI_6VfeNrr3WTjZKBX_70DJEvhahSD190FBg4zu-Iw';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// --- STATE ---
const config = {
    marketPrice: 0.63,
    partners: []
};

let sales = [];
let assets = [];

// --- UTILS ---
const fmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
const fmtPrice = (val) => parseFloat(val).toFixed(3);

// --- INITIALIZATION ---
async function initPage() {
    console.log("🚀 Initializing Ventas Module...");
    await loadData();
    initListeners();
}

async function loadData() {
    if (!supabaseClient) {
        alert("CRITICAL: Supabase not initialized.");
        return;
    }

    try {
        // 1. Config
        const { data: dbConfig } = await supabaseClient.from('config').select('*').eq('id', 1).single();
        if (dbConfig) {
            config.marketPrice = Number(dbConfig.market_price) || 0.63;
        }

        // 2. Partners
        const { data: dbPartners } = await supabaseClient.from('partners').select('*').order('id');
        if (dbPartners) {
            config.partners = dbPartners.map(p => ({
                id: p.id,
                name: p.name,
                coinsInvested: p.coins_invested || 0
            }));
        }

        // 3. Sales
        const { data: dbSales } = await supabaseClient.from('sales').select('*').order('date', { ascending: false });
        if (dbSales) {
            sales = dbSales;
        }

        // 4. Assets
        const { data: dbAssets } = await supabaseClient.from('assets').select('*');
        if (dbAssets) {
            assets = dbAssets.map(a => ({
                id: a.id,
                name: a.name,
                stock: Number(a.stock) || 0,
                usdtValue: Number(a.usdt_value) || 0
            }));
        }

        populateSalePartnerSelect();
        populateSaleItemSelect();
        renderSalesHistory();
        updateSalesStats();
        updateCurrencyPanel();

        console.log("✅ Ventas Data Loaded");
    } catch (err) {
        console.error("Fatal Error Loading Data:", err);
    }
}

function updateCurrencyPanel() {
    const totalCoins = config.partners.reduce((sum, p) => sum + p.coinsInvested, 0);
    const totalUSDT = (totalCoins / 1000) * config.marketPrice;
    const totalAdena = totalCoins * 30000; // Adena rate

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
    if (elRateAdena) elRateAdena.innerText = `30,000 Adena`;
    if (config.marketPrice > 0 && elRateCross) {
        const cross = (30000 * 1000) / config.marketPrice;
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

    const totalInventoryValue = assets.reduce((sum, a) => sum + (a.stock * (a.usdtValue || 0)), 0);
    const elKpiStock = document.getElementById('kpi-stock');
    if (elKpiStock) elKpiStock.innerText = `$${totalInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const totalCoins = config.partners.reduce((sum, p) => sum + p.coinsInvested, 0);
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
    const saleType = document.getElementById('sale-type');
    const salePartner = document.getElementById('container-sale-partner');
    const saleItem = document.getElementById('container-sale-item');
    const saleAmount = document.getElementById('sale-amount');
    const salePrice = document.getElementById('sale-price');

    if (saleType) {
        saleType.addEventListener('change', (e) => {
            if (e.target.value === 'item') {
                salePartner.classList.add('hidden');
                saleItem.classList.remove('hidden');
            } else {
                salePartner.classList.remove('hidden');
                saleItem.classList.add('hidden');
            }
            updateSalePreview();
        });
    }

    if (saleAmount) saleAmount.addEventListener('input', updateSalePreview);
    if (salePrice) salePrice.addEventListener('input', updateSalePreview);
}

// --- POPULATE SELECTS ---
function populateSalePartnerSelect() {
    const select = document.getElementById('sale-partner');
    if (!select) return;

    select.innerHTML = '<option value="">Seleccionar socio...</option>';
    config.partners.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name.toUpperCase();
        select.appendChild(opt);
    });
}

function populateSaleItemSelect() {
    const select = document.getElementById('sale-item');
    if (!select) return;

    select.innerHTML = '<option value="">Seleccionar item...</option>';
    assets.forEach(a => {
        if (a.stock > 0) {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = `${a.name} (Stock: ${a.stock})`;
            select.appendChild(opt);
        }
    });
}

// --- SALE PREVIEW ---
function updateSalePreview() {
    const amount = parseInt(document.getElementById('sale-amount')?.value) || 0;
    const price = parseFloat(document.getElementById('sale-price')?.value) || 0;

    const profitUSDT = (amount / 1000) * price;

    const previewUsdt = document.getElementById('sale-preview-usdt');
    const previewRemaining = document.getElementById('sale-preview-remaining');

    if (previewUsdt) previewUsdt.innerText = fmt(profitUSDT);
    if (previewRemaining) {
        const totalCoins = config.partners.reduce((sum, p) => sum + p.coinsInvested, 0);
        previewRemaining.innerText = new Intl.NumberFormat().format(Math.max(0, totalCoins - amount));
    }
}

// --- REGISTER SALE ---
async function registerSale() {
    const saleType = document.getElementById('sale-type')?.value || 'individual';
    const amount = parseInt(document.getElementById('sale-amount')?.value) || 0;
    const price = parseFloat(document.getElementById('sale-price')?.value) || 0;

    if (amount <= 0) {
        alert('Por favor, ingresa una cantidad válida.');
        return;
    }
    if (price <= 0) {
        alert('Por favor, ingresa un precio válido.');
        return;
    }

    if (saleType === 'item') {
        await registerItemSale(amount, price);
    } else if (saleType === 'individual') {
        await registerIndividualSale(amount, price);
    } else {
        await registerGlobalSale(amount, price);
    }
}

async function registerIndividualSale(amount, price) {
    const partnerId = parseInt(document.getElementById('sale-partner')?.value);
    if (!partnerId) {
        alert('Por favor, selecciona un socio.');
        return;
    }

    const partner = config.partners.find(p => p.id === partnerId);
    if (!partner) {
        alert('Socio no encontrado.');
        return;
    }

    if (amount > partner.coinsInvested) {
        alert(`El socio ${partner.name} solo tiene ${new Intl.NumberFormat().format(partner.coinsInvested)} Coins disponibles.`);
        return;
    }

    const profit = (amount / 1000) * price - (amount / 1000) * config.marketPrice;

    const confirmMsg = `¿Registrar venta individual?\n\n` +
        `Socio: ${partner.name}\n` +
        `Cantidad: ${new Intl.NumberFormat().format(amount)} Coins\n` +
        `Precio: $${fmtPrice(price)} USDT/1k\n` +
        `Ganancia: ${fmt(profit)}\n\n` +
        `Los Coins se descontarán de ${partner.name}`;

    if (!confirm(confirmMsg)) return;

    // Insert sale
    const { data: newSale, error } = await supabaseClient
        .from('sales')
        .insert([{
            date: new Date().toISOString(),
            type: 'individual',
            partner_id: partnerId,
            partner_name: partner.name,
            amount: amount,
            price: price,
            profit: profit,
            confirmed: false
        }])
        .select()
        .single();

    if (error) { alert('Error DB: ' + error.message); return; }

    // Update partner coins
    const newBalance = partner.coinsInvested - amount;
    await supabaseClient.from('partners').update({ coins_invested: newBalance }).eq('id', partnerId);
    partner.coinsInvested = newBalance;

    sales.unshift(newSale);
    renderSalesHistory();
    updateSalesStats();
    clearForm();

    alert(`Venta registrada exitosamente! ${new Intl.NumberFormat().format(amount)} Coins descontados de ${partner.name}.`);
}

async function registerGlobalSale(amount, price) {
    const totalCoins = config.partners.reduce((sum, p) => sum + p.coinsInvested, 0);

    if (amount > totalCoins) {
        alert(`No hay suficientes Coins. Disponible: ${new Intl.NumberFormat().format(totalCoins)} Coins.`);
        return;
    }

    const profit = (amount / 1000) * price - (amount / 1000) * config.marketPrice;

    // Calculate distribution
    const distribution = [];
    let remaining = amount;

    config.partners.forEach((p, i) => {
        const share = i === config.partners.length - 1
            ? remaining
            : Math.floor((p.coinsInvested / totalCoins) * amount);

        if (share > 0) {
            const partnerProfit = (share / 1000) * price - (share / 1000) * config.marketPrice;
            distribution.push({
                partnerId: p.id,
                partnerName: p.name,
                coins: share,
                profit: partnerProfit
            });
            remaining -= share;
        }
    });

    const confirmMsg = `¿Registrar venta GLOBAL?\n\n` +
        `Total: ${new Intl.NumberFormat().format(amount)} Coins\n` +
        `Precio: $${fmtPrice(price)} USDT/1k\n` +
        `Ganancia: ${fmt(profit)}\n\n` +
        `Distribución:\n` +
        distribution.map(d => `  ${d.partnerName}: ${new Intl.NumberFormat().format(d.coins)} Coins`).join('\n');

    if (!confirm(confirmMsg)) return;

    // Insert sale
    const { data: newSale, error } = await supabaseClient
        .from('sales')
        .insert([{
            date: new Date().toISOString(),
            type: 'global',
            amount: amount,
            price: price,
            profit: profit,
            distribution: distribution,
            confirmed: false
        }])
        .select()
        .single();

    if (error) { alert('Error DB: ' + error.message); return; }

    // Update partners
    for (const d of distribution) {
        const p = config.partners.find(partner => partner.id === d.partnerId);
        if (p) {
            const newBal = p.coinsInvested - d.coins;
            await supabaseClient.from('partners').update({ coins_invested: newBal }).eq('id', p.id);
            p.coinsInvested = newBal;
        }
    }

    sales.unshift(newSale);
    renderSalesHistory();
    updateSalesStats();
    clearForm();

    alert('Venta GLOBAL registrada exitosamente!');
}

async function registerItemSale(amount, price) {
    const itemId = parseInt(document.getElementById('sale-item')?.value);
    if (!itemId) {
        alert('Por favor, selecciona un item.');
        return;
    }

    const item = assets.find(a => a.id === itemId);
    if (!item) {
        alert('Item no encontrado.');
        return;
    }

    if (amount > item.stock) {
        alert(`Stock insuficiente. Disponible: ${item.stock} ${item.name}`);
        return;
    }

    const profit = price - (amount * item.usdtValue);

    const confirmMsg = `¿Registrar venta de item?\n\n` +
        `Item: ${item.name}\n` +
        `Cantidad: ${amount}\n` +
        `Precio: $${price.toFixed(2)} USDT\n` +
        `Ganancia: ${fmt(profit)}`;

    if (!confirm(confirmMsg)) return;

    // Insert sale
    const { data: newSale, error } = await supabaseClient
        .from('sales')
        .insert([{
            date: new Date().toISOString(),
            type: 'item_sale',
            item_id: itemId,
            item_name: item.name,
            amount: amount,
            price: price,
            profit: profit,
            confirmed: false
        }])
        .select()
        .single();

    if (error) { alert('Error DB: ' + error.message); return; }

    // Update stock
    const newStock = item.stock - amount;
    await supabaseClient.from('assets').update({ stock: newStock }).eq('id', itemId);
    item.stock = newStock;

    sales.unshift(newSale);
    renderSalesHistory();
    updateSalesStats();
    populateSaleItemSelect();
    clearForm();

    alert(`Venta de ${amount}x ${item.name} registrada exitosamente!`);
}

// --- RENDER SALES HISTORY ---
function renderSalesHistory() {
    const tbody = document.getElementById('sales-history-body');
    if (!tbody) return;

    if (sales.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-8 text-center text-zinc-500 text-sm">
                    No hay ventas registradas
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    sales.forEach(sale => {
        const date = new Date(sale.date);
        const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const dateTimeStr = `${dateStr} ${timeStr}`;

        const tr = document.createElement('tr');
        tr.className = 'border-b border-white/5 hover:bg-white/[0.02] transition-colors group';

        const partnerDisplay = sale.type === 'global'
            ? `<span class="text-[#ff00ff] font-bold">Coin Global</span>`
            : (sale.type === 'item_sale' && sale.item_name ? sale.item_name : sale.partner_name);

        const statusBadge = sale.confirmed
            ? '<span class="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold uppercase">✓ Confirmada</span>'
            : '<span class="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-[10px] font-bold uppercase">⏳ Pendiente</span>';

        const actionButtons = sale.confirmed
            ? '<span class="text-zinc-600 text-xs">-</span>'
            : `
                <button onclick="confirmSale(${sale.id})" class="opacity-0 group-hover:opacity-100 p-2 text-emerald-500/50 hover:text-emerald-500 transition-all" title="Confirmar venta">
                    <i data-lucide="check" class="w-4 h-4"></i>
                </button>
                <button onclick="deleteSale(${sale.id})" class="opacity-0 group-hover:opacity-100 p-2 text-red-500/50 hover:text-red-500 transition-all" title="Eliminar venta">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            `;

        tr.innerHTML = `
            <td class="py-4 text-sm text-zinc-400">${dateTimeStr}</td>
            <td class="py-4 text-sm font-bold uppercase">${partnerDisplay}</td>
            <td class="py-4 text-sm text-right font-mono text-[#00f2ff]">${new Intl.NumberFormat().format(sale.amount || 0)}</td>
            <td class="py-4 text-sm text-right font-mono text-zinc-400">$${fmtPrice(sale.price || 0)}</td>
            <td class="py-4 text-sm text-right font-mono text-emerald-400 font-bold">${fmt(sale.profit || 0)}</td>
            <td class="py-4 text-center">${statusBadge}</td>
            <td class="py-4 text-right">${actionButtons}</td>
        `;
        tbody.appendChild(tr);

        // Distribution for global sales
        if (sale.type === 'global' && sale.distribution) {
            const distTr = document.createElement('tr');
            distTr.className = 'border-b border-white/5 bg-white/[0.01]';
            distTr.innerHTML = `
                <td colspan="7" class="py-2 px-4">
                    <div class="text-xs text-zinc-500 space-y-1">
                        ${sale.distribution.map(d => `
                            <div class="flex justify-between">
                                <span>${d.partnerName}:</span>
                                <span>${new Intl.NumberFormat().format(d.coins)} Coins → ${fmt(d.profit)}</span>
                            </div>
                        `).join('')}
                    </div>
                </td>
            `;
            tbody.appendChild(distTr);
        }
    });
    lucide.createIcons();
}

// --- STATS ---
function updateSalesStats() {
    let totalSales = 0;
    let totalCoins = 0;
    let totalProfit = 0;

    sales.forEach(s => {
        if (s.type !== 'DEPOSIT' && s.type !== 'WITHDRAWAL') {
            totalSales++;
            totalCoins += s.amount || 0;
            totalProfit += s.profit || 0;
        }
    });

    const elSales = document.getElementById('stats-total-sales');
    const elCoins = document.getElementById('stats-total-coins');
    const elProfit = document.getElementById('stats-total-profit');

    if (elSales) elSales.innerText = totalSales;
    if (elCoins) elCoins.innerText = new Intl.NumberFormat().format(totalCoins);
    if (elProfit) elProfit.innerText = fmt(totalProfit);
}

// --- CONFIRM / DELETE ---
async function confirmSale(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale || sale.confirmed) return;

    if (!confirm('¿Confirmar esta venta? Una vez confirmada NO se podrá eliminar ni modificar.')) return;

    const { error } = await supabaseClient.from('sales').update({ confirmed: true }).eq('id', saleId);
    if (error) { alert('Error DB: ' + error.message); return; }

    sale.confirmed = true;
    renderSalesHistory();
    alert('Venta confirmada exitosamente!');
}

async function deleteSale(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;
    if (sale.confirmed) {
        alert('No se puede eliminar una venta confirmada.');
        return;
    }

    if (!confirm('¿Eliminar esta venta? Los recursos serán devueltos.')) return;

    // Restore resources
    if (sale.type === 'global' && sale.distribution) {
        for (const d of sale.distribution) {
            const p = config.partners.find(partner => partner.id === d.partnerId);
            if (p) {
                const newBal = p.coinsInvested + d.coins;
                await supabaseClient.from('partners').update({ coins_invested: newBal }).eq('id', p.id);
                p.coinsInvested = newBal;
            }
        }
    } else if (sale.type === 'item_sale') {
        const item = assets.find(a => a.id === sale.item_id);
        if (item) {
            const newStock = item.stock + sale.amount;
            await supabaseClient.from('assets').update({ stock: newStock }).eq('id', item.id);
            item.stock = newStock;
        }
    } else if (sale.partner_id) {
        const p = config.partners.find(partner => partner.id === sale.partner_id);
        if (p) {
            const newBal = p.coinsInvested + sale.amount;
            await supabaseClient.from('partners').update({ coins_invested: newBal }).eq('id', p.id);
            p.coinsInvested = newBal;
        }
    }

    // Delete sale
    const { error } = await supabaseClient.from('sales').delete().eq('id', saleId);
    if (error) { alert('Error DB: ' + error.message); return; }

    const index = sales.findIndex(s => s.id === saleId);
    if (index > -1) sales.splice(index, 1);

    renderSalesHistory();
    updateSalesStats();
    populateSalePartnerSelect();
    populateSaleItemSelect();

    alert('Venta eliminada y recursos devueltos exitosamente!');
}

// --- HELPERS ---
function clearForm() {
    document.getElementById('sale-amount').value = '';
    document.getElementById('sale-price').value = '';
    updateSalePreview();
}

// Start
document.addEventListener('DOMContentLoaded', initPage);
