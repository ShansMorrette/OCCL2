const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://zbplunkujlsxyspiedqe.supabase.co'; // <--- PEGA TU URL AQUÍ
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGx1bmt1amxzeHlzcGllZHFlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg3ODQzOSwiZXhwIjoyMDg0NDU0NDM5fQ.RKI_6VfeNrr3WTjZKBX_70DJEvhahSD190FBg4zu-Iw'; // <--- DEBE EMPEZAR CON "eyJ..."
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// --- CONFIGURACIÓN Y ESTADO ---
const DEFAULT_CONFIG = {
    marketPrice: 0.63,      // USD per 1k Coins
    adenaRate: 30000,       // Adena per 1 Coin
    initialCapital: 0,
    partners: []
};

const DEFAULT_ASSETS = [];

// Variables Globales (Se llenan en loadData)
let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Copia profunda por defecto
let assets = [];
let sales = [];


let simState = {
    capital: 0,      // Empieza en 0
    monthly: 0,      // Empieza en 0
    risk: 3
};

let mainChart;

// --- ELEMENTOS DEL DOM ---
const els = {
    inputCap: document.getElementById('input-capital'),
    inputMon: document.getElementById('input-monthly'),
    inputRsk: document.getElementById('input-risk'),
    valRsk: document.getElementById('val-risk'),
    kpiRoi: document.getElementById('kpi-roi'),
    kpiVol: document.getElementById('kpi-vol'),
    kpiStock: document.getElementById('kpi-stock'),
    kpiIncome: document.getElementById('kpi-income'),
    ticker: document.getElementById('ticker-price'),
    sidebarLinks: document.querySelectorAll('#sidebar-nav [data-tab]'),
    tabSections: document.querySelectorAll('.tab-content'),
    pageTitle: document.getElementById('page-title'),
    cfgPrice: document.getElementById('cfg-market-price'),
    cfgAdena: document.getElementById('cfg-adena-rate'),
    cfgCap: document.getElementById('cfg-init-cap'),
    partnersList: document.getElementById('partners-config-list')
};

// --- UTILIDADES ---
const fmt = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
};

const fmtPrice = (val) => {
    // Formato sin ceros innecesarios
    return parseFloat(val.toFixed(3)).toString();
};

// --- GESTIÓN DE DATOS (SUPABASE) ---

async function loadData() {
    if (!supabaseClient) {
        console.error("Supabase no inicializado. Verifica index.html y credenciales.");
        alert("Error crítico: No se pudo conectar con Supabase. Revisa la consola.");
        return;
    }
    
    console.log("🔄 Cargando datos de Supabase...");
    
    // 1. Cargar Configuración
    const { data: dbConfig, error: errConfig } = await supabaseClient.from('config').select('*').eq('id', 1).single();
    if (errConfig) console.error("❌ Error cargando Config:", errConfig.message);
    if (dbConfig) {
        config.marketPrice = parseFloat(dbConfig.market_price);
        config.adenaRate = parseFloat(dbConfig.adena_rate);
        config.initialCapital = parseFloat(dbConfig.initial_capital);
        simState.capital = config.initialCapital;
    }

    // 2. Cargar Socios
    const { data: dbPartners, error: errPartners } = await supabaseClient.from('partners').select('*').order('id');
    if (errPartners) console.error("❌ Error cargando Socios:", errPartners.message);
    if (dbPartners && dbPartners.length > 0) {
        config.partners = dbPartners.map(p => ({
            id: p.id,
            name: p.name,
            coinsInvested: p.coins_invested,
            perc: 0 // Se calcula después
        }));
    }

    // 3. Cargar Assets
    const { data: dbAssets, error: errAssets } = await supabaseClient.from('assets').select('*').order('id');
    if (errAssets) console.error("❌ Error cargando Assets:", errAssets.message);
    if (dbAssets) {
        assets = dbAssets.map(a => ({
            id: a.id,
            name: a.name,
            stock: a.stock,
            usdtValue: parseFloat(a.usdt_value)
        }));
    }

    // 4. Cargar Ventas
    const { data: dbSales, error: errSales } = await supabaseClient.from('sales').select('*').order('date', { ascending: false });
    if (errSales) console.error("❌ Error cargando Ventas:", errSales.message);
    if (dbSales) {
        sales = dbSales.map(s => ({
            id: s.id,
            date: s.date,
            type: s.type,
            partnerId: s.partner_id,
            itemId: s.item_id,
            partnerName: s.partner_name,
            itemName: s.item_name,
            amount: s.amount,
            price: parseFloat(s.price),
            profit: parseFloat(s.profit),
            confirmed: s.confirmed,
            distribution: s.distribution
        }));
    }

    // Inicializar UI con datos cargados
    calculatePartnerPercentages();
    updateFormInputs(); // Actualizar inputs con datos de DB
    
    // Refrescar vistas específicas
    renderAssets();
    renderPartnersList();
    renderSalesHistory();
    updateSalesStats();
    updateGlobalKPIs();
    syncChart();
    
    console.log("✅ Datos cargados correctamente.");
}

function updateFormInputs() {
    if (els.cfgPrice) els.cfgPrice.value = config.marketPrice;
    if (els.cfgAdena) els.cfgAdena.value = config.adenaRate;
    if (els.cfgCap) els.cfgCap.value = config.initialCapital;
    // Sincronizar input visual del simulador
    if (els.inputCap) els.inputCap.value = config.initialCapital;
}

// Función de Migración (Ejecutar manualmente en consola: window.migrateToSupabase())
window.migrateToSupabase = async () => {
    if (!confirm("¿Estás seguro de subir los datos locales a Supabase? Esto podría duplicar datos si ya existen.")) return;
    
    const localConfig = JSON.parse(localStorage.getItem('l2_config'));
    const localAssets = JSON.parse(localStorage.getItem('l2_assets'));
    const localSales = JSON.parse(localStorage.getItem('l2_sales'));

    if (localConfig) {
        await supabaseClient.from('config').upsert({ 
            id: 1, 
            market_price: localConfig.marketPrice,
            adena_rate: localConfig.adenaRate,
            initial_capital: localConfig.initialCapital || 0
        });
        
        // Socios
        for (const p of localConfig.partners) {
            await supabaseClient.from('partners').insert({ name: p.name, coins_invested: p.coinsInvested });
        }
    }
    
    if (localAssets) {
        for (const a of localAssets) {
            await supabaseClient.from('assets').insert({ name: a.name, stock: a.stock, usdt_value: a.usdtValue });
        }
    }
    
    alert("Migración completada. Recarga la página.");
};

function saveAll() {
    // Deprecado: Ahora usamos Supabase directamente en las funciones de acción.
    // console.log("saveAll() llamado - Operación ignorada en modo Supabase");
}

// --- FUNCIONES DE VENTAS ---

function populateSalePartnerSelect() {
    const select = document.getElementById('sale-partner');
    if (!select) return;

    select.innerHTML = '<option value="" class="bg-zinc-900 text-white">Seleccionar socio...</option>';
    config.partners.forEach(p => {
        const option = document.createElement('option');
        option.className = 'bg-zinc-900 text-white';
        option.value = p.id;
        option.textContent = `${p.name} (${new Intl.NumberFormat().format(p.coinsInvested || 0)} Coins)`;
        select.appendChild(option);
    });
}

function updateSalePreview() {
    const saleType = document.getElementById('sale-type')?.value || 'individual';
    const amount = parseInt(document.getElementById('sale-amount')?.value) || 0;
    const price = parseFloat(document.getElementById('sale-price')?.value) || 0;

    const previewUSDT = document.getElementById('sale-preview-usdt');
    // Buscar elemento por ID. Si se perdió el ID por un render anterior defectuoso, intentamos recuperarlo por estructura.
    let previewRemaining = document.getElementById('sale-preview-remaining');
    if (!previewRemaining && previewUSDT) {
        const parentGrid = previewUSDT.closest('.grid');
        if (parentGrid && parentGrid.children[1]) {
            previewRemaining = parentGrid.children[1].querySelector('span:last-child');
        }
    }

    let profit = 0;
    let remaining = 0;
    let labelText = "Restante:";
    let valueClass = "text-[#ff00ff]"; // Default magenta (Coins)

    if (saleType === 'item') {
        const itemId = parseInt(document.getElementById('sale-item')?.value);
        const item = assets.find(a => a.id === itemId);
        profit = amount * price;
        remaining = item ? (item.stock - amount) : 0;
        labelText = "Stock restante:";
        valueClass = "text-zinc-300"; // Zinc/Blanco (Items)
    } else if (saleType === 'individual') {
        const partnerId = parseInt(document.getElementById('sale-partner')?.value);
        const partner = config.partners.find(p => p.id === partnerId);
        profit = (amount / 1000) * price;
        remaining = partner ? (partner.coinsInvested || 0) - amount : 0;
        labelText = "Coins restantes:";
    } else {
        // Global
        profit = (amount / 1000) * price;
        const currentGlobal = config.currencies ? config.currencies.coins : getTotalCoins();
        remaining = currentGlobal - amount;
        labelText = "Pool restante:";
    }

    if (previewUSDT) previewUSDT.innerText = fmt(profit);
    
    if (previewRemaining) {
        // Actualizamos el HTML del padre para asegurar que la etiqueta y el valor estén sincronizados
        // IMPORTANTE: Se incluye id="sale-preview-remaining" para no perder la referencia en futuras actualizaciones
        previewRemaining.parentElement.innerHTML = `
            <span class="text-zinc-500">${labelText}</span>
            <span class="ml-2 ${valueClass} font-mono font-bold" id="sale-preview-remaining">${new Intl.NumberFormat().format(Math.max(0, remaining))}</span>
        `;
    }
}


function populateSaleItemSelect() {
    const select = document.getElementById('sale-item');
    if (!select) return;

    // Guardar selección actual si existe
    const currentVal = select.value;
    select.innerHTML = '<option value="">Seleccionar item...</option>';

    assets.forEach(asset => {
        const option = document.createElement('option');
        option.className = 'bg-zinc-900 text-white';
        option.value = asset.id;
        option.textContent = `${asset.name} (Stock: ${new Intl.NumberFormat().format(asset.stock)})`;
        select.appendChild(option);
    });

    // Restaurar si aún existe
    if (assets.find(a => a.id == currentVal)) {
        select.value = currentVal;
    }
}


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

async function registerItemSale(amount, price) {
    const itemId = parseInt(document.getElementById('sale-item')?.value);
    const item = assets.find(a => a.id === itemId);

    if (!item) {
        alert('Por favor selecciona un item.');
        return;
    }

    if (item.stock < amount) {
        alert('No hay suficiente stock para realizar esta venta.');
        return;
    }

    const confirmMsg = `¿Confirmar VENTA DE ITEM?\n\n` +
        `Item: ${item.name}\n` +
        `Cantidad: ${new Intl.NumberFormat().format(amount)}\n` +
        `Precio Total: ${fmt(price)}\n\n` +
        `Stock restante: ${new Intl.NumberFormat().format(item.stock - amount)}`;

    if (!confirm(confirmMsg)) return;

    // 1. Actualizar Stock en DB
    const { error: assetError } = await supabaseClient
        .from('assets')
        .update({ stock: item.stock - amount })
        .eq('id', item.id);
    
    if (assetError) { alert('Error DB (Asset): ' + assetError.message); return; }

    // 2. Insertar Venta en DB
    const { data: saleData, error: saleError } = await supabaseClient
        .from('sales')
        .insert([{
            date: new Date().toISOString(),
            type: 'item_sale',
            item_id: item.id,
            item_name: item.name,
            amount: amount,
            price: price,
            profit: amount * price,
            confirmed: false
        }])
        .select()
        .single();

    if (saleError) { alert('Error DB (Sale): ' + saleError.message); return; }

    // 3. Actualizar Local
    item.stock -= amount;
    // Mapeamos la respuesta de DB al formato local
    addSaleToLocalList(saleData, 'VENTA ITEM');
    completeSaleTransaction();
}

async function registerIndividualSale(amount, price) {
    const partnerId = parseInt(document.getElementById('sale-partner')?.value);

    // ... resto de lógica original ...
    if (!partnerId) { alert('Selecciona socio'); return; }
    const partner = config.partners.find(p => p.id === partnerId);
    if (!partner) return;

    if ((partner.coinsInvested || 0) < amount) {
        alert('Saldo insuficiente'); return;
    }

    const ganancia = (amount / 1000) * price;
    // ... confirm ...
    if (!confirm(`Confirmar venta Coins de ${partner.name}?`)) return;

    // 1. Actualizar Partner en DB
    const { error: partnerError } = await supabaseClient
        .from('partners')
        .update({ coins_invested: (partner.coinsInvested || 0) - amount })
        .eq('id', partnerId);

    if (partnerError) { alert('Error DB (Partner): ' + partnerError.message); return; }

    // 2. Insertar Venta en DB
    const { data: saleData, error: saleError } = await supabaseClient
        .from('sales')
        .insert([{
            date: new Date().toISOString(),
            type: 'individual',
            partner_id: partnerId,
            partner_name: partner.name,
            amount: amount,
            price: price,
            profit: ganancia,
            confirmed: false
        }])
        .select()
        .single();

    if (saleError) { alert('Error DB (Sale): ' + saleError.message); return; }

    // 3. Actualizar Local
    partner.coinsInvested -= amount;
    addSaleToLocalList(saleData, partner.name);
    completeSaleTransaction();
}

async function registerGlobalSale(amount, price) {
    const totalCoins = getTotalCoins();
    if (totalCoins < amount) { alert('Saldo global insuficiente'); return; }

    const totalProfit = (amount / 1000) * price;
    if (!confirm('Confirmar Venta Global?')) return;

    const distribution = [];

    // 1. Actualizar cada socio en DB (Loop secuencial para asegurar integridad)
    for (const p of config.partners) {
        const share = Math.round(amount * (p.perc / 100));
        
        const { error } = await supabaseClient
            .from('partners')
            .update({ coins_invested: (p.coinsInvested || 0) - share })
            .eq('id', p.id);
            
        if (error) console.error(`Error actualizando socio ${p.name}:`, error);
        
        // Actualizar local
        p.coinsInvested = (p.coinsInvested || 0) - share;
        
        distribution.push({
            partnerId: p.id,
            partnerName: p.name,
            coins: share,
            profit: (share / 1000) * price
        });
    }

    // 2. Insertar Venta Global en DB
    const { data: saleData, error: saleError } = await supabaseClient
        .from('sales')
        .insert([{
            date: new Date().toISOString(),
            type: 'global',
            partner_name: 'VENTA GLOBAL',
            amount: amount,
            price: price,
            profit: totalProfit,
            confirmed: false,
            distribution: distribution // Guardamos JSONB
        }])
        .select()
        .single();

    if (saleError) { alert('Error DB (Sale Global): ' + saleError.message); return; }

    addSaleToLocalList(saleData, 'VENTA GLOBAL');
    completeSaleTransaction();
}

// Helper para añadir venta a la lista local tras respuesta de DB
function addSaleToLocalList(dbSale, displayName) {
    sales.unshift({
        id: dbSale.id,
        date: dbSale.date,
        type: dbSale.type,
        partnerId: dbSale.partner_id,
        itemId: dbSale.item_id,
        partnerName: dbSale.partner_name || displayName,
        itemName: dbSale.item_name,
        amount: dbSale.amount,
        price: parseFloat(dbSale.price),
        profit: parseFloat(dbSale.profit),
        confirmed: dbSale.confirmed,
        distribution: dbSale.distribution
    });
}

function completeSaleTransaction() {
    // Guardar todo
    // saveAll(); // Ya no es necesario
    
    // Recalcular porcentajes globales
    calculatePartnerPercentages();

    // Actualizar UI
    renderSalesHistory();
    updateSalesStats();
    renderPartnersList();
    updateGlobalKPIs();
    populateSalePartnerSelect();
    populateSaleItemSelect();
    syncChart();

    // Limpiar formulario
    document.getElementById('sale-partner').value = '';
    document.getElementById('sale-amount').value = '';
    document.getElementById('sale-price').value = '';
    updateSalePreview();

    alert('Venta registrada exitosamente!');
}

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
            : (sale.type === 'item_sale' && sale.itemName ? sale.itemName : sale.partnerName);

        const statusBadge = sale.confirmed
            ? '<span class="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold uppercase">✓ Confirmada</span>'
            : '<span class="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-[10px] font-bold uppercase">⏳ Pendiente</span>';

        const actionButtons = sale.confirmed
            ? '<span class="text-zinc-600 text-xs">-</span>'
            : `
                <button onclick="confirmSale(${sale.id})" class="opacity-0 group-hover:opacity-100 p-2 text-emerald-500/50 hover:text-emerald-500 transition-all" title="Confirmar venta">
                    <i data-lucide="check" class="w-4 h-4"></i>
                </button>
                <button onclick="editSale(${sale.id})" class="opacity-0 group-hover:opacity-100 p-2 text-[#00f2ff]/50 hover:text-[#00f2ff] transition-all" title="Editar venta">
                    <i data-lucide="pencil" class="w-4 h-4"></i>
                </button>
                <button onclick="deleteSale(${sale.id})" class="opacity-0 group-hover:opacity-100 p-2 text-red-500/50 hover:text-red-500 transition-all" title="Eliminar venta">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            `;

        tr.innerHTML = `
            <td class="py-4 text-sm text-zinc-400">${dateTimeStr}</td>
            <td class="py-4 text-sm font-bold uppercase">${partnerDisplay}</td>
            <td class="py-4 text-sm text-right font-mono text-[#00f2ff]">${new Intl.NumberFormat().format(sale.amount)}</td>
            <td class="py-4 text-sm text-right font-mono text-zinc-400">$${fmtPrice(sale.price)}</td>
            <td class="py-4 text-sm text-right font-mono text-emerald-400 font-bold">${fmt(sale.profit)}</td>
            <td class="py-4 text-center">${statusBadge}</td>
            <td class="py-4 text-right">${actionButtons}</td>
        `;
        tbody.appendChild(tr);

        // Si es venta global, agregar fila con distribución
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

function updateSalesStats() {
    const totalSales = sales.length;
    const totalCoins = sales.reduce((sum, s) => sum + s.amount, 0);
    const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);

    const statsSales = document.getElementById('stats-total-sales');
    const statsCoins = document.getElementById('stats-total-coins');
    const statsProfit = document.getElementById('stats-total-profit');

    if (statsSales) statsSales.innerText = totalSales.toString();
    if (statsCoins) statsCoins.innerText = new Intl.NumberFormat().format(totalCoins);
    if (statsProfit) statsProfit.innerText = fmt(totalProfit);
}

window.editSale = (saleId) => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    if (sale.confirmed) {
        alert('No se puede editar una venta ya confirmada.');
        return;
    }

    // Lógica específica para Items
    if (sale.type === 'item_sale') {
        // Buscar el item original en el inventario
        let item = assets.find(a => a.id === sale.itemId);
        if (!item && sale.itemName) {
            // Fallback por nombre si es un registro antiguo
            item = assets.find(a => a.name === sale.itemName);
        }

        if (!item) {
            alert('El item asociado ya no existe en el inventario.');
            return;
        }

        // Calcular stock máximo disponible (Stock actual + Lo que se va a devolver de esta venta)
        const maxStock = item.stock + sale.amount;

        // 1. Pedir nueva cantidad
        const newAmountStr = prompt(`Editar Cantidad (Máx disponible: ${maxStock}):`, sale.amount);
        if (newAmountStr === null) return; // Cancelado
        const newAmount = parseInt(newAmountStr);

        if (isNaN(newAmount) || newAmount <= 0 || newAmount > maxStock) {
            alert(`Cantidad inválida. Debe ser mayor a 0 y menor o igual a ${maxStock}.`);
            return;
        }

        // 2. Pedir nuevo precio total
        const newPriceStr = prompt(`Editar Precio Total Venta (USDT):`, sale.price);
        if (newPriceStr === null) return;
        const newPrice = parseFloat(newPriceStr);

        if (isNaN(newPrice) || newPrice < 0) {
            alert('Precio inválido.');
            return;
        }

        // Aplicar cambios
        item.stock = maxStock - newAmount; // Restaurar stock original y restar el nuevo
        sale.amount = newAmount;
        sale.price = newPrice;
        sale.profit = newAmount * newPrice; // Recalcular total

        saveAll();
        renderSalesHistory();
        updateSalesStats();
        renderAssets(); // Actualizar tabla de inventario
        updateGlobalKPIs();
        alert('Venta de item actualizada correctamente.');
    } else if (sale.type === 'individual') {
        // --- LÓGICA PARA EDITAR VENTAS DE COINS ---
        const partner = config.partners.find(p => p.id === sale.partnerId);
        if (!partner) {
            alert('El socio asociado a esta venta ya no existe.');
            return;
        }

        // 1. Calcular saldo disponible (Saldo actual + Lo que se devuelve de esta venta)
        const currentBalance = partner.coinsInvested || 0;
        const maxCoins = currentBalance + sale.amount;

        // 2. Pedir nueva cantidad
        const newAmountStr = prompt(`Editar Cantidad Coins (Máx: ${new Intl.NumberFormat().format(maxCoins)}):`, sale.amount);
        if (newAmountStr === null) return;
        const newAmount = parseInt(newAmountStr);

        if (isNaN(newAmount) || newAmount <= 0 || newAmount > maxCoins) {
            alert(`Cantidad inválida. Debe ser mayor a 0 y hasta ${new Intl.NumberFormat().format(maxCoins)}.`);
            return;
        }

        // 3. Pedir nuevo precio
        const newPriceStr = prompt(`Editar Precio por 1k (USDT):`, sale.price);
        if (newPriceStr === null) return;
        const newPrice = parseFloat(newPriceStr);

        if (isNaN(newPrice) || newPrice < 0) {
            alert('Precio inválido.');
            return;
        }

        // 4. Aplicar cambios: Restaurar saldo original y restar nuevo monto
        partner.coinsInvested = maxCoins - newAmount;

        // Actualizar Pool Global (Diferencia neta: +Devolución -NuevaVenta)
        if (config.currencies) {
            config.currencies.coins = (config.currencies.coins || 0) + (sale.amount - newAmount);
        }

        // Actualizar registro de Venta
        sale.amount = newAmount;
        sale.price = newPrice;
        sale.profit = (newAmount / 1000) * newPrice;

        calculatePartnerPercentages(); // Recalcular % de participación
        saveAll();
        renderSalesHistory();
        updateSalesStats();
        renderPartnersList();
        updateGlobalKPIs();
        syncChart();
        alert('Venta de Coins actualizada correctamente.');
    } else if (sale.type === 'global') {
        // --- LÓGICA PARA EDITAR VENTAS GLOBALES ---
        
        // 1. Calcular Pool Global disponible (Actual + Devolución de esta venta)
        const currentGlobal = config.currencies.coins || getTotalCoins();
        const maxCoins = currentGlobal + sale.amount;

        // 2. Pedir nueva cantidad
        const newAmountStr = prompt(`Editar Cantidad Global (Máx: ${new Intl.NumberFormat().format(maxCoins)}):`, sale.amount);
        if (newAmountStr === null) return;
        const newAmount = parseInt(newAmountStr);

        if (isNaN(newAmount) || newAmount <= 0 || newAmount > maxCoins) {
            alert(`Cantidad inválida. Debe ser mayor a 0 y hasta ${new Intl.NumberFormat().format(maxCoins)}.`);
            return;
        }

        // 3. Pedir nuevo precio
        const newPriceStr = prompt(`Editar Precio por 1k (USDT):`, sale.price);
        if (newPriceStr === null) return;
        const newPrice = parseFloat(newPriceStr);

        if (isNaN(newPrice) || newPrice < 0) {
            alert('Precio inválido.');
            return;
        }

        // 4. Revertir la venta anterior (Devolver Coins a los socios)
        if (sale.distribution) {
            // Si existe distribución guardada, usarla para devolución exacta
            sale.distribution.forEach(d => {
                const p = config.partners.find(pt => pt.id === d.partnerId);
                if (p) p.coinsInvested = (p.coinsInvested || 0) + d.coins;
            });
        } else {
            // Fallback: Devolver proporcionalmente al % actual (Heurística para ventas antiguas)
            config.partners.forEach(p => {
                const refund = Math.round(sale.amount * (p.perc / 100));
                p.coinsInvested = (p.coinsInvested || 0) + refund;
            });
        }

        // 5. Recalcular porcentajes con el capital devuelto (Estado "Pre-Venta")
        calculatePartnerPercentages();

        // 6. Aplicar la NUEVA venta (Descontar Coins y generar nueva distribución)
        const newDistribution = [];
        config.partners.forEach(p => {
            const share = Math.round(newAmount * (p.perc / 100));
            p.coinsInvested = (p.coinsInvested || 0) - share;
            
            newDistribution.push({
                partnerId: p.id,
                partnerName: p.name,
                coins: share,
                profit: (share / 1000) * newPrice
            });
        });

        // 7. Actualizar Pool Global
        if (config.currencies) {
            config.currencies.coins = maxCoins - newAmount;
        }

        // 8. Actualizar registro de Venta
        sale.amount = newAmount;
        sale.price = newPrice;
        sale.profit = (newAmount / 1000) * newPrice;
        sale.distribution = newDistribution; // Guardamos la distribución exacta

        // 9. Guardar y Refrescar
        calculatePartnerPercentages(); // Recalcular % finales
        saveAll();
        renderSalesHistory();
        updateSalesStats();
        renderPartnersList();
        updateGlobalKPIs();
        syncChart();
        alert('Venta Global actualizada correctamente.');
    } else {
        alert('Tipo de venta no editable.');
    }
};

async function confirmSale(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) {
        alert('Venta no encontrada.');
        return;
    }

    if (sale.confirmed) {
        alert('Esta venta ya está confirmada.');
        return;
    }

    const confirmMsg = `¿Confirmar esta venta?\n\n` +
        `${sale.type === 'global' ? 'Tipo: GLOBAL\n' : `Socio: ${sale.partnerName}\n`}` +
        `Cantidad: ${new Intl.NumberFormat().format(sale.amount)} Coins\n` +
        `Ganancia: ${fmt(sale.profit)}\n\n` +
        `Una vez confirmada, NO se podrá eliminar ni modificar.`;

    if (!confirm(confirmMsg)) return;

    // DB Update
    const { error } = await supabaseClient
        .from('sales')
        .update({ confirmed: true })
        .eq('id', saleId);

    if (error) { alert('Error DB: ' + error.message); return; }

    // Marcar como confirmada
    sale.confirmed = true;
    renderSalesHistory();
    alert('Venta confirmada exitosamente!');
}

async function deleteSale(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) {
        alert('Venta no encontrada.');
        return;
    }

    if (sale.confirmed) {
        alert('No se puede eliminar una venta confirmada.');
        return;
    }

    const confirmMsg = `¿Eliminar esta venta ${sale.type === 'global' ? 'GLOBAL' : ''}?\n\n` +
        `${sale.type === 'global' ? 'Tipo: GLOBAL\n' : `Socio: ${sale.partnerName}\n`}` +
        `Cantidad: ${new Intl.NumberFormat().format(sale.amount)} Coins\n` +
        `Ganancia: ${fmt(sale.profit)}\n\n` +
        `Los Coins se devolverán ${sale.type === 'global' ? 'a todos los socios' : 'al socio'}.`;

    if (!confirm(confirmMsg)) return;

    // 1. Revertir Saldos en DB
    if (sale.type === 'global' && sale.distribution) {
        // Devolver Coins a cada socio según la distribución
        for (const d of sale.distribution) {
            const partner = config.partners.find(p => p.id === d.partnerId);
            if (partner) {
                await supabaseClient.from('partners')
                    .update({ coins_invested: (partner.coinsInvested || 0) + d.coins })
                    .eq('id', partner.id);
                partner.coinsInvested = (partner.coinsInvested || 0) + d.coins;
            }
        }
    } else if (sale.type === 'item_sale') {
        // Devolver Stock de Item
        // Intentar buscar por ID primero, si no por nombre (legacy support)
        let item = null;
        if (sale.itemId) {
            item = assets.find(a => a.id === sale.itemId);
        } else if (sale.itemName) {
            item = assets.find(a => a.name === sale.itemName);
        }

        if (item) {
            await supabaseClient.from('assets')
                .update({ stock: item.stock + sale.amount })
                .eq('id', item.id);
            item.stock += sale.amount;
            alert(`Stock devuelto: +${sale.amount} ${item.name}`);
        } else {
            alert('Atención: El item original ya no existe en el inventario. No se pudo devolver el stock, pero la venta será eliminada.');
        }
    } else {
        // Venta individual
        const partner = config.partners.find(p => p.id === sale.partnerId);
        if (partner) {
            await supabaseClient.from('partners')
                .update({ coins_invested: (partner.coinsInvested || 0) + sale.amount })
                .eq('id', partner.id);
            partner.coinsInvested = (partner.coinsInvested || 0) + sale.amount;
        }
    }

    // 2. Eliminar Venta de DB
    const { error } = await supabaseClient.from('sales').delete().eq('id', saleId);
    if (error) { alert('Error eliminando venta de DB: ' + error.message); return; }

    // Recalcular porcentajes (Solo si afecta coins)
    if (sale.type !== 'item_sale') {
        calculatePartnerPercentages();
    }

    // Eliminar venta del historial
    const index = sales.findIndex(s => s.id === saleId);
    if (index > -1) {
        sales.splice(index, 1);
    }

    // Guardar y actualizar UI
    renderSalesHistory();
    updateSalesStats();
    if (sale.type === 'item_sale') renderAssets(); // Actualizar inventario UI
    renderPartnersList();
    updateGlobalKPIs();
    populateSalePartnerSelect();
    syncChart();

    alert('Venta eliminada y Coins devueltos exitosamente!');
}

// --- LÓGICA DE NEGOCIO ---

// Conversiones de divisas
function coinsToUSDT(coins) {
    return (coins / 1000) * config.marketPrice;
}

function usdtToCoins(usdt) {
    return (usdt / config.marketPrice) * 1000;
}

function usdtToAdena(usdt) {
    // Convertir USDT a Coins, luego Coins a Adena
    const coins = usdtToCoins(usdt);
    return coins * config.adenaRate;
}

function coinsToAdena(coins) {
    return coins * config.adenaRate;  // Ahora es directo: Adena por Coin
}

function adenaToCoins(adena) {
    return adena / config.adenaRate;
}

// Cálculo de participación de socios
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

function getInventoryTotal() {
    return assets.reduce((total, asset) => {
        // Ahora los assets tienen valor USDT directo
        if (asset.usdtValue) {
            return total + (asset.stock * asset.usdtValue);
        }
        return total;
    }, 0);
}

function calculateMonthlySales() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    if (!sales || !Array.isArray(sales)) return 0;

    return sales.reduce((total, sale) => {
        if (!sale.date) return total;
        // Solo contar ventas confirmadas si se decide así, pero por ahora sumamos todas o solo confirmadas?
        // El usuario no especificó, pero generalmente "Generado" implica algo ya hecho.
        // Si hay ventas pendientes, tal vez no deberían contar? 
        // Asumiré todas por simplicidad o solo confirmadas si quiero ser estricto.
        // Dado el feedback anterior, mejor cuento todas las que existen en el historial que ya descontaron stock.

        const saleDate = new Date(sale.date);
        if (saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
            return total + (sale.amount || 0);
        }
        return total;
    }, 0);
}

function updateGlobalKPIs() {
    const totalStock = getInventoryTotal();
    const totalCoins = config.currencies ? config.currencies.coins : getTotalCoins();
    const coinsUSDT = coinsToUSDT(totalCoins);
    const monthlyIncome = calculateMonthlySales();

    if (els.kpiStock) els.kpiStock.innerText = fmt(totalStock);
    if (els.kpiIncome) els.kpiIncome.innerText = `${new Intl.NumberFormat().format(monthlyIncome)} Coins`;
    if (els.ticker) els.ticker.innerText = `LIVE FEED: $${config.marketPrice.toFixed(2)}/1k`;

    // Actualizar displays de divisas
    const coinsDisplay = document.getElementById('currency-coins');
    const usdtDisplay = document.getElementById('currency-usdt');
    const adenaDisplay = document.getElementById('currency-adena');

    if (coinsDisplay) coinsDisplay.innerText = new Intl.NumberFormat().format(totalCoins);
    if (usdtDisplay) usdtDisplay.innerText = fmt(coinsUSDT);
    // Mostrar Valor Total en Adena (Total Pool * Tasa)
    if (adenaDisplay) {
        const totalAdenaValue = totalCoins * (config.adenaRate || 0);
        adenaDisplay.innerText = new Intl.NumberFormat().format(totalAdenaValue);
    }

    // Actualizar ROI Histórico (Recuperación de Inversión)
    if (els.kpiRoi) {
        // 1. Total Ventas (Recuperado)
        let totalSalesUSDT = 0;
        let totalCoinsSold = 0;

        if (sales && Array.isArray(sales)) {
            sales.forEach(s => {
                totalSalesUSDT += (s.amount * s.price) / 1000;
                totalCoinsSold += (s.amount || 0);
            });
        }

        // 2. Valor Inicial Estimado (Capital Total = Coins Actuales + Coins Vendidos)
        // Asumimos valorización al precio actual de mercado para simplificar base de cálculo
        const totalInitialCoins = totalCoins + totalCoinsSold;
        const totalInitialValueUSDT = (totalInitialCoins * config.marketPrice) / 1000;

        // 3. Cálculo %
        let roiHist = 0;
        if (totalInitialValueUSDT > 0) {
            roiHist = (totalSalesUSDT / totalInitialValueUSDT) * 100;
        }

        els.kpiRoi.innerText = `${roiHist.toFixed(2)}%`;
        els.kpiRoi.className = `text-2xl font-bold ${roiHist > 0 ? 'text-emerald-400' : 'text-zinc-500'}`;
    }

    // Actualizar Volatilidad Mercado (Spread)
    if (els.kpiVol) {
        let volText = "0%";
        let volClass = "text-2xl font-bold text-zinc-600";

        if (sales && sales.length > 0) {
            const prices = sales.map(s => Number(s.price)).filter(p => p > 0);
            if (prices.length > 0) {
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                // Spread
                const spread = ((max - min) / min) * 100;
                volText = `${spread.toFixed(1)}%`;

                if (spread > 20) volClass = "text-2xl font-bold text-red-500 neon-text-red";
                else if (spread > 10) volClass = "text-2xl font-bold text-amber-500";
                else volClass = "text-2xl font-bold text-emerald-400";
            }
        }
        els.kpiVol.innerText = volText;
        els.kpiVol.className = volClass;
    }

    // Actualizar convertidor de divisas
    updateCurrencyConverter();
}

function updateCurrencyConverter() {
    // 1,000 Coins a USDT
    const conv1 = document.getElementById('conv-coins-usdt');
    if (conv1) {
        const usdtPer1k = coinsToUSDT(1000);
        conv1.innerHTML = `
            <i data-lucide="arrow-right" class="w-3 h-3 text-[#00f2ff]"></i>
            <span class="text-zinc-400">1,000 Coins =</span>
            <span class="font-mono text-emerald-400">$${usdtPer1k.toFixed(2)} USDT</span>
        `;
    }

    // 1 Coin a Adena
    const conv2 = document.getElementById('conv-coin-adena');
    if (conv2) {
        const adenaPerCoin = config.adenaRate;
        conv2.innerHTML = `
            <i data-lucide="arrow-right" class="w-3 h-3 text-emerald-500"></i>
            <span class="text-zinc-400">1 Coin =</span>
            <span class="font-mono text-amber-400">${new Intl.NumberFormat().format(adenaPerCoin)} Adena</span>
        `;
    }

    // 1 USDT a Adena (calculado automáticamente)
    const conv3 = document.getElementById('conv-usdt-adena');
    if (conv3) {
        const adenaPerUSDT = usdtToAdena(1);
        conv3.innerHTML = `
            <i data-lucide="arrow-right" class="w-3 h-3 text-[#ff00ff]"></i>
            <span class="text-zinc-400">1 USDT =</span>
            <span class="font-mono text-amber-400">${new Intl.NumberFormat().format(Math.round(adenaPerUSDT))} Adena</span>
        `;
    }

    // Re-crear iconos de Lucide
    lucide.createIcons();
}

function runSimulation() {
    // updateGlobalKPIs(); // Eliminado para aislar simulación


    let balance = simState.capital;  // En Coins
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
        seriesData.push(Math.round(balance));  // Coins son enteros
        baselineData.push(Math.round(totalInvested));
    }

    const roiPerc = totalInvested > 0 ? ((balance / totalInvested) - 1) * 100 : 0;
    if (els.kpiRoi) els.kpiRoi.innerText = (roiPerc >= 0 ? '+' : '') + roiPerc.toFixed(1) + '%';
    if (els.kpiVol) els.kpiVol.innerText = (v * 100).toFixed(1) + '%';

    // Actualizar displays del simulador
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

    updatePartnerViews(roiPerc, totalInvested);
    return { seriesData, baselineData };
}

function updatePartnerViews(roiPerc, totalCapital) {
    const sectionSocios = document.getElementById('section-socios');
    if (!sectionSocios) return;

    // Recalcular porcentajes basados en Coins
    calculatePartnerPercentages();

    sectionSocios.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-4"></div>`;
    const container = sectionSocios.querySelector('div');

    config.partners.forEach(p => {
        const coinsInvested = p.coinsInvested || 0;
        const usdtValue = coinsToUSDT(coinsInvested);
        const share = p.perc / 100;
        const proyectedCoins = Math.round((totalCapital * (1 + roiPerc / 100)) * share);
        const proyectedUSDT = coinsToUSDT(proyectedCoins);

        // Determinar badge
        let badge = 'MINOR';
        let badgeColor = 'text-zinc-500';
        if (p.perc >= 50) { badge = 'WHALE'; badgeColor = 'text-[#00f2ff]'; }
        else if (p.perc >= 25) { badge = 'MAJOR'; badgeColor = 'text-[#ff00ff]'; }

        const card = document.createElement('div');
        card.className = 'glass p-8 rounded-2xl border-t-2 border-[#00f2ff]';
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
                <div class="flex justify-between pt-2">
                    <span class="text-zinc-500 text-[10px] font-bold tracking-widest uppercase">PROYECTADO (12M)</span>
                    <span class="text-green-400 font-bold font-mono">${new Intl.NumberFormat().format(proyectedCoins)} Coins</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-zinc-500 text-[10px] font-bold tracking-widest uppercase">≈ USDT</span>
                    <span class="text-green-400 font-mono text-xs">${fmt(proyectedUSDT)}</span>
                </div>
                <div class="flex gap-2 mt-4">
                    <button onclick="addCoinsToPartner(${p.id})" class="flex-1 py-2 bg-[#00f2ff]/10 text-[#00f2ff] border border-[#00f2ff]/30 rounded hover:bg-[#00f2ff]/20 transition-all flex items-center justify-center gap-2">
                        <i data-lucide="plus-circle" class="w-4 h-4"></i>
                        <span class="text-xs font-bold uppercase tracking-widest">Agregar</span>
                    </button>
                    <button onclick="withdrawCoinsFromPartner(${p.id})" class="flex-1 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition-all flex items-center justify-center gap-2">
                        <i data-lucide="minus-circle" class="w-4 h-4"></i>
                        <span class="text-xs font-bold uppercase tracking-widest">Retirar</span>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}




async function addCoinsToPartner(partnerId) {
    const partner = config.partners.find(p => p.id === partnerId);
    if (!partner) {
        alert('Socio no encontrado.');
        return;
    }

    const amount = prompt(`¿Cuántos Coins deseas agregar a ${partner.name}?`, '0');
    if (amount === null) return; // Usuario canceló

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

    // Agregar Coins al socio
    partner.coinsInvested = newBalance;

    // Recalcular porcentajes
    calculatePartnerPercentages();

    renderPartnersList();
    updateGlobalKPIs();
    populateSalePartnerSelect();
    syncChart();
    alert(`¡${new Intl.NumberFormat().format(coinsToAdd)} Coins agregados exitosamente a ${partner.name}!`);
}

async function withdrawCoinsFromPartner(partnerId) {
    const partner = config.partners.find(p => p.id === partnerId);
    if (!partner) {
        alert('Socio no encontrado.');
        return;
    }

    const currentCoins = partner.coinsInvested || 0;
    const amount = prompt(`¿Cuántos Coins deseas retirar de ${partner.name}?\nDisponible: ${new Intl.NumberFormat().format(currentCoins)}`, '0');
    if (amount === null) return; // Usuario canceló

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

    // Retirar Coins del socio
    partner.coinsInvested = newBalance;

    // Recalcular porcentajes
    calculatePartnerPercentages();

    renderPartnersList();
    updateGlobalKPIs();
    populateSalePartnerSelect();
    syncChart();
    alert(`¡${new Intl.NumberFormat().format(coinsToWithdraw)} Coins retirados exitosamente de ${partner.name}!`);
}

function renderAssets() {
    const tbody = document.getElementById('inventory-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    assets.forEach(asset => {
        const totalValueUSDT = (asset.stock * (asset.usdtValue || 0));
        const totalValueCoins = usdtToCoins(totalValueUSDT);

        const tr = document.createElement('tr');
        tr.className = 'border-b border-white/5 group hover:bg-white/[0.02] transition-colors';
        tr.innerHTML = `
            <td class="py-4 font-bold text-sm uppercase">${asset.name}</td>
            <td class="py-4 text-xs text-zinc-400 font-mono text-center relative group/edit">
                <div class="flex items-center justify-center gap-2">
                    <span>${new Intl.NumberFormat().format(asset.stock)}</span>
                    <button onclick="editAssetStock(${asset.id})" class="opacity-0 group-hover/edit:opacity-100 text-[#00f2ff] hover:text-white transition-all" title="Editar Stock">
                        <i data-lucide="pencil" class="w-3 h-3"></i>
                    </button>
                </div>
            </td>
            <td class="py-4 text-xs text-zinc-400 font-mono text-center relative group/price">
                <div class="flex items-center justify-center gap-2">
                    <span>${fmt(asset.usdtValue || 0)}</span>
                    <button onclick="editAssetPrice(${asset.id})" class="opacity-0 group-hover/price:opacity-100 text-[#00f2ff] hover:text-white transition-all" title="Editar Precio">
                        <i data-lucide="pencil" class="w-3 h-3"></i>
                    </button>
                </div>
            </td>
            <td class="py-4">
                <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                        <span class="neon-text-cyan font-mono text-sm">${fmt(totalValueUSDT)}</span>
                        <button onclick="deleteAsset(${asset.id})" class="opacity-0 group-hover:opacity-100 p-1 text-red-500/50 hover:text-red-500 transition-all">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                    <span class="text-[10px] text-[#00f2ff] font-mono">≈ ${new Intl.NumberFormat().format(Math.round(totalValueCoins))} Coins</span>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
    updateGlobalKPIs();

    // Update total inventory value display
    const totalInvValue = document.getElementById('total-inventory-value');
    if (totalInvValue) {
        totalInvValue.innerText = fmt(getInventoryTotal());
    }
}

// --- PANEL DE CONFIGURACIÓN ---

function renderPartnersList() {
    if (!els.partnersList) return;
    els.partnersList.innerHTML = '';
    config.partners.forEach(p => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 glass rounded border-white/5 mb-2';
        div.innerHTML = `
            <span class="text-sm font-bold uppercase">${p.name}</span>
            <div class="flex items-center gap-4">
                <span class="text-xs neon-text-magenta font-mono">${p.perc}%</span>
                <button onclick="deletePartner(${p.id})" class="text-zinc-600 hover:text-red-500">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        els.partnersList.appendChild(div);
    });
    lucide.createIcons();
}

window.deletePartner = async (id) => {
    const partner = config.partners.find(p => p.id === id);
    if (!partner) return;

    if (!confirm(`¿Estás seguro de que deseas eliminar al socio ${partner.name}?\nEsta acción no se puede deshacer.`)) {
        return;
    }

    // DB Delete
    const { error } = await supabaseClient.from('partners').delete().eq('id', id);
    if (error) { alert('Error DB: ' + error.message); return; }

    config.partners = config.partners.filter(p => p.id !== id);
    calculatePartnerPercentages(); // Recalcular porcentajes después de borrar
    renderPartnersList();
    runSimulation();
    syncChart();
};

window.deleteAsset = async (id) => {
    const { error } = await supabaseClient.from('assets').delete().eq('id', id);
    if (error) { alert('Error DB: ' + error.message); return; }

    assets = assets.filter(a => a.id !== id);
    renderAssets();
};

window.editAssetStock = async (id) => {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    const newStockStr = prompt(`Editar stock para ${asset.name}:`, asset.stock);
    if (newStockStr === null) return; // Cancelado

    const newStock = parseInt(newStockStr);
    if (isNaN(newStock) || newStock < 0) {
        alert('Por favor, ingresa una cantidad válida (número entero positivo).');
        return;
    }

    const { error } = await supabaseClient.from('assets').update({ stock: newStock }).eq('id', id);
    if (error) { alert('Error DB: ' + error.message); return; }

    asset.stock = newStock;
    renderAssets();
    updateGlobalKPIs();
};

window.editAssetPrice = async (id) => {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    const newPriceStr = prompt(`Editar precio unitario (USDT) para ${asset.name}:`, asset.usdtValue);
    if (newPriceStr === null) return; // Cancelado

    const newPrice = parseFloat(newPriceStr);
    if (isNaN(newPrice) || newPrice < 0) {
        alert('Por favor, ingresa un precio válido (número positivo).');
        return;
    }

    const { error } = await supabaseClient.from('assets').update({ usdt_value: newPrice }).eq('id', id);
    if (error) { alert('Error DB: ' + error.message); return; }

    asset.usdtValue = newPrice;
    renderAssets();
    updateGlobalKPIs();
};

// --- INICIALIZACIÓN ---

function initUI() {
    // Verificación de integridad de datos
    if (!config.partners || !Array.isArray(config.partners)) {
        config.partners = DEFAULT_CONFIG.partners;
    }

    // Navegación
    els.sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = link.getAttribute('data-tab');
            els.sidebarLinks.forEach(l => l.classList.remove('text-[#00f2ff]'));
            link.classList.add('text-[#00f2ff]');
            els.pageTitle.innerText = tab === 'resumen' ? 'GRÁFICO RESUMEN' : tab.toUpperCase();
            els.tabSections.forEach(sec => {
                sec.classList.add('hidden');
                sec.classList.remove('opacity-100');
                sec.classList.add('opacity-0');
            });
            const activeSec = document.getElementById(`section-${tab}`);
            if (activeSec) {
                activeSec.classList.remove('hidden');
                setTimeout(() => {
                    activeSec.classList.remove('opacity-0');
                    activeSec.classList.add('opacity-100');
                }, 50);
                
                // AUTO-REFRESH: Recargar datos al cambiar de pestaña
                loadData();
            }
        });
    });

    // Función Global para Añadir Socios con Coins
    window.addPartner = async function () {
        console.log('Ejecutando window.addPartner...');
        const nameInput = document.getElementById('new-partner-name');
        const coinsInput = document.getElementById('new-partner-coins');

        if (!nameInput || !coinsInput) {
            alert('Error interno: No se encuentran los campos de entrada.');
            return;
        }

        const name = nameInput.value ? nameInput.value.trim().toUpperCase() : '';
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

        // Mostrar confirmación con recalculo
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
        renderPartnersList();
        runSimulation(); // Recalcular KPIs
        syncChart();     // Actualizar gráficos

        nameInput.value = '';
        coinsInput.value = '';
    };



    els.inputCap.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        simState.capital = Math.max(0, val);
        syncChart();
    });
    els.inputMon.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        simState.monthly = Math.max(0, val);
        syncChart();
    });
    els.inputRsk.addEventListener('input', (e) => {
        simState.risk = Math.max(1, Math.min(5, parseInt(e.target.value) || 1));
        const labels = ['MUY BAJO', 'BAJO', 'MODERADO', 'ALTO', 'AGRESIVO'];
        if (els.valRsk) els.valRsk.innerText = labels[simState.risk - 1];
        syncChart();
    });

    document.getElementById('save-config-btn').addEventListener('click', async () => {
        config.marketPrice = parseFloat(els.cfgPrice.value) || 0;
        config.adenaRate = parseFloat(els.cfgAdena.value) || 1;
        config.initialCapital = parseFloat(els.cfgCap.value) || 0;

        const { error } = await supabaseClient.from('config').upsert({
            id: 1,
            market_price: config.marketPrice,
            adena_rate: config.adenaRate,
            initial_capital: config.initialCapital
        });

        if (error) { alert('Error guardando config: ' + error.message); return; }

        simState.capital = config.initialCapital;
        els.inputCap.value = config.initialCapital;

        renderAssets();
        renderPartnersList();
        updateCurrencyConverter();  // Actualizar convertidor
        syncChart();
        alert('Configuración Guardada y Aplicada');
    });

    document.getElementById('add-asset-btn').addEventListener('click', async () => {
        const nameInput = document.getElementById('new-asset-name');
        const stockInput = document.getElementById('new-asset-stock');
        const priceInput = document.getElementById('new-asset-price');
        const name = nameInput.value.trim();
        const stock = parseInt(stockInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;

        if (!name) {
            alert('Por favor, ingresa un nombre para el item.');
            return;
        }
        if (stock <= 0) {
            alert('Por favor, ingresa una cantidad válida mayor a 0.');
            return;
        }
        if (price < 0) {
            alert('Por favor, ingresa un precio válido (puede ser 0).');
            return;
        }

        const { data, error } = await supabaseClient
            .from('assets')
            .insert([{ name, stock, usdt_value: price }])
            .select()
            .single();

        if (error) { alert('Error DB: ' + error.message); return; }

        assets.push({ id: data.id, name: data.name, stock: data.stock, usdtValue: parseFloat(data.usdt_value) });
        renderAssets();
        nameInput.value = '';
        stockInput.value = '';
        priceInput.value = '';
    });

    // Evento eliminado: Usamos window.addPartner directo en el HTML

    // --- CHARTS (Re-implementación Robusta) ---

    // Configuración Base
    const chartBaseOpts = {
        chart: { background: 'transparent', toolbar: { show: false }, fontFamily: 'monospace' },
        theme: { mode: 'dark' },
        stroke: { curve: 'smooth', width: 2 },
        grid: { borderColor: 'rgba(255,255,255,0.05)' }
    };

    // Inicializar Charts (Solo una vez)
    const mainChartEl = document.querySelector("#main-chart");
    const simChartEl = document.querySelector("#sim-chart");

    if (!window.mainChartInstance && mainChartEl) {
        const options = {
            ...chartBaseOpts,
            series: [],
            chart: { type: 'area', height: 500, background: 'transparent', toolbar: { show: false } },
            stroke: { curve: 'smooth', width: 2 },
            colors: ['#00f2ff', '#ff00ff'],
            fill: { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0.05 } },
            dataLabels: { enabled: false },
            tooltip: { theme: 'dark' }
        };
        window.mainChartInstance = new ApexCharts(mainChartEl, options);
        window.mainChartInstance.render();
    }

    if (!window.simChartInstance && simChartEl) {
        const options = {
            ...chartBaseOpts,
            series: [],
            chart: { type: 'line', height: 300, background: 'transparent', toolbar: { show: false } }, // Altura reducida para simulador
            colors: ['#00f2ff', '#ff00ff']
        };
        window.simChartInstance = new ApexCharts(simChartEl, options);
        window.simChartInstance.render();
    }

    // Función de Sincronización Global
    window.syncChart = function () {
        // 1. Actualizar Gráfico de Simulación
        const simData = window.runSimulation ? window.runSimulation() : { seriesData: [], baselineData: [] };

        if (window.simChartInstance) {
            window.simChartInstance.updateSeries([
                { name: 'Portafolio Proyectado', data: simData.seriesData },
                { name: 'Inversión Total', data: simData.baselineData }
            ]);
        }

        // 2. Actualizar Gráfico Principal (Mercado Real)
        if (window.mainChartInstance) {
            // Datos Reales: Desglose por Socio Y Global
            const currentPool = getTotalCoins();
            const sortedSales = [...sales].sort((a, b) => new Date(a.date) - new Date(b.date));
            const poolData = [];

            // 1. Inicializar Mapa de Series
            const partnerSeriesMap = {};

            // A. Serie Global (Magenta)
            partnerSeriesMap['global'] = {
                name: 'Ventas Globales',
                type: 'area',
                data: []
            };

            // B. Series de Socios (Colores Variables)
            if (config.partners) {
                const colors = ['#fbbf24', '#22c55e', '#a855f7', '#f97316', '#3b82f6'];
                config.partners.forEach((p, index) => {
                    partnerSeriesMap[p.id] = {
                        name: p.name,
                        type: 'area',
                        data: [],
                        color: colors[index % colors.length]
                    };
                });
            }

            // 2. Agrupar Ventas
            const salesByDayAndEntity = {};
            const uniqueDates = new Set();

            if (sortedSales.length === 0) {
                poolData.push({ x: new Date().getTime(), y: currentPool });
            } else {
                sortedSales.forEach(s => {
                    const dateStr = new Date(s.date).toISOString().split('T')[0];
                    uniqueDates.add(dateStr);

                    if (!salesByDayAndEntity[dateStr]) salesByDayAndEntity[dateStr] = {};

                    // Asignar a ID de socio O 'global'
                    const entityId = s.partnerId ? s.partnerId : 'global';

                    if (!salesByDayAndEntity[dateStr][entityId]) salesByDayAndEntity[dateStr][entityId] = 0;
                    salesByDayAndEntity[dateStr][entityId] += (s.amount || 0);
                });

                const sortedDates = Array.from(uniqueDates).sort((a, b) => new Date(a) - new Date(b));

                sortedDates.forEach(date => {
                    const timestamp = new Date(date).getTime();
                    poolData.push({ x: timestamp, y: currentPool });

                    const daySales = salesByDayAndEntity[date];
                    Object.keys(partnerSeriesMap).forEach(key => {
                        const amount = daySales[key] || 0;
                        if (amount > 0) {
                            partnerSeriesMap[key].data.push({ x: timestamp, y: amount });
                        }
                    });
                });
            }

            // 3. Construir Series Finales
            const finalSeries = [
                { name: 'Total Pool Coins', type: 'area', data: poolData, color: '#00f2ff' }
            ];

            // Agregar Global si tiene datos
            if (partnerSeriesMap['global'].data.length > 0) {
                // Forzar color magenta si no se asignó arriba (aunque lo puse en A)
                partnerSeriesMap['global'].color = '#ff00ff';
                finalSeries.push(partnerSeriesMap['global']);
            }

            // Agregar Socios con datos
            Object.keys(partnerSeriesMap).forEach(key => {
                if (key !== 'global' && partnerSeriesMap[key].data.length > 0) {
                    finalSeries.push(partnerSeriesMap[key]);
                }
            });

            // Configuración del Gráfico
            window.mainChartInstance.updateOptions({
                chart: { type: 'area', stacked: false }, // Cambiado a Area (Visualmente igual a simulador pero con relleno)
                stroke: { curve: 'smooth', width: 2 },
                fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
                xaxis: {
                    type: 'datetime',
                    labels: {
                        formatter: function (val) {
                            if (typeof val === 'number' && val > 1000000000000) {
                                const d = new Date(val);
                                return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                            }
                            return val;
                        },
                        style: { colors: '#a1a1aa' }
                    }
                },
                tooltip: {
                    x: { format: 'dd MMM yyyy' },
                    theme: 'dark'
                },
                yaxis: [
                    {
                        title: { text: 'Pool Coins Total', style: { color: '#00f2ff' } },
                        labels: {
                            style: { colors: '#00f2ff' },
                            formatter: (val) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(val)
                        },
                        forceNiceScale: true,
                        decimalsInFloat: 0
                    },
                    {
                        opposite: true,
                        title: { text: 'Ventas (Coins)', style: { color: '#ffff00' } }, // Amarillo/Dorado para ventas
                        labels: { style: { colors: '#ffff00' } }
                    }
                ],
                colors: ['#00f2ff', '#e11d48', '#fbbf24', '#22c55e', '#a855f7', '#f97316'], // Azul (Pool) + Colores socios
                plotOptions: {} // Limpiamos opciones de barra
            });

            window.mainChartInstance.updateSeries(finalSeries);
        }

        updateGlobalKPIs();
    }

    // --- EVENTOS DE VENTAS ---

    // Cambio de tipo de venta
    // Cambio de tipo de venta
    const saleTypeSelect = document.getElementById('sale-type');
    if (saleTypeSelect) {
        saleTypeSelect.addEventListener('change', (e) => {
            const saleType = e.target.value;
            const containerPartner = document.getElementById('container-sale-partner');
            const containerItem = document.getElementById('container-sale-item');
            const individualPreview = document.getElementById('individual-preview');
            const globalPreview = document.getElementById('global-preview');
            const labelAmount = document.querySelector('label[for="sale-amount"]');
            const labelPrice = document.querySelector('label[for="sale-price"]');
            const priceInput = document.getElementById('sale-price');
            const amountInput = document.getElementById('sale-amount');
            const partnerSelect = document.getElementById('sale-partner');
            const itemSelect = document.getElementById('sale-item');

            // 1. RESET GLOBAL DE TODOS LOS CAMPOS
            if (amountInput) amountInput.value = '';
            if (priceInput) priceInput.value = '';
            
            // Forzar reseteo de selectores a la opción por defecto (índice 0)
            if (partnerSelect) {
                partnerSelect.value = "";
                partnerSelect.selectedIndex = 0;
            }
            if (itemSelect) {
                itemSelect.value = "";
                itemSelect.selectedIndex = 0;
            }

            // 2. GESTIÓN DE VISIBILIDAD (Reset)
            if (containerPartner) containerPartner.classList.add('hidden');
            if (containerItem) containerItem.classList.add('hidden');
            if (individualPreview) individualPreview.classList.remove('hidden'); // Default visible
            if (globalPreview) globalPreview.classList.add('hidden');

            // 3. LÓGICA ESPECÍFICA POR TIPO
            if (saleType === 'global') {
                if (individualPreview) individualPreview.classList.add('hidden');
                if (globalPreview) globalPreview.classList.remove('hidden');
                
                if (labelAmount) labelAmount.innerText = "CANTIDAD DE COINS";
                if (labelPrice) labelPrice.innerText = "PRECIO POR 1K (USDT)";
                if (priceInput) priceInput.value = config.marketPrice.toFixed(2);

            } else if (saleType === 'item') {
                if (containerItem) containerItem.classList.remove('hidden');
                
                if (labelAmount) labelAmount.innerText = "CANTIDAD DE ITEMS";
                if (labelPrice) labelPrice.innerText = "PRECIO UNITARIO (USDT)";
                
                // Repoblar items (asegura stock actualizado)
                // Nota: Como ya limpiamos itemSelect.value arriba, populate NO restaurará selección previa
                populateSaleItemSelect();
            } else {
                // Individual (Default)
                if (containerPartner) containerPartner.classList.remove('hidden');
                
                if (labelAmount) labelAmount.innerText = "CANTIDAD DE COINS";
                if (labelPrice) labelPrice.innerText = "PRECIO POR 1K (USDT)";
            }
            updateSalePreview();
        });
    }

    // Poblar select de socios al cargar
    populateSalePartnerSelect();
    populateSaleItemSelect();

    // Inicializar precio vacío (esperando selección)
    const salePriceInput = document.getElementById('sale-price');
    if (salePriceInput) {
        salePriceInput.value = '';
    }

    // Preview en tiempo real
    const salePartnerSelect = document.getElementById('sale-partner');
    const saleAmountInput = document.getElementById('sale-amount');

    if (salePartnerSelect) {
        salePartnerSelect.addEventListener('change', (e) => {
            const priceInput = document.getElementById('sale-price');
            if (e.target.value) {
                priceInput.value = config.marketPrice.toFixed(2);
            } else {
                priceInput.value = '';
            }
            updateSalePreview();
        });
    }

    // Auto-update price when item selected
    const saleItemSelect = document.getElementById('sale-item');
    if (saleItemSelect) {
        saleItemSelect.addEventListener('change', (e) => {
            const itemId = parseInt(e.target.value);
            const item = assets.find(a => a.id === itemId);
            if (item) {
                // Update price input with item's configured value
                const priceInput = document.getElementById('sale-price');
                if (priceInput) priceInput.value = (item.usdtValue || 0).toFixed(2);
            } else {
                document.getElementById('sale-price').value = '';
            }
            updateSalePreview();
        });
    }

    if (saleAmountInput) saleAmountInput.addEventListener('input', updateSalePreview);
    if (salePriceInput) salePriceInput.addEventListener('input', updateSalePreview);

    // Registrar venta

    // Renderizar historial y stats
    renderSalesHistory();
    updateSalesStats();

    renderAssets();
    renderPartnersList();
    calculatePartnerPercentages();  // Calcular % iniciales
    syncChart();
}

// Inicialización secuencial: Primero eventos, luego datos
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    loadData();
});
