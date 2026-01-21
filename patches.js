
// --- OVERRIDE: Actualización para Historial Universal y Filtros ---
// Reemplazamos la función syncChart anterior para incluir la lógica de depósitos/retiros y filtros


document.addEventListener('DOMContentLoaded', () => {


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
                // Convertir a String para evitar errores de tipo (number vs string)
                const keyStr = String(key);
                const filterStr = String(filterPartner);

                if (filterStr !== 'all' && keyStr !== filterStr) return;
                if (filterStr !== 'all' && keyStr === 'global') return; // Si filtramos socio, ocultar global

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
    };

    // For good measure, call it once to refresh immediately if data is ready
    if (window.sales && window.sales.length > 0) {
        window.syncChart();
    }
});

