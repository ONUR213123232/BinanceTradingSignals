// Binance Trading Chart - Buy/Sell Signals
// Pine Script Birebir Çeviri

class TradingChart {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.currentSymbol = 'BTCUSDT';
        this.currentTimeframe = '5m';
        this.websocket = null;
        this.candleData = [];
        this.lastPrice = 0;
        
        // Chart boyutları
        this.chartWidth = 0;
        this.chartHeight = 0;
        this.candleWidth = 8;
        this.candlePadding = 2;
        this.maxCandles = 200;
        this.candleSpacing = this.candleWidth + this.candlePadding;
        
        // Fiyat aralığı
        this.minPrice = 0;
        this.maxPrice = 0;
        
        // Signals
        this.signals = [];
        
        // Animasyon
        this.animationId = null;
        
        // İnteraktif değişkenler
        this.isMouseDown = false;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.mousePos = { x: 0, y: 0 };
        this.chartOffset = 0;
        this.zoom = 1;
        this.visibleCandles = 50;
        
        // Fibonacci araçları
        this.fibonacciMode = false;
        this.fibonacciMagnet = false; // Varsayılan kapalı
        this.fibonacciDrawing = false;
        this.fibonacciDrawings = [];
        this.currentFib = null;
        
        // Grafik kontrolleri (duplikasyon temizlendi)
        
        this.init();
    }
    
    init() {
        console.log('🚀 Trading Chart başlatılıyor...');
        this.createChart();
        // Animation yerine direkt data yükle ve çiz
        this.loadData();
    }
    
    createChart() {
        const chartContainer = document.getElementById('tradingChart');
        
        // Container boyutunu ayarla (BÜYÜK grafİk)
        this.chartWidth = chartContainer.offsetWidth || 1200;
        this.chartHeight = chartContainer.offsetHeight || 600;
        
        // Eğer container küçükse, minimum boyut belirle
        if (this.chartHeight < 500) {
            this.chartHeight = 600;
        }
        if (this.chartWidth < 1000) {
            this.chartWidth = 1200;
        }
        
        // Canvas oluştur
        chartContainer.innerHTML = `
            <canvas id="mainChart" width="${this.chartWidth}" height="${this.chartHeight}" 
                    style="display: block; background: #0B1426; border-radius: 8px;"></canvas>
        `;
        
        // Canvas context al
        this.canvas = document.getElementById('mainChart');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = true;
        
        console.log('✅ Canvas oluşturuldu!');
        
        // Dropdown events
        this.bindEvents();
        
        // Chart events (mouse, keyboard)
        this.bindChartEvents();
        
        // Veri yükle
        this.loadData();
    }
    
    bindEvents() {
        // Symbol dropdown
        const symbolDropdown = document.getElementById('chartSymbol');
        if (symbolDropdown) {
            symbolDropdown.addEventListener('change', (e) => {
                this.currentSymbol = e.target.value;
                console.log(`💰 Sembol: ${this.currentSymbol}`);
                this.reloadChart();
            });
        }
        
        // Timeframe dropdown
        const timeframeDropdown = document.getElementById('chartTimeframe');
        if (timeframeDropdown) {
            timeframeDropdown.addEventListener('change', (e) => {
                this.currentTimeframe = e.target.value;
                console.log(`⏰ Timeframe: ${this.currentTimeframe}`);
                this.reloadChart();
            });
        }
        
        // Fibonacci araç butonları
        const fibBtn = document.getElementById('fibTool');
        if (fibBtn) {
            fibBtn.addEventListener('click', () => this.toggleFibonacci());
        }
        
        const fibMagnetBtn = document.getElementById('fibMagnet');
        if (fibMagnetBtn) {
            fibMagnetBtn.addEventListener('click', () => this.toggleFibonacciMagnet());
        }
        
        const fibClearBtn = document.getElementById('fibClear');
        if (fibClearBtn) {
            fibClearBtn.addEventListener('click', () => this.clearFibonacci());
        }
    }
    
    bindChartEvents() {
        if (!this.canvas) return;
        
        // Mouse hareketleri
        this.canvas.addEventListener('mousedown', (e) => {
            this.isMouseDown = true;
            this.isDragging = false;
            this.dragStart = { x: e.offsetX, y: e.offsetY };
            
            if (this.fibonacciMode) {
                if (!this.fibonacciDrawing) {
                    this.startFibonacci(e.offsetX, e.offsetY);
                } else {
                    this.completeFibonacci(e.offsetX, e.offsetY);
                }
            }
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            this.mousePos = { x: e.offsetX, y: e.offsetY };
            
            // Cursor style değiştir
            if (this.fibonacciMode) {
                this.canvas.style.cursor = 'crosshair';
            } else {
                this.canvas.style.cursor = this.isMouseDown ? 'grabbing' : 'grab';
            }
            
            if (this.isMouseDown && !this.fibonacciMode) {
                // Panning
                const deltaX = e.offsetX - this.dragStart.x;
                if (Math.abs(deltaX) > 5) {
                    this.isDragging = true;
                    this.chartOffset += deltaX;
                    this.dragStart.x = e.offsetX;
                    this.drawChart();
                }
            } else if (this.fibonacciDrawing) {
                this.updateFibonacci(e.offsetX, e.offsetY);
            }
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            this.isMouseDown = false;
            this.isDragging = false;
            
            if (this.fibonacciDrawing) {
                this.completeFibonacci(e.offsetX, e.offsetY);
            }
        });
        
        // Mouse wheel - zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom *= zoomDelta;
            this.zoom = Math.max(0.5, Math.min(3, this.zoom));
            this.drawChart();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'f' || e.key === 'F') {
                this.toggleFibonacci();
            } else if (e.key === 'm' || e.key === 'M') {
                this.toggleFibonacciMagnet();
            } else if (e.key === 'c' || e.key === 'C') {
                this.clearFibonacci();
            }
        });
    }
    
    async loadData() {
        try {
            console.log('📊 Veri yükleniliyor...');
            
            // Flask API'den kline verisi
            const response = await fetch(`/api/klines?symbol=${this.currentSymbol}&interval=${this.currentTimeframe}&limit=500`);
            const data = await response.json();
            
            this.candleData = data.map(kline => ({
                timestamp: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5])
            }));
            
            console.log(`✅ ${this.candleData.length} mum yüklendi`);
            
            // Buy/Sell sinyallerini hesapla
            this.calculateSignals();
            
            // WebSocket başlat
            this.startWebSocket();
            
        } catch (error) {
            console.error('❌ Veri yükleme hatası:', error);
        }
    }
    
    reloadChart() {
        if (this.websocket) {
            this.websocket.close();
        }
        this.candleData = [];
        this.signals = [];
        this.loadData();
    }
    
    // FinyX Advanced Signal - Pine Script Birebir Çeviri
    calculateSignals() {
        if (this.candleData.length < 100) return;
        
        this.signals = [];
        let lastSignalBar = null;
        const signalCooldown = 3; // 3 bar bekleme
        
        for (let i = 100; i < this.candleData.length; i++) {
            const current = this.candleData[i];
            const prev1 = this.candleData[i - 1];
            const prev2 = this.candleData[i - 2];
            
            // Zaman dilimi tespiti
            const currentTimeframe = this.getTimeframeSeconds();
            const isLowTf = currentTimeframe <= 300; // 5dk ve altı
            
            // Hacim hesaplamaları
            const volumeAvg = this.calculateSMA(i, 20, 'volume');
            const volumeAvgShort = this.calculateSMA(i, 10, 'volume');
            const priceChange = (current.close - current.open) / current.open * 100;
            const emaTrend = this.calculateEMA(i, 50);
            
            // Gelişmiş Fibonacci + Altın Oran Hesaplamaları
            const fib0618 = this.calculateLowest(i, 50, 'low') * 1.618;
            const fib1618 = this.calculateLowest(i, 50, 'low') * 2.618;
            const goldenRatio = 1.618;
            const phiInverse = 0.618;
            
            // Tesla 3-6-9 Kuralı (Frekans Harmonikleri)
            const tesla3 = 3;
            const tesla6 = 6;
            const tesla9 = 9;
            const harmonicPeriod = tesla3 * tesla6 * tesla9; // 162 periyot
            
            // Sacred Geometry - Altın Spiral Kontrolü
            const priceRatio = current.close / this.calculateHighest(i, 89, 'high');
            const isGoldenZone = priceRatio >= (phiInverse - 0.08) && priceRatio <= (phiInverse + 0.08);
            
            // Çoklu EMA Sistemi
            const emaFast = this.calculateEMA(i, 12);
            const emaMedium = this.calculateEMA(i, 26);
            const emaSlow = this.calculateEMA(i, 50);
            const emaTrendLong = this.calculateEMA(i, 100);
            
            // Trend Gücü ve Yönü
            const strongUptrend = emaFast > emaMedium && emaMedium > emaSlow && emaSlow > emaTrendLong && current.close > emaFast;
            const strongDowntrend = emaFast < emaMedium && emaMedium < emaSlow && emaSlow < emaTrendLong && current.close < emaFast;
            const weakUptrend = emaFast > emaMedium && current.close > emaFast && !strongUptrend;
            const weakDowntrend = emaFast < emaMedium && current.close < emaFast && !strongDowntrend;
            const sidewaysMarket = !strongUptrend && !strongDowntrend && !weakUptrend && !weakDowntrend;
            
            // Trend Değişim Tespiti
            const trendChangeUp = i > 0 && this.wasWeakDowntrend(i-1) && (sidewaysMarket || weakUptrend);
            const trendChangeDown = i > 0 && this.wasWeakUptrend(i-1) && (sidewaysMarket || weakDowntrend);
            
            // Momentum Göstergeleri
            const rsi = this.calculateRSI(i, 14);
            const macd = this.calculateMACD(i);
            const macdBullish = macd.line > macd.signal && macd.histogram > (i > 0 ? this.calculateMACD(i-1).histogram : 0);
            const macdBearish = macd.line < macd.signal && macd.histogram < (i > 0 ? this.calculateMACD(i-1).histogram : 0);
            
                    // Pivot Noktaları (Pine Script Birebir)
            const lookback = isLowTf ? 5 : 8;
            const pivotHigh = this.calculatePivotHigh(i, lookback);
            const pivotLow = this.calculatePivotLow(i, lookback);
            
            // DEBUG: Pivot kontrolü
            if (i === this.candleData.length - 1) {
                console.log(`PIVOT DEBUG - lookback: ${lookback}, pivotHigh: ${pivotHigh}, pivotLow: ${pivotLow}`);
            }
            
            // Güçlü Dip/Tepe Tespiti (Pine Script Birebir)
            const isStrongDip = pivotLow && current.volume > volumeAvg * 1.2;
            const isStrongPeak = pivotHigh && current.volume > volumeAvg * 1.2;
            
            // V şeklinde hareket tespiti (Pine Script Exact)
            const vShapeDip = i >= 2 && 
                prev2.low > prev1.low && prev1.low > current.low && 
                current.low < prev1.low && prev1.low < prev2.low && 
                current.volume > volumeAvg;
                
            const invertedVPeak = i >= 2 &&
                prev2.high < prev1.high && prev1.high < current.high &&
                current.high > prev1.high && prev1.high > prev2.high &&
                current.volume > volumeAvg;
            
            // Perfect Dip/Peak (Pine Script Exact)
            const perfectDip = isStrongDip || vShapeDip;
            const perfectPeak = isStrongPeak || invertedVPeak;
            
            // Hacim Analizi
            const volumeSurge = current.volume > volumeAvg * (isLowTf ? 2.0 : 1.8);
            const volumeAboveNormal = current.volume > volumeAvg * 1.4;
            const bigVolumeUp = current.close > current.open && current.volume > volumeAvg * 2.5 && current.close > prev1.close;
            const bigVolumeDown = current.close < current.open && current.volume > volumeAvg * 2.5 && current.close < prev1.close;
            
            // BUY Sinyal Koşulları
            const buyCondition1 = perfectDip && (strongDowntrend || weakDowntrend) && rsi < 40 && volumeAboveNormal;
            const buyCondition2 = trendChangeUp && macdBullish && rsi < 50 && volumeSurge;
            const buyCondition3 = sidewaysMarket && perfectDip && rsi < 35 && bigVolumeUp;
            
            // Yanlış buy sinyallerini engelle
            const avoidBuy = strongUptrend || (rsi > 60) || (current.close > emaTrendLong * 1.05);
            const isBuySignal = (buyCondition1 || buyCondition2 || buyCondition3) && !avoidBuy;
            
            // PUMP Sinyal Koşulları
            const pumpCondition1 = i > 0 && this.wasPerfectDip(i-1) && current.close > prev1.high && volumeSurge && priceChange > (isLowTf ? 1.2 : 0.8);
            const pumpCondition2 = trendChangeUp && bigVolumeUp && current.close > emaFast * 1.008;
            const pumpCondition3 = this.isGoldenZone(i) && macdBullish && current.volume > volumeAvg * 1.6 && current.close > current.open;
            
            // Yanlış pump sinyallerini engelle
            const avoidPump = strongUptrend && rsi > 70;
            const isPumpSignal = (pumpCondition1 || pumpCondition2 || pumpCondition3) && !avoidPump;
            
            // SELL Sinyal Koşulları (Pine Script Birebir - Daha Hassas)
            const sellCondition1 = perfectPeak && (strongUptrend || weakUptrend) && rsi > 60 && volumeAboveNormal;
            const sellCondition2 = trendChangeDown && macdBearish && rsi > 45 && volumeSurge;
            const sellCondition3 = sidewaysMarket && perfectPeak && rsi > 65 && bigVolumeDown;
            
            // Ek SELL koşulları (Pine Script'ten)
            const sellCondition4 = pivotHigh && rsi > 55 && current.volume > volumeAvg * 1.3;
            const sellCondition5 = strongUptrend && rsi > 70 && macdBearish;
            
            // Pine Script'teki tüm koşullar tam birebir
            const sellCondition6 = isGoldenZone && macdBearish && rsi > 60;
            const sellCondition7 = current.close < fib0618 && pivotHigh && volumeAboveNormal;
            
            // Yanlış sell sinyallerini engelle (Pine Script Exact)
            const avoidSell = strongDowntrend || (rsi < 35) || (current.close < emaTrendLong * 0.92);
            const isSellSignal = (sellCondition1 || sellCondition2 || sellCondition3 || sellCondition4 || sellCondition5 || sellCondition6 || sellCondition7) && !avoidSell;
            
            // DEBUG: SELL sinyal kontrolü
            if (i === this.candleData.length - 1) {
                console.log(`SELL DEBUG - perfectPeak: ${perfectPeak}, strongUptrend: ${strongUptrend}, weakUptrend: ${weakUptrend}, rsi: ${rsi.toFixed(2)}, volumeAboveNormal: ${volumeAboveNormal}`);
                console.log(`SELL DEBUG - trendChangeDown: ${trendChangeDown}, macdBearish: ${macdBearish}, volumeSurge: ${volumeSurge}`);
                console.log(`SELL DEBUG - avoidSell: ${avoidSell}, isSellSignal: ${isSellSignal}`);
            }
            
            // Sinyal Çakışma Kontrolü
            const currentSignal = isBuySignal || isPumpSignal || isSellSignal;
            const signalAllowed = !lastSignalBar || (i - lastSignalBar) >= signalCooldown;
            
            // Sinyalleri ekle
            if (isPumpSignal && signalAllowed) {
                this.signals.push({
                    index: i,
                    type: 'PUMP',
                    price: current.close,
                    timestamp: current.timestamp,
                    emoji: '💥',
                    text: 'PUMP'
                });
                lastSignalBar = i;
            }
            
            if (isBuySignal && signalAllowed) {
                this.signals.push({
                    index: i,
                    type: 'BUY',
                    price: current.close,
                    timestamp: current.timestamp,
                    emoji: '🛍️',
                    text: 'BUY'
                });
                lastSignalBar = i;
            }
            
            if (isSellSignal && signalAllowed) {
                this.signals.push({
                    index: i,
                    type: 'SELL',
                    price: current.close,
                    timestamp: current.timestamp,
                    emoji: '🚨',
                    text: 'SELL'
                });
                lastSignalBar = i;
            }
        }
        
        console.log(`🎯 ${this.signals.length} sinyal tespit edildi (FinyX Advanced)`);
    }
    
    // RSI Hesaplama (Pine Script Logic)
    calculateRSI(index, period = 14) {
        if (index < period) return 50;
        
        let gains = 0, losses = 0;
        
        for (let i = index - period + 1; i <= index; i++) {
            const change = this.candleData[i].close - this.candleData[i - 1].close;
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    
    calculateLowest(index, period, field = 'low') {
        if (index < period - 1) return this.candleData[0][field];
        
        let lowest = this.candleData[index - period + 1][field];
        for (let i = index - period + 2; i <= index; i++) {
            if (this.candleData[i][field] < lowest) {
                lowest = this.candleData[i][field];
            }
        }
        return lowest;
    }
    
    calculateHighest(index, period, field = 'high') {
        if (index < period - 1) return this.candleData[0][field];
        
        let highest = this.candleData[index - period + 1][field];
        for (let i = index - period + 2; i <= index; i++) {
            if (this.candleData[i][field] > highest) {
                highest = this.candleData[i][field];
            }
        }
        return highest;
    }
    
    // EMA Hesaplama (Pine Script Logic)
    calculateEMA(index, period) {
        if (index < period) return this.candleData[index].close;
        
        const multiplier = 2 / (period + 1);
        let ema = this.candleData[index - period].close;
        
        for (let i = index - period + 1; i <= index; i++) {
            ema = (this.candleData[i].close * multiplier) + (ema * (1 - multiplier));
        }
        
        return ema;
    }
    
    // Tesla 3-6-9 Harmonik Hesaplama
    calculateHarmonic(index, period) {
        if (index < period * 2) return 0;
        
        const prices = [];
        for (let i = index - period; i <= index; i++) {
            prices.push(this.candleData[i].close);
        }
        
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const current = this.candleData[index].close;
        
        return ((current - avg) / avg) * 100;
    }
    
    // Fibonacci Retracement Hesaplama
    calculateFibonacci(index, period = 20) {
        if (index < period) return { level382: 0, level618: 0 };
        
        const highs = [];
        const lows = [];
        
        for (let i = index - period; i <= index; i++) {
            highs.push(this.candleData[i].high);
            lows.push(this.candleData[i].low);
        }
        
        const high = Math.max(...highs);
        const low = Math.min(...lows);
        const range = high - low;
        
        return {
            level382: high - (range * 0.382),
            level618: high - (range * 0.618)
        };
    }
    
    // Yardımcı Metodlar (Pine Script Logic)
    getTimeframeSeconds() {
        const timeframes = {
            '1m': 60, '3m': 180, '5m': 300, '15m': 900,
            '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400,
            '6h': 21600, '8h': 28800, '12h': 43200, '1d': 86400
        };
        return timeframes[this.currentTimeframe] || 3600;
    }
    
    calculateSMA(index, period, field = 'close') {
        if (index < period - 1) return this.candleData[index][field];
        
        let sum = 0;
        for (let i = index - period + 1; i <= index; i++) {
            sum += this.candleData[i][field];
        }
        return sum / period;
    }
    
    calculateMACD(index) {
        const ema12 = this.calculateEMA(index, 12);
        const ema26 = this.calculateEMA(index, 26);
        const macdLine = ema12 - ema26;
        
        // Signal line (9-period EMA of MACD)
        let signalSum = 0;
        let count = 0;
        for (let i = Math.max(0, index - 8); i <= index; i++) {
            const ema12_i = this.calculateEMA(i, 12);
            const ema26_i = this.calculateEMA(i, 26);
            signalSum += (ema12_i - ema26_i);
            count++;
        }
        const signalLine = signalSum / count;
        
        return {
            line: macdLine,
            signal: signalLine,
            histogram: macdLine - signalLine
        };
    }
    
    calculatePivotHigh(index, lookback) {
        // Pine Script ta.pivothigh logic'i birebir
        if (index < lookback) return false;
        
        const currentHigh = this.candleData[index].high;
        
        // Sol taraf kontrolü
        for (let i = index - lookback; i < index; i++) {
            if (this.candleData[i].high >= currentHigh) {
                return false;
            }
        }
        
        // Sağ taraf kontrolü (mevcut veriler için)
        for (let i = index + 1; i <= Math.min(index + lookback, this.candleData.length - 1); i++) {
            if (this.candleData[i].high >= currentHigh) {
                return false;
            }
        }
        
        return true;
    }
    
    calculatePivotLow(index, lookback) {
        // Pine Script ta.pivotlow logic'i birebir
        if (index < lookback) return false;
        
        const currentLow = this.candleData[index].low;
        
        // Sol taraf kontrolü
        for (let i = index - lookback; i < index; i++) {
            if (this.candleData[i].low <= currentLow) {
                return false;
            }
        }
        
        // Sağ taraf kontrolü (mevcut veriler için)
        for (let i = index + 1; i <= Math.min(index + lookback, this.candleData.length - 1); i++) {
            if (this.candleData[i].low <= currentLow) {
                return false;
            }
        }
        
        return true;
    }
    
    wasWeakDowntrend(index) {
        if (index < 100) return false;
        const emaFast = this.calculateEMA(index, 12);
        const emaMedium = this.calculateEMA(index, 26);
        const emaSlow = this.calculateEMA(index, 50);
        const emaTrendLong = this.calculateEMA(index, 100);
        const current = this.candleData[index];
        
        // Pine Script weak_downtrend logic'i birebir
        const strongDowntrend = emaFast < emaMedium && emaMedium < emaSlow && emaSlow < emaTrendLong && current.close < emaFast;
        const weakDowntrend = emaFast < emaMedium && current.close < emaFast && !strongDowntrend;
        
        return weakDowntrend;
    }
    
    wasWeakUptrend(index) {
        if (index < 100) return false;
        const emaFast = this.calculateEMA(index, 12);
        const emaMedium = this.calculateEMA(index, 26);
        const emaSlow = this.calculateEMA(index, 50);
        const emaTrendLong = this.calculateEMA(index, 100);
        const current = this.candleData[index];
        
        // Pine Script weak_uptrend logic'i birebir
        const strongUptrend = emaFast > emaMedium && emaMedium > emaSlow && emaSlow > emaTrendLong && current.close > emaFast;
        const weakUptrend = emaFast > emaMedium && current.close > emaFast && !strongUptrend;
        
        return weakUptrend;
    }
    
    wasPerfectDip(index) {
        if (index < 10) return false;
        const volumeAvg = this.calculateSMA(index, 20, 'volume');
        const current = this.candleData[index];
        return current.volume > volumeAvg * 1.2;
    }
    
    isGoldenZone(index) {
        if (index < 89) return false;
        let highest = 0;
        for (let i = index - 88; i <= index; i++) {
            highest = Math.max(highest, this.candleData[i].high);
        }
        const priceRatio = this.candleData[index].close / highest;
        const phiInverse = 0.618;
        return priceRatio >= (phiInverse - 0.08) && priceRatio <= (phiInverse + 0.08);
    }
    
    // WebSocket Bağlantısı
    startWebSocket() {
        if (this.websocket) {
            this.websocket.close();
        }
        
        const symbol = this.currentSymbol.toLowerCase();
        const interval = this.currentTimeframe;
        const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`;
        
        this.websocket = new WebSocket(wsUrl);
        
        this.websocket.onopen = () => {
            console.log(`🔗 WebSocket bağlandı: ${symbol.toUpperCase()}`);
        };
        
        this.websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const kline = data.k;
            
            if (kline) {
                const newCandle = {
                    timestamp: kline.t,
                    open: parseFloat(kline.o),
                    high: parseFloat(kline.h),
                    low: parseFloat(kline.l),
                    close: parseFloat(kline.c),
                    volume: parseFloat(kline.v)
                };
                
                // Son mumu güncelle
                if (this.candleData.length > 0) {
                    this.candleData[this.candleData.length - 1] = newCandle;
                }
                
                // Sinyalleri yeniden hesapla
                this.calculateSignals();
                
                // Grafik çiz
                this.drawChart();
            }
        };
        
        this.websocket.onerror = (error) => {
            console.error('❌ WebSocket hatası:', error);
        };
        
        this.websocket.onclose = () => {
            console.log('🔄 WebSocket bağlantısı kapandı');
        };
    }
    
    // TradingView Tarzı Çizim Metodları
    drawChart() {
        if (!this.ctx || this.candleData.length === 0) return;
        
        // Canvas temizle
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Mum genişliği hesapla
        this.candleWidth = Math.max(2, (this.canvas.width - 100) / this.candleData.length * 0.8);
        this.candleSpacing = (this.canvas.width - 100) / this.candleData.length;
        
        // Fiyat aralığı hesapla
        this.calculatePriceRange();
        
        // Grid çiz
        this.drawGrid();
        
        // Mumları çiz
        this.drawCandles();
        
        // Buy/Sell sinyallerini çiz
        this.drawSignals();
        
        // Fibonacci çizgilerini çiz
        this.fibonacciDrawings.forEach(fib => this.drawFibonacci(fib));
        if (this.currentFib && this.fibonacciDrawing) {
            this.drawFibonacci(this.currentFib);
        }
    }
    
    calculatePriceRange() {
        let minPrice = Infinity;
        let maxPrice = -Infinity;
        
        this.candleData.forEach(candle => {
            minPrice = Math.min(minPrice, candle.low);
            maxPrice = Math.max(maxPrice, candle.high);
        });
        
        const padding = (maxPrice - minPrice) * 0.1;
        this.minPrice = minPrice - padding;
        this.maxPrice = maxPrice + padding;
        this.priceRange = this.maxPrice - this.minPrice;
    }
    
    priceToY(price) {
        return 50 + (this.maxPrice - price) / this.priceRange * (this.canvas.height - 100);
    }
    
    indexToX(index) {
        return 50 + (index * this.candleSpacing * this.zoom) + this.chartOffset;
    }
    
    yToPrice(y) {
        return this.maxPrice - ((y - 50) / (this.canvas.height - 100)) * this.priceRange;
    }
    
    xToIndex(x) {
        return Math.floor((x - 50 - this.chartOffset) / (this.candleSpacing * this.zoom));
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 2]);
        
        // Yatay grid çizgileri
        const priceStep = this.priceRange / 10;
        for (let i = 0; i <= 10; i++) {
            const price = this.minPrice + (priceStep * i);
            const y = this.priceToY(price);
            
            this.ctx.beginPath();
            this.ctx.moveTo(50, y);
            this.ctx.lineTo(this.canvas.width - 50, y);
            this.ctx.stroke();
            
            // Fiyat etiketi
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(price.toFixed(4), 5, y + 4);
        }
        
        this.ctx.setLineDash([]);
    }
    
    drawCandles() {
        this.candleData.forEach((candle, index) => {
            const x = this.indexToX(index);
            const openY = this.priceToY(candle.open);
            const closeY = this.priceToY(candle.close);
            const highY = this.priceToY(candle.high);
            const lowY = this.priceToY(candle.low);
            
            const isGreen = candle.close > candle.open;
            const wickColor = isGreen ? '#26a69a' : '#ef5350';
            const bodyColor = isGreen ? '#26a69a' : '#ef5350';
            
            // Fitil çiz
            this.ctx.strokeStyle = wickColor;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(x + this.candleWidth/2, highY);
            this.ctx.lineTo(x + this.candleWidth/2, lowY);
            this.ctx.stroke();
            
            // Gövde çiz
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.abs(closeY - openY);
            
            this.ctx.fillStyle = bodyColor;
            this.ctx.fillRect(x, bodyTop, this.candleWidth, Math.max(bodyHeight, 1));
            
            // Sınır çiz
            this.ctx.strokeStyle = isGreen ? '#00695c' : '#c62828';
            this.ctx.lineWidth = 0.5;
            this.ctx.strokeRect(x, bodyTop, this.candleWidth, Math.max(bodyHeight, 1));
        });
    }
    
    drawSignals() {
        this.signals.forEach(signal => {
            const candle = this.candleData[signal.index];
            if (!candle) return;
            
            const x = this.indexToX(signal.index);
            const yOffset = signal.type === 'SELL' ? -30 : 30;
            const y = signal.type === 'SELL' ? 
                this.priceToY(candle.high) + yOffset : 
                this.priceToY(candle.low) + yOffset;
            
            // Sinyal kutusu
            const boxWidth = 50;
            const boxHeight = 25;
            
            let bgColor, textColor;
            switch(signal.type) {
                case 'PUMP':
                    bgColor = '#00FF00';
                    textColor = '#000000';
                    break;
                case 'BUY':
                    bgColor = '#FFA500';
                    textColor = '#FFFFFF';
                    break;
                case 'SELL':
                    bgColor = '#FF0000';
                    textColor = '#FFFFFF';
                    break;
            }
            
            // Kutu çiz
            this.ctx.fillStyle = bgColor;
            this.ctx.fillRect(x - boxWidth/2, y - boxHeight/2, boxWidth, boxHeight);
            
            // Metin çiz
            this.ctx.fillStyle = textColor;
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${signal.emoji}`, x, y - 2);
            this.ctx.font = '10px Arial';
            this.ctx.fillText(signal.text, x, y + 10);
            
            // Ok çiz
            this.ctx.fillStyle = bgColor;
            this.ctx.beginPath();
            if (signal.type === 'SELL') {
                // Yukarı ok
                this.ctx.moveTo(x, y + boxHeight/2);
                this.ctx.lineTo(x - 5, y + boxHeight/2 + 8);
                this.ctx.lineTo(x + 5, y + boxHeight/2 + 8);
            } else {
                // Aşağı ok
                this.ctx.moveTo(x, y - boxHeight/2);
                this.ctx.lineTo(x - 5, y - boxHeight/2 - 8);
                this.ctx.lineTo(x + 5, y - boxHeight/2 - 8);
            }
            this.ctx.closePath();
            this.ctx.fill();
            
            this.ctx.textAlign = 'left';
        });
    }
    
    // ===================== FİBONACCİ ARAÇLARI =====================
    
    drawFibonacci() {
        if (!this.fibonacciDrawings || this.fibonacciDrawings.length === 0) return;
        
        this.fibonacciDrawings.forEach(fib => {
            if (!fib.startPoint || !fib.endPoint) return;
            
            const startX = this.indexToX(fib.startPoint.index);
            const startY = this.priceToY(fib.startPoint.price);
            const endX = this.indexToX(fib.endPoint.index);
            const endY = this.priceToY(fib.endPoint.price);
            
            // Fibonacci seviyeleri
            const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
            const colors = ['#FFD700', '#FFA500', '#FF6347', '#FF4500', '#DC143C', '#B22222', '#8B0000'];
            
            levels.forEach((level, index) => {
                const y = startY + (endY - startY) * level;
                const price = fib.startPoint.price + (fib.endPoint.price - fib.startPoint.price) * level;
                
                // Çizgi çiz
                this.ctx.beginPath();
                this.ctx.strokeStyle = colors[index];
                this.ctx.lineWidth = 1;
                this.ctx.setLineDash([2, 2]);
                this.ctx.moveTo(Math.min(startX, endX), y);
                this.ctx.lineTo(Math.max(startX, endX), y);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
                
                // Label çiz
                this.ctx.fillStyle = colors[index];
                this.ctx.font = '12px Arial';
                this.ctx.textAlign = 'right';
                this.ctx.fillText(`${(level * 100).toFixed(1)}% - $${price.toFixed(4)}`, Math.max(startX, endX) - 5, y - 5);
            });
            
            // Ana çizgiyi çiz
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#FFD700';
            this.ctx.lineWidth = 2;
            this.ctx.moveTo(startX, startY);
            this.ctx.lineTo(endX, endY);
            this.ctx.stroke();
        });
    }
    
    toggleFibonacci() {
        this.fibonacciMode = !this.fibonacciMode;
        const btn = document.getElementById('fibTool');
        if (btn) {
            btn.style.backgroundColor = this.fibonacciMode ? '#FFD700' : '';
            btn.style.color = this.fibonacciMode ? '#000' : '';
        }
        console.log(`📏 Fibonacci modu: ${this.fibonacciMode ? 'AÇIK' : 'KAPALI'}`);
    }
    
    toggleFibonacciMagnet() {
        this.fibonacciMagnet = !this.fibonacciMagnet;
        const btn = document.getElementById('fibMagnet');
        if (btn) {
            btn.style.backgroundColor = this.fibonacciMagnet ? '#FFD700' : '';
            btn.style.color = this.fibonacciMagnet ? '#000' : '';
        }
        console.log(`🧲 Fibonacci mıknatıs: ${this.fibonacciMagnet ? 'AÇIK' : 'KAPALI'}`);
    }
    
    clearFibonacci() {
        this.fibonacciDrawings = [];
        this.drawChart();
        console.log('🧹 Fibonacci çizimleri temizlendi');
    }
    
    // ===================== MOUSE EVENT HELPERS =====================
    
    yToPrice(y) {
        const priceRange = this.maxPrice - this.minPrice;
        const pricePerPixel = priceRange / (this.chartHeight - 100);
        return this.maxPrice - (y - 50) * pricePerPixel;
    }
    
    xToIndex(x) {
        const candleWidth = (this.chartWidth - 100) / this.visibleCandles;
        const index = Math.floor((x - 50 + this.chartOffset) / candleWidth);
        return Math.max(0, Math.min(this.candleData.length - 1, index));
    }
    
    findNearestHighLow(index) {
        if (index < 0 || index >= this.candleData.length) return null;
        
        const candle = this.candleData[index];
        const highPrice = candle.high;
        const lowPrice = candle.low;
        
        return {
            high: { index, price: highPrice },
            low: { index, price: lowPrice }
        };
    }
    
    // Fibonacci çizim fonksiyonları
    startFibonacci(x, y) {
        const price = this.yToPrice(y);
        
        console.log('=== FIBONACCI START DEBUG ===');
        console.log('Mouse x:', x, 'Mouse y:', y);
        console.log('Price:', price);
        
        // Direkt mouse koordinatlarını kullan
        this.currentFib = { 
            startPoint: { 
                x: x, 
                y: y, 
                price: price 
            } 
        };
        
        // Eğer mıknatıs modu açıksa yakın high/low'a snap yap
        if (this.fibonacciMagnet) {
            const nearestHL = this.findNearestHighLow(index);
            if (nearestHL) {
                const highY = this.priceToY(nearestHL.high.price);
                const lowY = this.priceToY(nearestHL.low.price);
                
                // En yakın noktayı seç
                if (Math.abs(y - highY) < Math.abs(y - lowY)) {
                    this.currentFib.startPoint = nearestHL.high;
                } else {
                    this.currentFib.startPoint = nearestHL.low;
                }
            }
        }
        
        this.fibonacciDrawing = true;
        console.log('📏 Fibonacci çizimi başladı');
    }
    
    updateFibonacci(x, y) {
        if (!this.currentFib || !this.currentFib.startPoint) return;
        
        
        const price = this.yToPrice(y);
        
        // Direkt mouse koordinatlarını kullan
        this.currentFib.endPoint = { 
            x: x, 
            y: y, 
            price: price 
        };
        
        this.drawChart();
    }
    
    // Fibonacci çizim fonksiyonu
    drawFibonacci() {
        // Aktif çizilen Fibonacci
        if (this.currentFib && this.currentFib.startPoint) {
            this.drawSingleFibonacci(this.currentFib);
        }
        
        // Tamamlanan Fibonacci çizimleri
        for (const fib of this.fibonacciDrawings) {
            this.drawSingleFibonacci(fib);
        }
    }
    
    drawSingleFibonacci(fib) {
        if (!fib.startPoint) return;
        
        const startX = fib.startPoint.x || 0;
        const startY = fib.startPoint.y || 0;
        
        let endX = startX;
        let endY = startY;
        
        if (fib.endPoint) {
            endX = fib.endPoint.x || startX;
            endY = fib.endPoint.y || startY;
        }
        
        // Ana trend çizgisi
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([]);
        
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
        
        // Fibonacci seviyeleri
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3'];
        
        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const color = colors[i];
            
            const levelY = startY + (endY - startY) * level;
            
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([2, 2]);
            
            this.ctx.beginPath();
            this.ctx.moveTo(Math.min(startX, endX), levelY);
            this.ctx.lineTo(Math.max(startX, endX), levelY);
            this.ctx.stroke();
            
            // Seviye etiketi
            this.ctx.fillStyle = color;
            this.ctx.font = '12px Arial';
            this.ctx.fillText(
                (level * 100).toFixed(1) + '%', 
                Math.max(startX, endX) + 5, 
                levelY + 4
            );
        }
    }
    
    completeFibonacci(x, y) {
        if (!this.currentFib) return;
        
        this.updateFibonacci(x, y);
        this.fibonacciDrawings.push({ ...this.currentFib });
        this.currentFib = null;
        this.fibonacciDrawing = false;
        console.log('🏁 Fibonacci tamamlandı');
    }
    
    // =========================
    // FİBONACCI ARAÇLARI
    // =========================
    
    toggleFibonacci() {
        this.fibonacciMode = !this.fibonacciMode;
        const fibBtn = document.getElementById('fibTool');
        if (fibBtn) {
            if (this.fibonacciMode) {
                fibBtn.style.backgroundColor = '#FFD700';
                fibBtn.style.color = '#000';
                console.log('📈 Fibonacci modu AKTİF');
            } else {
                fibBtn.style.backgroundColor = '#1a1a1a';
                fibBtn.style.color = '#FFD700';
                console.log('📈 Fibonacci modu DEAKTİF');
            }
        }
    }
    
    toggleFibonacciMagnet() {
        this.fibonacciMagnet = !this.fibonacciMagnet;
        const magnetBtn = document.getElementById('fibMagnet');
        if (magnetBtn) {
            if (this.fibonacciMagnet) {
                magnetBtn.style.backgroundColor = '#FFD700';
                magnetBtn.style.color = '#000';
                console.log('🧲 Mıknatıs modu AKTİF');
            } else {
                magnetBtn.style.backgroundColor = '#1a1a1a';
                magnetBtn.style.color = '#FFD700';
                console.log('🧲 Mıknatıs modu DEAKTİF');
            }
        }
    }
    
    clearFibonacci() {
        this.fibonacciDrawings = [];
        this.currentFib = null;
        this.fibonacciDrawing = false;
        this.drawChart();
        console.log('🧽 Fibonacci çizimleri temizlendi');
    }
    
    startFibonacci(x, y) {
        const index = this.xToIndex(x);
        const price = this.yToPrice(y);
        
        this.currentFib = {
            startPoint: { index, price },
            endPoint: null
        };
        this.fibonacciDrawing = true;
        console.log('📈 Fibonacci başladı:', { x, y, index, price });
    }
    
    findNearestHighLow(index) {
        if (this.candleData.length < 10) return null;
        
        const range = 10;
        const start = Math.max(0, index - range);
        const end = Math.min(this.candleData.length - 1, index + range);
        
        let highest = { price: -Infinity, index: start };
        let lowest = { price: Infinity, index: start };
        
        for (let i = start; i <= end; i++) {
            if (i >= 0 && i < this.candleData.length) {
                const candle = this.candleData[i];
                if (candle.high > highest.price) {
                    highest = { price: candle.high, index: i };
                }
                if (candle.low < lowest.price) {
                    lowest = { price: candle.low, index: i };
                }
            }
        }
        
        return { high: highest, low: lowest };
    }
    
    drawFibonacci(fib) {
        if (!fib.startPoint || !fib.endPoint) return;
        
        const startX = this.indexToX(fib.startPoint.index);
        const startY = this.priceToY(fib.startPoint.price);
        const endX = this.indexToX(fib.endPoint.index);
        const endY = this.priceToY(fib.endPoint.price);
        
        const priceDiff = fib.endPoint.price - fib.startPoint.price;
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
        const colors = ['#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF'];
        
        levels.forEach((level, i) => {
            const price = fib.startPoint.price + (priceDiff * level);
            const y = this.priceToY(price);
            
            this.ctx.strokeStyle = colors[i];
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([]);
            
            this.ctx.beginPath();
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
            this.ctx.stroke();
            
            // Fiyat labelı
            this.ctx.fillStyle = colors[i];
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`${(level * 100).toFixed(1)}% - $${price.toFixed(4)}`, endX + 5, y - 5);
        });
    }
}

// Chart'ı başlat
let tradingChart = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 DOM yüklendi, chart başlatılıyor...');
    tradingChart = new TradingChart();
});
