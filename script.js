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

// --- ESTADO DE PAQUETES Y DESCUENTOS ---
if (!config.packages) config.packages = [];
if (!config.customDiscounts) config.customDiscounts = [];
config.activeDiscountId = 0; // 0 = None

// --- ESTADO DE PLANTILLAS (REMOVED LEGACY) ---
// Unified Template System uses localStorage('smartTemplateUnified') and DEFAULT_SMART_TEMPLATE const.

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
    partnersList: document.getElementById('partners-config-list'),
    // Templates UI (Unified)
    msgOutput: document.getElementById('message-output'),
    // Legacy elements removed (tplEditor, tabs, etc)
    // New Smart Generator Inputs
    genClient: document.getElementById('gen-client'), // Legacy but valid
    genToggle: document.getElementById('gen-discount-toggle'),
    genDiscountSelect: document.getElementById('gen-discount-select'),
    newDiscountName: document.getElementById('new-discount-name'),
    newDiscountVal: document.getElementById('new-discount-val'),

    // Package Manager inputs
    newPkgAmount: document.getElementById('new-pkg-amount'),
    packagesList: document.getElementById('packages-list'),

    // Legacy Template stuff (REMOVED)
    // tplVersion: document.getElementById('template-version-select'),
    // msgOutput (Already defined above)
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
        config.template_unified = dbConfig.template_unified; // Load Template from DB
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
    populateSalePartnerSelect();
    populateSaleItemSelect();
    populateSaleItemSelect();
    syncChart();

    // --- SMART CONSOLE V3 INIT ---
    if (!config.customDiscounts || config.customDiscounts.length === 0) {
        // Default presets if empty
        config.customDiscounts = [
            { id: 1, label: "Remate 40%", value: 40 },
            { id: 2, label: "Promo 20%", value: 20 },
            { id: 3, label: "Black Friday 50%", value: 50 },
        ];
    }
    // 5. Cargar Paquetes (NEW)
    // 5. Cargar Paquetes (DEPRECATED: Now in templates.html)
    // Removed load logic to prevent main dashboard overhead.
    config.packages = [];
    // const { data: dbPackages, error: errPackages } = await supabaseClient.from('packages').select('*').order('amount');
    // ... logic removed ...
    // Fallback? No needed in main dashboard.

    // Sanitize packages (remove NaN or invalid)
    config.packages = config.packages.filter(p => typeof p === 'number' && !isNaN(p) && p > 0);
    renderDiscountSelect();
    // Populate Template Inputs (Unified)
    const tMaster = document.getElementById('smart-tpl-master');
    // Prioritize Supabase config, fallback to LocalStorage (migration), then Default
    let savedTpl = config.template_unified || localStorage.getItem('smartTemplateUnified');

    if (!savedTpl) {
        savedTpl = DEFAULT_SMART_TEMPLATE;
    }

    if (tMaster) tMaster.value = savedTpl;

    renderPackagesList(); // Render sanitized packages
    updateMessagePreview();

    console.log("✅ Datos cargados correctamente.");
}

function updateFormInputs() {
    if (els.cfgPrice) els.cfgPrice.value = config.marketPrice;
    if (els.cfgAdena) els.cfgAdena.value = config.adenaRate;
    if (els.cfgCap) els.cfgCap.value = config.initialCapital;
    // Sincronizar input visual del simulador
    if (els.inputCap) els.inputCap.value = config.initialCapital;
}

// function saveAll() { ... } // DEPRECATED: Supabase is used directly.

// --- FUNCIONES DE VENTAS ---

function populateSalePartnerSelect() {
    const select = document.getElementById('sale-partner');
    const filterSelect = document.getElementById('chart-filter-partner'); // Filtro del gráfico

    if (select) {
        select.innerHTML = '<option value="" class="bg-zinc-900 text-white">Seleccionar socio...</option>';
    }

    if (filterSelect) {
        // Guardar selección actual si existe
        const currentFilter = filterSelect.value;
        filterSelect.innerHTML = '<option value="all" class="bg-zinc-900 text-white">Todos los Socios</option>';

        config.partners.forEach(p => {
            const option = document.createElement('option');
            option.className = 'bg-zinc-900 text-white';
            option.value = p.id;
            option.textContent = p.name;
            filterSelect.appendChild(option);
        });

        if (config.partners.some(p => p.id == currentFilter)) {
            filterSelect.value = currentFilter;
        }
    }

    if (select) {
        config.partners.forEach(p => {
            const option = document.createElement('option');
            option.className = 'bg-zinc-900 text-white';
            option.value = p.id;
            // Solo para el formulario de venta mostramos el saldo
            option.textContent = `${p.name} (${new Intl.NumberFormat().format(p.coinsInvested || 0)} Coins)`;
            select.appendChild(option);
        });
    }
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
    // Eliminado: No sobrescribir KPIs globales con datos de simulación
    // if (els.kpiRoi) els.kpiRoi.innerText = (roiPerc >= 0 ? '+' : '') + roiPerc.toFixed(1) + '%';
    // if (els.kpiVol) els.kpiVol.innerText = (v * 100).toFixed(1) + '%';

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

    // Registrar Transacción (DEPOSIT) - Historial Universal
    const { error: transError } = await supabaseClient
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

    if (transError) console.error("Error registrando depósito:", transError.message);

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

    // Registrar Transacción (WITHDRAWAL) - Historial Universal
    const { error: transError } = await supabaseClient
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

    if (transError) console.error("Error registrando retiro:", transError.message);

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
        const totalUSDT = getInventoryTotal();
        const totalCoins = usdtToCoins(totalUSDT);
        totalInvValue.innerHTML = `${fmt(totalUSDT)} <span class="text-xs text-zinc-400 font-normal ml-2">≈ ${new Intl.NumberFormat().format(Math.round(totalCoins))} Coins</span>`;
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

// --- LÓGICA DE PLANTILLAS ---

// --- LÓGICA DE PLANTILLAS ---

// --- LÓGICA DE PLANTILLAS V3 Y GESTOR DE DESCUENTOS ---

window.addDiscount = () => {
    const name = els.newDiscountName.value.trim();
    const val = parseFloat(els.newDiscountVal.value);

    if (!name || isNaN(val)) { alert("Nombre y valor requeridos."); return; }

    config.customDiscounts.push({ id: Date.now(), label: name, value: val });
    els.newDiscountName.value = '';
    els.newDiscountVal.value = '';

    saveDiscounts();
    renderDiscountSelect();
};

window.saveDiscounts = () => {
    localStorage.setItem('agoria_discounts', JSON.stringify(config.customDiscounts));
};

window.loadDiscounts = () => {
    const saved = localStorage.getItem('agoria_discounts');
    if (saved) {
        config.customDiscounts = JSON.parse(saved);
        // Default discounts if empty?
    } else {
        config.customDiscounts = [
            { id: 1, label: "Remate 40%", value: 40 },
            { id: 2, label: "Promo 20%", value: 20 }
        ];
    }
    renderDiscountSelect();
};

window.renderDiscountSelect = () => {
    if (!els.genDiscountSelect) return;
    // Keep first option
    els.genDiscountSelect.innerHTML = '<option value="0">Sin Descuento Extra</option>';

    config.customDiscounts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.innerText = `${d.label} (${d.value}%)`;
        els.genDiscountSelect.appendChild(opt);
    });
};

// Fórmula V3
function getCalculatedPrice(amount) {
    const baseRate = config.marketPrice || 0.63;
    const isDiscountActive = els.genToggle ? els.genToggle.checked : false;

    let discountPercent = 0;
    if (isDiscountActive) {
        // Get selected discount
        const selectedId = parseInt(els.genDiscountSelect.value);
        if (selectedId !== 0) {
            const disc = config.customDiscounts.find(d => d.id === selectedId);
            if (disc) discountPercent = disc.value;
        } else {
            // Fallback default discount if toggle ON but no preset selected? 
            // Or maybe Toggle ON implies "Apply Selected Discount". If 0 selected, then 0 discount?
            // "Si ToggleDescuento == ON -> Usar config.marketPrice * 0.6 (o el precio de oferta que definas)"
            // Let's assume selecting "Sin Descuento" acts as 0%. 
            // BUT user prompt said: "Selector de Descuento: ... para elegir cuál ... aplicar".
            // If toggle is ON, we apply it. If toggle OFF, we don't.
            discountPercent = 0;
        }
    }

    // Wait, the prompt logic is:
    // "El sistema debe cruzar tres datos... Descuento Activo: El porcentaje elegido..."
    // "Si ToggleDescuento == OFF -> Usar config.marketPrice"
    // "Si ToggleDescuento == ON -> Usar config.marketPrice * (1 - %Descuento/100)"

    if (isDiscountActive) {
        const selectedId = parseInt(els.genDiscountSelect.value);
        const disc = config.customDiscounts.find(d => d.id === selectedId);
        if (disc) discountPercent = disc.value;
        // If "Sin Descuento" (0) is selected but Toggle is ON?
        // Maybe default 40% only if nothing selected?
        // User said: "Crud de Descuentos... Selector de Descuento...".
        // Let's rely strictly on selector.
    }

    const rawPrice = (amount / 1000) * baseRate * (1 - (discountPercent / 100));
    return (Math.ceil(rawPrice * 100) / 100).toFixed(2);
}

window.updateMessagePreview = () => {
    // PREVIEW OUTPUT GENERATION
    // This now generates the SYSTEM OUTPUT based on:
    // 1. Packages selected
    // 2. Active Discount/Toggle settings

    if (!els.msgOutput) return;

    let output = "█ SMART SYSTEM ONLINE...\n";

    const isDiscountActive = els.genToggle.checked;

    // Recalculate package list display first
    renderPackages();

    // Build Message from Selected Packages
    const selectedPacks = config.packages.filter(p => p.selected).sort((a, b) => a.amount - b.amount);

    if (selectedPacks.length === 0) {
        output += "█ NO PACKAGES SELECTED.";
        els.msgOutput.innerText = output;
        return;
    }

    output += "█ GENERATING OFFER...\n\n";

    // Header
    if (isDiscountActive) {
        const selectedId = parseInt(els.genDiscountSelect.value);
        const disc = config.customDiscounts.find(d => d.id === selectedId);
        const label = disc ? disc.label.toUpperCase() : "OFERTA";
        output += `🔥 ¡${label}! 🔥\n\n`;
    } else {
        output += "📋 LISTA DE PRECIOS\n\n";
    }

    // Items
    selectedPacks.forEach(p => {
        const price = getCalculatedPrice(p.amount);
        output += `💰 ${new Intl.NumberFormat().format(p.amount / 1000)}k Coins ➜ $${price} USDT\n`;
    });

    if (isDiscountActive) {
        output += "\n⏳ Oferta por tiempo limitado.";
    }

    els.msgOutput.innerText = output;
};

window.copyToClipboard = (elementId) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    const text = element.tagName === 'TEXTAREA' || element.tagName === 'INPUT' ? element.value : element.innerText;

    navigator.clipboard.writeText(text).then(() => {
        // Feedback visual sutil opcional
    }).catch(err => {
        console.error('Error al copiar: ', err);
    });
};

// [LEGACY TEMPLATE FUNCTIONS REMOVED]
// The new system uses 'updateMessagePreview' and 'smart-tpl-master' in the Config section.

// --- GESTOR DE PAQUETES ---

window.loadPackages = () => {
    const saved = localStorage.getItem('agoria_packages');
    if (saved) {
        config.packages = JSON.parse(saved);
    } else {
        // Default packages if none saved
        config.packages = [
            { id: 1, amount: 10000, selected: true },
            { id: 2, amount: 50000, selected: true },
            { id: 3, amount: 100000, selected: true }
        ];
    }
    renderPackages();
};

window.savePackages = () => {
    localStorage.setItem('agoria_packages', JSON.stringify(config.packages));
};

window.renderPackages = () => {
    if (!els.packagesList) return;
    els.packagesList.innerHTML = '';

    // Calculate current prices for display (Mirror Logic)
    const isDiscountActive = els.genToggle ? els.genToggle.checked : false;
    const baseRate = config.marketPrice || 0.63;
    // For display in list, we can show base price
    // But user asked for "Precio Sugerido" which might imply current context or just base.
    // Let's show Base Price for clarity in the list, or dynamic?
    // User requirement: "Sincronización de Precios (Lógica Espejo)... se recalculan al instante"
    // implies dynamic display.

    // NOTE: LIST IN UI shows "Precio Sugerido". Let's show the standard price there, 
    // or maybe the discounted one if toggle is ON?
    // Let's show Standard Price (Base) in list to avoid confusion, 
    // or better yet, show both or depend on toggle?
    // Requirement says: "El generador leerá siempre config.marketPrice... Si se cambia el precio en el Panel... se recalculan"
    // This applies to the GENERATOR. The list UI just needs to be editable.
    // I will show the BASE price in the list for reference.

    config.packages.forEach(pkg => {
        const price = (pkg.amount / 1000) * baseRate;
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2 bg-white/5 rounded hover:bg-white/10 transition-colors';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <input type="checkbox" onchange="togglePackageSelection(${pkg.id})" 
                    ${pkg.selected ? 'checked' : ''} 
                    class="w-4 h-4 rounded border-white/20 bg-black/40 text-amber-400 focus:ring-amber-400">
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-zinc-200">${new Intl.NumberFormat().format(pkg.amount)} Coins</span>
                    <span class="text-[10px] text-zinc-500 font-mono">Est: $${price.toFixed(2)} USDT</span>
                </div>
            </div>
            <button onclick="removePackage(${pkg.id})" class="text-red-400/60 hover:text-red-400 transition-colors p-1">
                <i data-lucide="x" class="w-3 h-3"></i>
            </button>
        `;
        els.packagesList.appendChild(div);
    });
    lucide.createIcons();
};

window.addPackage = () => {
    const amount = parseInt(els.newPkgAmount.value);
    if (!amount || amount <= 0) {
        alert("Ingresa una cantidad válida.");
        return;
    }

    const newId = Date.now(); // Simple ID generation
    config.packages.push({
        id: newId,
        amount: amount * 1000, // Input is in 'k', so multiply by 1000? 
        // Placeholder says "Cantidad (k)". User example: 10000.
        // If input is "10", does it mean 10k?
        // Let's assume input is in 'K' based on placeholder "Cantidad (k)".
        // Wait, user example says "Cantidad: 10,000".
        // If user types 10, it should probably be 10,000.
        // Let's multiply by 1000 if strict interpretation of 'k'.
        // However, the input placeholder says "Cantidad (k)" but user might type raw.
        // Let's support raw number logic from input but treat as K if small? 
        // safely: Let's assume input implies Kilo as per placeholder.
        amount: amount * 1000,
        selected: true
    });

    els.newPkgAmount.value = '';
    savePackages();
    renderPackages();
};

window.removePackage = (id) => {
    config.packages = config.packages.filter(p => p.id !== id);
    savePackages();
    renderPackages();
};

window.togglePackageSelection = (id) => {
    const pkg = config.packages.find(p => p.id === id);
    if (pkg) {
        pkg.selected = !pkg.selected;
        savePackages();
    }
};

window.buildPackageMessage = () => {
    const isDiscountOn = els.genToggle ? els.genToggle.checked : false;
    const baseRate = config.marketPrice || 0.63;
    const activePrice = isDiscountOn ? (baseRate * 0.6) : baseRate;

    // Sort packages by amount?
    const selectedPacks = config.packages
        .filter(p => p.selected)
        .sort((a, b) => a.amount - b.amount);

    let listText = "📋 LISTA DE PRECIOS\n\n";

    selectedPacks.forEach(p => {
        const totalUSD = (p.amount / 1000) * activePrice;
        // Rounding logic: ceil 2 decimals
        const finalPrice = Math.ceil(totalUSD * 100) / 100;

        listText += `💰 ${new Intl.NumberFormat().format(p.amount / 1000)}k Coins ➜ $${finalPrice.toFixed(2)} USDT\n`;
    });

    if (isDiscountOn) {
        listText += "\n🔥 ¡PRECIOS DE REMATE APLICADOS! (40% OFF)";
    }

    // Copy to clipboard
    navigator.clipboard.writeText(listText).then(() => {
        alert("¡Lista generada y copiada al portapapeles!");
    });
};

// Update updateMessagePreview to create listener for render updates?
// Not strictly needed unless list shows live prices sensitive to Toggle.
// Let's hook into updateMessagePreview to re-render packages so prices update?
// Or just let them be static base prices in the list view?
// User requirement: "El generador leerá siempre... Si se cambia... se recalculan".
// This refers to the OUTPUT. The list preview " Precio Sugerido" should ideally update if possible.
// Let's make updateMessagePreview call renderPackages too? Might be too heavy.
// Let's keep renderPackages simple for now.

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

            // Cargar plantillas si es la pestaña correcta
            if (tab === 'templates') {
                // switchTemplateTab('sale'); // REMOVED LEGACY CALL
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

        // 2. Actualizar Gráfico Principal (Mercado Real - Lógica Acumulativa)
        if (window.mainChartInstance) {

            // --- A. Preparación de Datos ---
            const currentPool = getTotalCoins();
            const sortedSales = [...sales]
                .filter(s => s.date && !isNaN(new Date(s.date).getTime()))
                .sort((a, b) => new Date(a.date) - new Date(b.date)); // Orden cronológico ascendente (más viejo a más nuevo)

            // Inicializar Series Map
            const partnerSeriesMap = {};

            // Serie Global (Ventas Globales)
            partnerSeriesMap['global'] = {
                name: 'Ventas Globales',
                type: 'area',
                data: [],
                color: '#ff00ff'
            };

            // Series de Socios
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

            // --- B. Cálculo Histórico y Acumulativo ---

            // Necesitamos 'reconstruir' la historia.
            // Empezamos desde el Pasado hacia el Presente.
            // Pero tenemos el Pool ACTUAL.
            // Pool(t) = Pool(t-1) - Ventas(t)  <-- Si vamos adelante en el tiempo y sabemos el inicial
            // Pero NO sabemos el inicial exacto hace X tiempo fácilmente sin iterar todo.
            // Alternativa: Pool(t) = Pool_Actual + Suma_Ventas_Despues_de_t

            // Estrategia:
            // 1. Calcular Ventas Totales Históricas por Socio (para saber cuanto han vendido en total hasta hoy)
            // No, mejor: Iterar cronológicamente y acumular ventas.
            // Para el Pool: Calcular el Pool Inicial 'Teórico' antes de todas las ventas registradas.
            // Pool_Inicial_Teorico = Pool_Actual + Total_Todas_Ventas

            // Paso 1: Calcular totales absolutos de ventas para derivar el pasado
            const totalSalesVolume = sortedSales.reduce((sum, s) => sum + (s.amount || 0), 0);
            let theoreticalPool = currentPool + totalSalesVolume;

            // Mapas de acumulados corrientes
            const runningSales = { 'global': 0 };
            config.partners.forEach(p => runningSales[p.id] = 0);

            // Puntos de datos
            const poolData = [];

            // Agrupar ventas por hora para no saturar el gráfico
            const salesByTime = {};
            sortedSales.forEach(s => {
                const timeKey = new Date(s.date).toISOString().slice(0, 13) + ':00:00Z'; // Hora exacta
                if (!salesByTime[timeKey]) salesByTime[timeKey] = [];
                salesByTime[timeKey].push(s);
            });

            const uniqueTimeKeys = Object.keys(salesByTime).sort((a, b) => new Date(a) - new Date(b));

            // Punto Inicial (Antes de la primera venta registrada)
            // Si hay ventas, el punto inicial es t = (PrimeraVenta - 1h) con valor theoreticalPool
            // Y ventas acumuladas en 0.
            if (uniqueTimeKeys.length > 0) {
                const firstTime = new Date(uniqueTimeKeys[0]).getTime() - 3600000; // 1 hora antes
                poolData.push({ x: firstTime, y: theoreticalPool });

                Object.keys(partnerSeriesMap).forEach(k => {
                    partnerSeriesMap[k].data.push({ x: firstTime, y: 0 }); // 0 ventas acumuladas al inicio
                });
            } else {
                // Sin ventas: mostrar linea plana actual
                const now = new Date().getTime();
                poolData.push({ x: now - 3600000, y: currentPool });
                poolData.push({ x: now, y: currentPool });
            }

            // Iterar el tiempo
            uniqueTimeKeys.forEach(timeKey => {
                const timestamp = new Date(timeKey).getTime();
                const salesInThisHour = salesByTime[timeKey];

                // Procesar cambios en esta hora
                salesInThisHour.forEach(s => {
                    const amount = s.amount || 0;

                    // Restar del Pool (porque vamos adelante en el tiempo y se vendió)
                    theoreticalPool -= amount;

                    // Sumar al acumulado de ventas
                    const entityId = s.partnerId ? s.partnerId : 'global';
                    if (runningSales[entityId] !== undefined) {
                        runningSales[entityId] += amount;
                    }
                    if (s.partnerId === null) { // Caso explícito global
                        runningSales['global'] += amount;
                    }
                });

                // Registrar Puntos
                poolData.push({ x: timestamp, y: theoreticalPool });

                Object.keys(partnerSeriesMap).forEach(key => {
                    partnerSeriesMap[key].data.push({ x: timestamp, y: runningSales[key] || 0 });
                });
            });

            // Punto Final (Ahora) para asegurar que la linea llegue al presente plana si no hubo ventas recientes
            const now = new Date().getTime();
            if (uniqueTimeKeys.length > 0 && uniqueTimeKeys[uniqueTimeKeys.length - 1] !== now) {
                poolData.push({ x: now, y: currentPool }); // Debe coincidir con currentPool si la lógica es perfecta
                Object.keys(partnerSeriesMap).forEach(key => {
                    partnerSeriesMap[key].data.push({ x: now, y: runningSales[key] || 0 });
                });
            }

            // --- C. Construcción Final ---
            const finalSeries = [
                { name: 'Total Pool Coins', type: 'area', data: poolData, color: '#00f2ff' }
            ];

            // Global
            if (partnerSeriesMap['global'].data.some(d => d.y > 0)) {
                finalSeries.push(partnerSeriesMap['global']);
            }

            // Socios
            Object.keys(partnerSeriesMap).forEach(key => {
                if (key !== 'global' && partnerSeriesMap[key].data.some(d => d.y > 0)) {
                    finalSeries.push(partnerSeriesMap[key]);
                }
            });

            // Update Chart
            window.mainChartInstance.updateOptions({
                chart: { type: 'area', stacked: false },
                stroke: { curve: 'smooth', width: 2 },
                fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
                xaxis: {
                    type: 'datetime',
                    labels: {
                        formatter: function (val) {
                            if (typeof val === 'number' && val > 1000000000000) {
                                const d = new Date(val);
                                return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' + d.getHours() + ':00h';
                            }
                            return val;
                        },
                        style: { colors: '#a1a1aa' }
                    }
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
                        title: { text: 'Ventas Acumuladas', style: { color: '#ffff00' } },
                        labels: { style: { colors: '#ffff00' } }
                    }
                ]
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

    // Refresco automático (Live Mode) cada 60 segundos
    setInterval(() => {
        if (!document.hidden) loadData();
    }, 60000);
});

// --- OVERRIDE: Actualización para Historial Universal y Filtros ---
window.syncChart = function () {
    // 1. Actualizar Gráfico de Simulación
    const simData = window.runSimulation ? window.runSimulation() : { seriesData: [], baselineData: [] };

    if (window.simChartInstance) {
        window.simChartInstance.updateSeries([
            { name: 'Portafolio Proyectado', data: simData.seriesData },
            { name: 'Inversión Total', data: simData.baselineData }
        ]);
    }

    // 2. Actualizar Gráfico Principal (Mercado Real - Lógica Acumulativa + Filtros)
    if (window.mainChartInstance) {

        // --- A. Preparación y Filtros ---
        const filterType = document.getElementById('chart-filter-type')?.value || 'all';
        const filterPartner = document.getElementById('chart-filter-partner')?.value || 'all';

        const currentPool = getTotalCoins();

        const allTransactions = [...sales]
            .filter(s => s.date && !isNaN(new Date(s.date).getTime()))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Datos para cálculo histórico Base (Pool Total Real)
        let totalDeposits = 0;
        let totalWithdrawals = 0;
        let totalSales = 0;

        allTransactions.forEach(t => {
            const amt = t.amount || 0;
            if (t.type === 'DEPOSIT') totalDeposits += amt;
            else if (t.type === 'WITHDRAWAL') totalWithdrawals += amt;
            else totalSales += amt;
        });

        // Pool Inicial Teórico
        let theoreticalPool = currentPool - totalDeposits + totalWithdrawals + totalSales;

        // --- Series Data Containers ---
        const poolData = [];
        const partnerSeriesMap = {};

        // Inicializar Series
        partnerSeriesMap['global'] = { name: 'Ventas Globales', type: 'area', data: [], color: '#ff00ff' };

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

        const showNetBalance = (filterType === 'all');
        const runningPartnerValue = { 'global': 0 };
        config.partners.forEach(p => runningPartnerValue[p.id] = 0);

        if (showNetBalance) {
            config.partners.forEach(p => {
                let pDeposits = 0;
                let pWithdrawals = 0;
                let pSales = 0;
                allTransactions.forEach(t => {
                    if (t.partnerId == p.id) {
                        if (t.type === 'DEPOSIT') pDeposits += (t.amount || 0);
                        else if (t.type === 'WITHDRAWAL') pWithdrawals += (t.amount || 0);
                        else pSales += (t.amount || 0);
                    }
                });
                const startBal = (p.coinsInvested || 0) - pDeposits + pWithdrawals + pSales;
                runningPartnerValue[p.id] = startBal;
            });
        }

        // --- B. Iteración Temporal ---
        const salesByTime = {};
        allTransactions.forEach(s => {
            const timeKey = new Date(s.date).toISOString().slice(0, 13) + ':00:00Z';
            if (!salesByTime[timeKey]) salesByTime[timeKey] = [];
            salesByTime[timeKey].push(s);
        });

        const uniqueTimeKeys = Object.keys(salesByTime).sort((a, b) => new Date(a) - new Date(b));

        // Punto Inicial
        if (uniqueTimeKeys.length > 0) {
            const firstTime = new Date(uniqueTimeKeys[0]).getTime() - 3600000;
            poolData.push({ x: firstTime, y: theoreticalPool });
            Object.keys(partnerSeriesMap).forEach(k => {
                partnerSeriesMap[k].data.push({ x: firstTime, y: showNetBalance ? (runningPartnerValue[k] || 0) : 0 });
            });
        } else {
            const now = new Date().getTime();
            poolData.push({ x: now - 3600000, y: currentPool });
            poolData.push({ x: now, y: currentPool });
        }

        // Loop
        uniqueTimeKeys.forEach(timeKey => {
            const timestamp = new Date(timeKey).getTime();
            const transInHour = salesByTime[timeKey];

            transInHour.forEach(t => {
                const amt = t.amount || 0;

                if (t.type === 'DEPOSIT') {
                    theoreticalPool += amt;
                    if (showNetBalance && t.partnerId) runningPartnerValue[t.partnerId] += amt;
                } else if (t.type === 'WITHDRAWAL') {
                    theoreticalPool -= amt;
                    if (showNetBalance && t.partnerId) runningPartnerValue[t.partnerId] -= amt;
                } else {
                    // VENTA
                    theoreticalPool -= amt;
                    if (showNetBalance) {
                        if (t.partnerId) runningPartnerValue[t.partnerId] -= amt;
                    } else {
                        const entityId = t.partnerId ? t.partnerId : 'global';
                        if (runningPartnerValue[entityId] !== undefined) runningPartnerValue[entityId] += amt;
                        if (t.type === 'global') runningPartnerValue['global'] += amt;
                    }
                }
            });

            // Registrar Puntos
            poolData.push({ x: timestamp, y: theoreticalPool });
            Object.keys(partnerSeriesMap).forEach(key => {
                partnerSeriesMap[key].data.push({ x: timestamp, y: runningPartnerValue[key] || 0 });
            });
        });

        // Punto Final
        const now = new Date().getTime();
        if (uniqueTimeKeys.length > 0 && uniqueTimeKeys[uniqueTimeKeys.length - 1] !== now) {
            poolData.push({ x: now, y: currentPool });
            Object.keys(partnerSeriesMap).forEach(key => {
                partnerSeriesMap[key].data.push({ x: now, y: runningPartnerValue[key] || 0 });
            });
        }


        // --- C. Filtrado ---
        const finalSeries = [];

        // Pool Total
        finalSeries.push({ name: 'Total Pool Coins', type: 'area', data: poolData, color: '#00f2ff' });

        // Filtros
        Object.keys(partnerSeriesMap).forEach(key => {
            if (filterPartner !== 'all' && key != filterPartner) return;
            if (filterPartner !== 'all' && key === 'global') return;

            if (partnerSeriesMap[key].data.length > 0) finalSeries.push(partnerSeriesMap[key]);
        });

        window.mainChartInstance.updateOptions({
            chart: { type: 'area', stacked: false },
            yaxis: [
                {
                    title: { text: 'Pool Coins Total', style: { color: '#00f2ff' } },
                    labels: { style: { colors: '#00f2ff' }, formatter: (val) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(val) },
                    forceNiceScale: true,
                    decimalsInFloat: 0
                },
                {
                    opposite: true,
                    title: { text: showNetBalance ? 'Balance Invertido' : 'Ventas Acumuladas', style: { color: '#ffff00' } },
                    labels: { style: { colors: '#ffff00' } }
                }
            ]
        });

        window.mainChartInstance.updateSeries(finalSeries);
    }
    updateGlobalKPIs();
}

// --- OVERRIDE: Actualización para Historial Universal y Filtros ---
window.syncChart = function () {
    // 1. Actualizar Gráfico de Simulación
    const simData = window.runSimulation ? window.runSimulation() : { seriesData: [], baselineData: [] };

    if (window.simChartInstance) {
        window.simChartInstance.updateSeries([
            { name: 'Portafolio Proyectado', data: simData.seriesData },
            { name: 'Inversión Total', data: simData.baselineData }
        ]);
    }

    // 2. Actualizar Gráfico Principal (Mercado Real - Lógica Acumulativa + Filtros)
    if (window.mainChartInstance) {

        // --- A. Preparación y Filtros ---
        const filterType = document.getElementById('chart-filter-type')?.value || 'all';
        const filterPartner = document.getElementById('chart-filter-partner')?.value || 'all';

        const currentPool = getTotalCoins();

        const allTransactions = [...sales]
            .filter(s => s.date && !isNaN(new Date(s.date).getTime()))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Datos para cálculo histórico Base (Pool Total Real)
        let totalDeposits = 0;
        let totalWithdrawals = 0;
        let totalSales = 0;

        allTransactions.forEach(t => {
            const amt = t.amount || 0;
            if (t.type === 'DEPOSIT') totalDeposits += amt;
            else if (t.type === 'WITHDRAWAL') totalWithdrawals += amt;
            else totalSales += amt;
        });

        // Pool Inicial Teórico
        let theoreticalPool = currentPool - totalDeposits + totalWithdrawals + totalSales;

        // --- Series Data Containers ---
        const poolData = [];
        const partnerSeriesMap = {};

        // Inicializar Series
        partnerSeriesMap['global'] = { name: 'Ventas Globales', type: 'area', data: [], color: '#ff00ff' };

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

        const showNetBalance = (filterType === 'all');
        const runningPartnerValue = { 'global': 0 };
        config.partners.forEach(p => runningPartnerValue[p.id] = 0);

        if (showNetBalance) {
            config.partners.forEach(p => {
                let pDeposits = 0;
                let pWithdrawals = 0;
                let pSales = 0;
                allTransactions.forEach(t => {
                    if (t.partnerId == p.id) {
                        if (t.type === 'DEPOSIT') pDeposits += (t.amount || 0);
                        else if (t.type === 'WITHDRAWAL') pWithdrawals += (t.amount || 0);
                        else pSales += (t.amount || 0);
                    }
                });
                const startBal = (p.coinsInvested || 0) - pDeposits + pWithdrawals + pSales;
                runningPartnerValue[p.id] = startBal;
            });
        }

        // --- B. Iteración Temporal ---
        const salesByTime = {};
        allTransactions.forEach(s => {
            const timeKey = new Date(s.date).toISOString().slice(0, 13) + ':00:00Z';
            if (!salesByTime[timeKey]) salesByTime[timeKey] = [];
            salesByTime[timeKey].push(s);
        });

        const uniqueTimeKeys = Object.keys(salesByTime).sort((a, b) => new Date(a) - new Date(b));

        // Punto Inicial
        if (uniqueTimeKeys.length > 0) {
            const firstTime = new Date(uniqueTimeKeys[0]).getTime() - 3600000;
            poolData.push({ x: firstTime, y: theoreticalPool });
            Object.keys(partnerSeriesMap).forEach(k => {
                partnerSeriesMap[k].data.push({ x: firstTime, y: showNetBalance ? (runningPartnerValue[k] || 0) : 0 });
            });
        } else {
            const now = new Date().getTime();
            poolData.push({ x: now - 3600000, y: currentPool });
            poolData.push({ x: now, y: currentPool });
        }

        // Loop
        uniqueTimeKeys.forEach(timeKey => {
            const timestamp = new Date(timeKey).getTime();
            const transInHour = salesByTime[timeKey];

            transInHour.forEach(t => {
                const amt = t.amount || 0;

                if (t.type === 'DEPOSIT') {
                    theoreticalPool += amt;
                    if (showNetBalance && t.partnerId) runningPartnerValue[t.partnerId] += amt;
                } else if (t.type === 'WITHDRAWAL') {
                    theoreticalPool -= amt;
                    if (showNetBalance && t.partnerId) runningPartnerValue[t.partnerId] -= amt;
                } else {
                    // VENTA
                    theoreticalPool -= amt;
                    if (showNetBalance) {
                        if (t.partnerId) runningPartnerValue[t.partnerId] -= amt;
                    } else {
                        const entityId = t.partnerId ? t.partnerId : 'global';
                        if (runningPartnerValue[entityId] !== undefined) runningPartnerValue[entityId] += amt;
                        if (t.type === 'global') runningPartnerValue['global'] += amt;
                    }
                }
            });

            // Registrar Puntos
            poolData.push({ x: timestamp, y: theoreticalPool });
            Object.keys(partnerSeriesMap).forEach(key => {
                partnerSeriesMap[key].data.push({ x: timestamp, y: runningPartnerValue[key] || 0 });
            });
        });

        // Punto Final
        const now = new Date().getTime();
        if (uniqueTimeKeys.length > 0 && uniqueTimeKeys[uniqueTimeKeys.length - 1] !== now) {
            poolData.push({ x: now, y: currentPool });
            Object.keys(partnerSeriesMap).forEach(key => {
                partnerSeriesMap[key].data.push({ x: now, y: runningPartnerValue[key] || 0 });
            });
        }


        // --- C. Filtrado ---
        const finalSeries = [];

        // Pool Total
        finalSeries.push({ name: 'Total Pool Coins', type: 'area', data: poolData, color: '#00f2ff' });

        // Filtros
        Object.keys(partnerSeriesMap).forEach(key => {
            if (filterPartner !== 'all' && key != filterPartner) return;
            if (filterPartner !== 'all' && key === 'global') return;

            if (partnerSeriesMap[key].data.length > 0) finalSeries.push(partnerSeriesMap[key]);
        });

        window.mainChartInstance.updateOptions({
            chart: { type: 'area', stacked: false },
            yaxis: [
                {
                    title: { text: 'Pool Coins Total', style: { color: '#00f2ff' } },
                    labels: { style: { colors: '#00f2ff' }, formatter: (val) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(val) },
                    forceNiceScale: true,
                    decimalsInFloat: 0
                },
                {
                    opposite: true,
                    title: { text: showNetBalance ? 'Balance Invertido' : 'Ventas Acumuladas', style: { color: '#ffff00' } },
                    labels: { style: { colors: '#ffff00' } }
                }
            ]
        });

        window.mainChartInstance.updateSeries(finalSeries);
    }
    updateGlobalKPIs();
}

// --- OVERRIDE: Actualización para Historial Universal y Filtros ---
// Reemplazamos la función syncChart anterior para incluir la lógica de depósitos/retiros y filtros
window.syncChart = function () {
    // 1. Actualizar Gráfico de Simulación
    const simData = window.runSimulation ? window.runSimulation() : { seriesData: [], baselineData: [] };

    if (window.simChartInstance) {
        window.simChartInstance.updateSeries([
            { name: 'Portafolio Proyectado', data: simData.seriesData },
            { name: 'Inversión Total', data: simData.baselineData }
        ]);
    }

    // 2. Actualizar Gráfico Principal (Mercado Real - Lógica Acumulativa + Filtros)
    if (window.mainChartInstance) {

        // --- A. Preparación y Filtros ---
        const filterType = document.getElementById('chart-filter-type')?.value || 'all';
        const filterPartner = document.getElementById('chart-filter-partner')?.value || 'all';

        const currentPool = getTotalCoins();

        const allTransactions = [...sales]
            .filter(s => s.date && !isNaN(new Date(s.date).getTime()))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Datos para cálculo histórico Base (Pool Total Real)
        let totalDeposits = 0;
        let totalWithdrawals = 0;
        let totalSales = 0;

        allTransactions.forEach(t => {
            const amt = t.amount || 0;
            if (t.type === 'DEPOSIT') totalDeposits += amt;
            else if (t.type === 'WITHDRAWAL') totalWithdrawals += amt;
            else totalSales += amt;
        });

        // Pool Inicial Teórico (t=0 antes de cualquier registro conocido)
        let theoreticalPool = currentPool - totalDeposits + totalWithdrawals + totalSales;

        // --- Series Data Containers ---
        const poolData = [];
        const partnerSeriesMap = {};

        // Inicializar Series
        partnerSeriesMap['global'] = { name: 'Ventas Globales', type: 'area', data: [], color: '#ff00ff' };

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

        const showNetBalance = (filterType === 'all');
        const runningPartnerValue = { 'global': 0 };
        config.partners.forEach(p => runningPartnerValue[p.id] = 0);

        // Reconstruir balance inicial si es modo 'all' de socios
        if (showNetBalance) {
            config.partners.forEach(p => {
                let pDeposits = 0;
                let pWithdrawals = 0;
                let pSales = 0;
                allTransactions.forEach(t => {
                    if (t.partnerId == p.id) {
                        if (t.type === 'DEPOSIT') pDeposits += (t.amount || 0);
                        else if (t.type === 'WITHDRAWAL') pWithdrawals += (t.amount || 0);
                        else pSales += (t.amount || 0);
                    }
                });
                const startBal = (p.coinsInvested || 0) - pDeposits + pWithdrawals + pSales;
                runningPartnerValue[p.id] = startBal;
            });
        }

        // --- B. Iteración Temporal (Replay) ---
        const salesByTime = {};
        allTransactions.forEach(s => {
            const timeKey = new Date(s.date).toISOString().slice(0, 13) + ':00:00Z';
            if (!salesByTime[timeKey]) salesByTime[timeKey] = [];
            salesByTime[timeKey].push(s);
        });

        const uniqueTimeKeys = Object.keys(salesByTime).sort((a, b) => new Date(a) - new Date(b));

        // Punto Inicial
        if (uniqueTimeKeys.length > 0) {
            const firstTime = new Date(uniqueTimeKeys[0]).getTime() - 3600000;
            poolData.push({ x: firstTime, y: theoreticalPool });
            Object.keys(partnerSeriesMap).forEach(k => {
                partnerSeriesMap[k].data.push({ x: firstTime, y: showNetBalance ? (runningPartnerValue[k] || 0) : 0 });
            });
        } else {
            const now = new Date().getTime();
            poolData.push({ x: now - 3600000, y: currentPool });
            poolData.push({ x: now, y: currentPool });
        }

        // Loop
        uniqueTimeKeys.forEach(timeKey => {
            const timestamp = new Date(timeKey).getTime();
            const transInHour = salesByTime[timeKey];

            transInHour.forEach(t => {
                const amt = t.amount || 0;

                if (t.type === 'DEPOSIT') {
                    theoreticalPool += amt;
                    if (showNetBalance && t.partnerId) runningPartnerValue[t.partnerId] += amt;
                } else if (t.type === 'WITHDRAWAL') {
                    theoreticalPool -= amt;
                    if (showNetBalance && t.partnerId) runningPartnerValue[t.partnerId] -= amt;
                } else {
                    // VENTA
                    theoreticalPool -= amt;
                    if (showNetBalance) {
                        if (t.partnerId) runningPartnerValue[t.partnerId] -= amt;
                    } else {
                        const entityId = t.partnerId ? t.partnerId : 'global';
                        if (runningPartnerValue[entityId] !== undefined) runningPartnerValue[entityId] += amt;
                        if (t.type === 'global') runningPartnerValue['global'] += amt;
                    }
                }
            });

            // Registrar Puntos
            poolData.push({ x: timestamp, y: theoreticalPool });
            Object.keys(partnerSeriesMap).forEach(key => {
                partnerSeriesMap[key].data.push({ x: timestamp, y: runningPartnerValue[key] || 0 });
            });
        });

        // Punto Final (Presente)
        const now = new Date().getTime();
        if (uniqueTimeKeys.length > 0 && uniqueTimeKeys[uniqueTimeKeys.length - 1] !== now) {
            poolData.push({ x: now, y: currentPool });
            Object.keys(partnerSeriesMap).forEach(key => {
                partnerSeriesMap[key].data.push({ x: now, y: runningPartnerValue[key] || 0 });
            });
        }


        // --- C. Filtrado de VISUALIZACIÓN ---
        const finalSeries = [];

        // 1. Pool Total
        finalSeries.push({ name: 'Total Pool Coins', type: 'area', data: poolData, color: '#00f2ff' });

        // 2. Filtros
        Object.keys(partnerSeriesMap).forEach(key => {
            if (filterPartner !== 'all' && key != filterPartner) return;
            if (filterPartner !== 'all' && key === 'global') return;

            if (partnerSeriesMap[key].data.length > 0) {
                finalSeries.push(partnerSeriesMap[key]);
            }
        });


        window.mainChartInstance.updateOptions({
            chart: { type: 'area', stacked: false },
            stroke: { curve: 'smooth', width: 2 },
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
            xaxis: {
                type: 'datetime',
                labels: {
                    formatter: function (val) {
                        if (typeof val === 'number' && val > 1000000000000) {
                            const d = new Date(val);
                            return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' + d.getHours() + ':00h';
                        }
                        return val;
                    },
                    style: { colors: '#a1a1aa' }
                }
            },
            yaxis: [
                {
                    title: { text: 'Pool Coins Total', style: { color: '#00f2ff' } },
                    labels: { style: { colors: '#00f2ff' }, formatter: (val) => new Intl.NumberFormat('en-US', { notation: "compact" }).format(val) },
                    forceNiceScale: true,
                    decimalsInFloat: 0
                },
                {
                    opposite: true,
                    title: { text: showNetBalance ? 'Balance Invertido' : 'Ventas Acumuladas', style: { color: '#ffff00' } },
                    labels: { style: { colors: '#ffff00' } }
                }
            ]
        });

        window.mainChartInstance.updateSeries(finalSeries);
    }

    updateGlobalKPIs();
}

// =================================================================
//  SMART MESSAGE CONSOLE V3 LOGIC
// =================================================================

// --- 0. TEMPLATE CONFIGURATION (UNIFIED) ---
const DEFAULT_SMART_TEMPLATE = `💎 🔥 COINS DISPONIBLES 🔥 💎

📦 STOCK TOTAL: {stock_total} ({stock_k}k) Coins 
📉 TASA BASE: (\${tasa} x 1k)


🛒 LISTA DE PAQUETES DISPONIBLES 
  
{lista_paquetes}

💳 FORMA DE PAGO: 
🔸 Binance Pay (USDT) 
✅ Entrega Inmediata`;

// --- 1. DISCOUNT MANAGEMENT ---

function addDiscount() {
    const name = els.newDiscountName.value.trim();
    const val = parseFloat(els.newDiscountVal.value);

    if (!name || isNaN(val) || val <= 0 || val > 100) {
        alert("Por favor ingresa un nombre y un porcentaje válido (1-100).");
        return;
    }

    const newId = config.customDiscounts.length > 0 ? Math.max(...config.customDiscounts.map(d => d.id)) + 1 : 1;

    config.customDiscounts.push({
        id: newId,
        label: name,
        value: val
    });

    renderDiscountSelect();

    // Select the new discount
    els.genDiscountSelect.value = newId;
    config.activeDiscountId = newId;

    // Clear inputs
    els.newDiscountName.value = '';
    els.newDiscountVal.value = '';

    updateMessagePreview();
}

function renderDiscountSelect() {
    const select = els.genDiscountSelect;
    if (!select) return;

    const currentVal = parseInt(select.value) || 0;

    select.innerHTML = '<option value="0">Sin Descuento Extra</option>';

    config.customDiscounts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.label} (-${d.value}%)`;
        select.appendChild(opt);
    });

    if (config.customDiscounts.some(d => d.id === currentVal)) {
        select.value = currentVal;
    } else {
        select.value = 0;
    }
}


// --- 2. PACKAGE MANAGEMENT ---

async function addPackage() {
    const amount = parseInt(els.newPkgAmount.value);

    if (isNaN(amount) || amount <= 0) {
        alert("Cantidad inválida");
        return;
    }

    if (config.packages.includes(amount)) {
        alert("Este paquete ya existe.");
        return;
    }

    // Insert into Supabase
    try {
        const { error } = await window.supabaseClient.from('packages').insert([{ amount }]);

        if (error) {
            console.error("Error inserting package:", error);
            alert("Error guardando el paquete en la nube.");
            return;
        }

        // Success: Reload from DB
        const { data: refreshed } = await supabaseClient.from('packages').select('*').order('amount');
        if (refreshed) {
            config.packages = refreshed.map(p => Number(p.amount)).filter(n => Number.isFinite(n));
            renderPackagesList();
            updateMessagePreview();
        }
        els.newPkgAmount.value = '';

    } catch (err) {
        console.error("Exception adding package:", err);
    }
}

function renderPackagesList() {
    // Deprecated for main dashboard
}

async function removePackage(amount) {
    if (!confirm(`¿Eliminar paquete de ${amount}k?`)) return;

    try {
        const { error } = await window.supabaseClient.from('packages').delete().eq('amount', amount);

        if (error) {
            console.error("Error deleting package:", error);
            alert("Error eliminando de la nube.");
            return;
        }

        config.packages = config.packages.filter(p => p !== amount);
        renderPackagesList();
        updateMessagePreview();

    } catch (err) {
        console.error("Exception deleting package:", err);
    }
}


// --- 3. PRICING & GENERATOR ENGINE ---

let templateSaveTimeout = null; // Debounce timer

function getCalculatedPrice(amount) {
    const baseRate = parseFloat(config.marketPrice) || 0.63; // Fallback to default
    const activeId = parseInt(els.genDiscountSelect.value) || 0;
    const isDiscountActive = els.genToggle.checked;

    const discountObj = config.customDiscounts.find(d => d.id === activeId);
    const discountPercent = (isDiscountActive && discountObj) ? discountObj.value : 0;

    let rawPrice = (amount / 1000) * baseRate * (1 - (discountPercent / 100));

    if (isNaN(rawPrice)) rawPrice = 0;

    // Formula: REDONDEAR.MAS( ... ; 2) -> Math.ceil(val * 100) / 100
    return (Math.ceil(rawPrice * 100) / 100).toFixed(2);
}

function updateMessagePreview() {
    const checkboxes = document.querySelectorAll('.pkg-checkbox:checked');
    const selectedPackages = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a, b) => a - b);

    // Update individual package price labels in the list
    const allPkgCheckboxes = document.querySelectorAll('.pkg-checkbox');
    allPkgCheckboxes.forEach(cb => {
        const val = parseInt(cb.value);
        const priceLabel = document.getElementById(`pkg-price-${val}`);
        if (priceLabel) {
            priceLabel.textContent = `$${getCalculatedPrice(val * 1000)} USDT`;
        }
    });

    const tMaster = document.getElementById('smart-tpl-master');
    let rawTemplate = tMaster ? tMaster.value : DEFAULT_SMART_TEMPLATE;

    if (!rawTemplate || rawTemplate.trim() === '') {
        rawTemplate = DEFAULT_SMART_TEMPLATE;
    }

    // --- SAVE TO SUPABASE (Debounced) ---
    // We update the local config immediately for UI consistency
    config.template_unified = rawTemplate;

    // Clear previous timeout
    if (templateSaveTimeout) clearTimeout(templateSaveTimeout);

    // Set new timeout (save after 1 second of inactivity)
    templateSaveTimeout = setTimeout(async () => {
        try {
            const { error } = await window.supabaseClient
                .from('config')
                .update({ template_unified: rawTemplate })
                .eq('id', 1);

            if (error) {
                console.error("Error saving template to Supabase:", error);
            } else {
                console.log("Template saved to Supabase ✅");
                // Optional: Update localStorage as backup
                localStorage.setItem('smartTemplateUnified', rawTemplate);
            }
        } catch (err) {
            console.error("Exception saving template:", err);
        }
    }, 1000);

    // Update Preview Logic...

    // Prepare Data
    const stockTotal = config.partners.reduce((sum, p) => sum + (p.coinsInvested || 0), 0) + (config.currencies?.coins || 0); // Approx
    const stockK = Math.floor(stockTotal / 1000);
    const baseRate = config.marketPrice;

    // Generate Package List String
    let packagesStr = "";
    if (selectedPackages.length === 0) {
        packagesStr = "    (Selecciona paquetes de la lista...)";
    } else {
        packagesStr = selectedPackages.map(pkg => {
            const price = getCalculatedPrice(pkg * 1000);
            return `\t💰 ${pkg}k Coins ➜ $${price} USDT`;
        }).join('\n');
    }

    // Replace Placeholders
    let msg = rawTemplate;
    msg = msg.replace(/{stock_total}/g, new Intl.NumberFormat('es-ES').format(stockTotal));
    msg = msg.replace(/{stock_k}/g, stockK);
    msg = msg.replace(/{tasa}/g, baseRate);
    msg = msg.replace(/{lista_paquetes}/g, packagesStr);

    if (els.msgOutput) {
        els.msgOutput.textContent = msg;
    }
}
