// Canvas Tabanlı Candlestick Chart Sistemi
class TradingChart {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.rsiCanvas = null;
        this.rsiCtx = null;
        this.currentSymbol = 'BTCUSDT';
        this.currentTimeframe = '5m';
        this.websocket = null;
        this.candleData = [];
        this.lastPrice = 0;
        
        // Varsayılan sembol ve zaman dilimi
        this.currentSymbol = 'BTCUSDT';
        this.currentTimeframe = '5m';
        
        // Buy/Sell Signals Array
        this.signals = [];
        
        // İndikatör verileri
        this.rsiData = [];
        this.emaData = [];
        
        // Binance Perpetual Futures Sembolleri
        this.perpetualSymbols = [];
        
        // Binance Tüm Zaman Dilimleri
        this.timeframes = {
            '1s': '1s', '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', 
            '30m': '30m', '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h',
            '8h': '8h', '12h': '12h', '1d': '1d', '3d': '3d', '1w': '1w', '1M': '1M'
        };
        
        // Chart boyutları
        this.chartWidth = 0;
        this.chartHeight = 0;
        this.candleWidth = 8;
        this.candlePadding = 2;
        this.maxCandles = 100;
        this.maxVolume = 0; // 100;
        
        // Fiyat aralığı
        this.minPrice = 0;
        this.maxPrice = 0;
        
        // İndikatörler
        this.rsiData = [];
        this.emaData = [];
        this.volumeData = [];
        this.signals = []; // BUY/PUMP/SELL sinyalleri
        
        // Animasyon
        this.animationId = null;
        
        // İnteraktivite değişkenleri
        this.isMouseDown = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.offsetX = 0;
        this.scale = 1;
        this.minScale = 0.5;
        this.maxScale = 3;
        
        console.log('🚀 TradingChart başlatılıyor...');
        this.createChart();
        this.startAnimation();
    }
    
    createChart() {
        const chartContainer = document.getElementById('tradingChart');
        
        // Container boyutunu kontrol et
        if (!chartContainer.offsetWidth || !chartContainer.offsetHeight) {
            console.log('🔍 Chart container boyutu ayarlanıyor...');
            chartContainer.style.width = '100%';
            chartContainer.style.height = '400px';
        }
        
        this.chartWidth = chartContainer.offsetWidth;
        this.chartHeight = chartContainer.offsetHeight - 100; // RSI için yer bırak
        
        console.log('📊 Chart boyutu:', this.chartWidth, 'x', this.chartHeight);
        
        // Ana canvas oluştur
        chartContainer.innerHTML = `
            <canvas id="mainChart" width="${this.chartWidth}" height="${this.chartHeight}" 
                    style="display: block; background: #0B1426; border-radius: 8px;"></canvas>
            <canvas id="rsiChart" width="${this.chartWidth}" height="100" 
                    style="display: block; background: #0B1426; border-radius: 8px; margin-top: 5px;"></canvas>
        `;
        
        // Canvas context'leri al
        this.canvas = document.getElementById('mainChart');
        this.ctx = this.canvas.getContext('2d');
        
        this.rsiCanvas = document.getElementById('rsiChart');
        this.rsiCtx = this.rsiCanvas.getContext('2d');
        
        // Canvas ayarları
        this.ctx.imageSmoothingEnabled = true;
        this.rsiCtx.imageSmoothingEnabled = true;
        
        // Mouse event listeners
        this.bindMouseEvents();
        
        // Dropdown event listeners
        this.bindDropdownEvents();
        
        // Responsive handling
        window.addEventListener('resize', () => {
            this.resizeChart();
        });
        
        console.log('✅ Canvas chart oluşturuldu!');
        
        // Perpetual symbols'ı yükle
        this.loadPerpetualSymbols();
        
        // Veri yükleme ve WebSocket başlat
        this.loadHistoricalData();
        this.startWebSocket();
    }
    
    // Binance Perpetual Futures Sembolleri Yükle
    async loadPerpetualSymbols() {
        try {
            const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
            const data = await response.json();
            
            this.perpetualSymbols = data.symbols
                .filter(symbol => symbol.contractType === 'PERPETUAL' && symbol.status === 'TRADING')
                .map(symbol => symbol.symbol)
                .sort();
                
            console.log(`🪙 ${this.perpetualSymbols.length} Perpetual Futures sembolü yüklendi!`);
            
            // Dropdown'ı güncelle
            this.updateSymbolDropdown();
            
        } catch (error) {
            console.error('❌ Perpetual symbols yükleme hatası:', error);
            // Fallback symbols
            this.perpetualSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT', 'SOLUSDT', 'DOGEUSDT'];
            this.updateSymbolDropdown();
        }
    }
    
    // Symbol dropdown'ı güncelle
    updateSymbolDropdown() {
        const dropdown = document.getElementById('chartSymbol');
        if (!dropdown || this.perpetualSymbols.length === 0) return;
        
        // Mevcut seçimi kaydet
        const currentValue = dropdown.value || this.currentSymbol;
        
        // Dropdown'ı temizle
        dropdown.innerHTML = '';
        
        // Perpetual symbols ekle
        this.perpetualSymbols.forEach(symbol => {
            const option = document.createElement('option');
            option.value = symbol;
            option.textContent = symbol.replace('USDT', '/USDT');
            if (symbol === currentValue) {
                option.selected = true;
            }
            dropdown.appendChild(option);
        });
        
        console.log(`📝 ${this.perpetualSymbols.length} sembol dropdown'a eklendi!`);
    }
    
    // Timeframe'i Binance interval'ine çevir
    timeframeToInterval(timeframe) {
        return this.timeframes[timeframe] || timeframe;
    }
    
    // Mouse event listeners
    bindMouseEvents() {
        let isMouseDown = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        
        // Mouse down
        this.canvas.addEventListener('mousedown', (e) => {
            isMouseDown = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            this.canvas.style.cursor = 'grabbing';
        });
        
        // Mouse move (drag)
        this.canvas.addEventListener('mousemove', (e) => {
            if (isMouseDown) {
                const deltaX = e.clientX - lastMouseX;
                this.offsetX += deltaX;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
            }
        });
        
        // Mouse up
        this.canvas.addEventListener('mouseup', () => {
            isMouseDown = false;
            this.canvas.style.cursor = 'grab';
        });
        
        // Mouse leave
        this.canvas.addEventListener('mouseleave', () => {
            isMouseDown = false;
            this.canvas.style.cursor = 'default';
        });
        
        // Mouse wheel (zoom)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            this.scale *= zoomFactor;
            
            // Scale limits
            this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale));
        });
        
        console.log('🕰️ Mouse events bağlandı!');
    }
    
    // Dropdown event listeners
    bindDropdownEvents() {
        // Symbol dropdown
        const symbolDropdown = document.getElementById('chartSymbol');
        if (symbolDropdown) {
            symbolDropdown.addEventListener('change', (e) => {
                this.currentSymbol = e.target.value;
                console.log(`💰 Sembol değiştirildi: ${this.currentSymbol}`);
                this.reloadChart();
            });
        }
        
        // Timeframe dropdown
        const timeframeDropdown = document.getElementById('chartTimeframe');
        if (timeframeDropdown) {
            timeframeDropdown.addEventListener('change', (e) => {
                this.currentTimeframe = e.target.value;
                console.log(`⏰ Zaman dilimi değiştirildi: ${this.currentTimeframe}`);
                this.reloadChart();
            });
        }
        
        // Fullscreen button
        const fullscreenBtn = document.getElementById('chartFullscreen');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }
        
        console.log('📱 Dropdown events bağlandı!');
    }
    
    // Chart'ı yeniden yükle
    reloadChart() {
        // WebSocket'i durdur
        if (this.websocket) {
            this.websocket.close();
        }
        
        // Veriyi temizle
        this.candleData = [];
        
        // Yeni veriyi yükle
        this.loadHistoricalData();
        this.startWebSocket();
    }
    
    // Fiyat bilgilerini güncelle
    updatePriceInfo(price, changePercent = null) {
        const priceElement = document.getElementById('currentPrice');
        const changeElement = document.getElementById('priceChange');
        
        if (priceElement) {
            priceElement.textContent = `$${price.toFixed(4)}`;
        }
        
        if (changeElement && changePercent !== null) {
            const isPositive = changePercent >= 0;
            changeElement.textContent = `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%`;
            changeElement.className = `price-change ${isPositive ? 'positive' : 'negative'}`;
        }
    }
    
    // RSI display güncellemesi
    updateRSIDisplay(rsiValue) {
        const rsiElement = document.getElementById('rsiValue');
        if (rsiElement) {
            rsiElement.textContent = `RSI: ${rsiValue.toFixed(2)}`;
        }
    }
    
    // Tam ekran modu
    toggleFullscreen() {
        const chartContainer = document.getElementById('tradingChart');
        if (!document.fullscreenElement) {
            chartContainer.requestFullscreen().catch(err => {
                console.log('Fullscreen error:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    // Canvas ile candlestick çizimi
    drawChart() {
        // Ana canvas'ı temizle
        this.ctx.clearRect(0, 0, this.chartWidth, this.chartHeight);
        
        if (this.candleData.length === 0) {
            this.drawNoDataMessage();
            return;
        }
        
        // Fiyat aralığını hesapla
        this.updatePriceRange();
        
        // Grid çizgileri
        this.drawGrid();
        
        // Candlestick'leri çiz
        this.drawCandlesticks();
        
        // Fiyat etiketleri
        this.drawPriceLabels();
        
        // RSI çiz
        this.drawRSI();
        
        // Buy/Sell Signals
        this.drawBuySellSignals();
        
        // Watermark
        this.drawWatermark();
    }
    
    drawNoDataMessage() {
        this.ctx.fillStyle = '#666';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Veri yükleniyor...', this.chartWidth / 2, this.chartHeight / 2);
    }
    
    drawLoadingMessage() {
        // Ana canvas'a loading mesajı
        this.ctx.fillStyle = '#4a5568';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('📈 Candlestick Verisi Yükleniyor...', this.canvas.width / 2, this.canvas.height / 2 - 20);
        
        this.ctx.fillStyle = '#718096';
        this.ctx.font = '14px Arial';
        this.ctx.fillText('Binance API\'den geçmiş veriler alınıyor', this.canvas.width / 2, this.canvas.height / 2 + 10);
        
        // RSI canvas'a da loading mesajı
        this.rsiCtx.fillStyle = '#4a5568';
        this.rsiCtx.font = '14px Arial';
        this.rsiCtx.textAlign = 'center';
        this.rsiCtx.fillText('📉 RSI Hesaplanıyor...', this.rsiCanvas.width / 2, this.rsiCanvas.height / 2);
    }
    
    updatePriceRange() {
        if (this.candleData.length === 0) return;
        
        const visibleCandles = this.candleData.slice(-this.maxCandles);
        const prices = [];
        const volumes = [];
        
        visibleCandles.forEach(candle => {
            prices.push(candle.high, candle.low);
            volumes.push(candle.volume);
        });
        
        this.minPrice = Math.min(...prices);
        this.maxPrice = Math.max(...prices);
        this.maxVolume = Math.max(...volumes);
        
        // Padding ekle (5%)
        const padding = (this.maxPrice - this.minPrice) * 0.05;
    }
    
    // Timeframe dropdown
    const timeframeDropdown = document.getElementById('chartTimeframe');
    if (timeframeDropdown) {
        timeframeDropdown.addEventListener('change', (e) => {
            this.currentTimeframe = e.target.value;
            console.log(`⏰ Zaman dilimi değiştirildi: ${this.currentTimeframe}`);
            this.reloadChart();
        });
    }
    
    // Fullscreen button
    const fullscreenBtn = document.getElementById('chartFullscreen');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            this.toggleFullscreen();
        });
    }
    
    console.log('📱 Dropdown events bağlandı!');
}

// Chart'ı yeniden yükle
reloadChart() {
    // WebSocket'i durdur
    if (this.websocket) {
        this.websocket.close();
    }
    
    // Veriyi temizle
    this.candleData = [];
    
    // Yeni veriyi yükle
    this.loadHistoricalData();
    this.startWebSocket();
}

// Fiyat bilgilerini güncelle
updatePriceInfo(price, changePercent = null) {
    const priceElement = document.getElementById('currentPrice');
    const changeElement = document.getElementById('priceChange');
    
    if (priceElement) {
        priceElement.textContent = `$${price.toFixed(4)}`;
    }
    
    if (changeElement && changePercent !== null) {
        const isPositive = changePercent >= 0;
        changeElement.textContent = `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%`;
        changeElement.className = `price-change ${isPositive ? 'positive' : 'negative'}`;
    }
}

// RSI display güncellemesi
updateRSIDisplay(rsiValue) {
    const rsiElement = document.getElementById('rsiValue');
    if (rsiElement) {
        rsiElement.textContent = `RSI: ${rsiValue.toFixed(2)}`;
    }
}

// Tam ekran modu
toggleFullscreen() {
    const chartContainer = document.getElementById('tradingChart');
    if (!document.fullscreenElement) {
        chartContainer.requestFullscreen().catch(err => {
            console.log('Fullscreen error:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// Canvas ile candlestick çizimi
drawChart() {
    // Ana canvas'ı temizle
    this.ctx.clearRect(0, 0, this.chartWidth, this.chartHeight);
    
    if (this.candleData.length === 0) {
        this.drawNoDataMessage();
        return;
    }
    
    // Fiyat aralığını hesapla
    this.updatePriceRange();
    
    // Grid çizgileri
    this.drawGrid();
    
    // Candlestick'leri çiz
    this.drawCandlesticks();
    
    // Fiyat etiketleri
    this.drawPriceLabels();
    
    // RSI çiz
    this.drawRSI();
    
    // Buy/Sell Signals
    this.drawBuySellSignals();
    
    // Watermark
    this.drawWatermark();
}

drawNoDataMessage() {
    this.ctx.fillStyle = '#666';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Veri yükleniyor...', this.chartWidth / 2, this.chartHeight / 2);
}

drawLoadingMessage() {
    // Ana canvas'a loading mesajı
    this.ctx.fillStyle = '#4a5568';
    this.ctx.font = 'bold 18px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('📈 Candlestick Verisi Yükleniyor...', this.canvas.width / 2, this.canvas.height / 2 - 20);
    
    this.ctx.fillStyle = '#718096';
    this.ctx.font = '14px Arial';
    this.ctx.fillText('Binance API\'den geçmiş veriler alınıyor', this.canvas.width / 2, this.canvas.height / 2 + 10);
    
    // RSI canvas'a da loading mesajı
    this.rsiCtx.fillStyle = '#4a5568';
    this.rsiCtx.font = '14px Arial';
    this.rsiCtx.textAlign = 'center';
    this.rsiCtx.fillText('📉 RSI Hesaplanıyor...', this.rsiCanvas.width / 2, this.rsiCanvas.height / 2);
}

updatePriceRange() {
    if (this.candleData.length === 0) return;
    
    const visibleCandles = this.candleData.slice(-this.maxCandles);
    const prices = [];
    const volumes = [];
    
    visibleCandles.forEach(candle => {
        prices.push(candle.high, candle.low);
        volumes.push(candle.volume);
    });
    
    this.minPrice = Math.min(...prices);
    this.maxPrice = Math.max(...prices);
    this.maxVolume = Math.max(...volumes);
    
    // Padding ekle (5%)
    const padding = (this.maxPrice - this.minPrice) * 0.05;
    this.minPrice -= padding;
    this.maxPrice += padding;
}

drawGrid() {
    // TradingView tarzı subtle grid
    this.ctx.strokeStyle = 'rgba(42, 46, 57, 0.6)';
    this.ctx.lineWidth = 0.3;
    this.ctx.setLineDash([2, 4]); // Kesikli çizgiler
    
    // Yatay çizgiler (fiyat seviyeleri)
    const priceSteps = 8;
    for (let i = 1; i < priceSteps; i++) {
        const y = (this.chartHeight / priceSteps) * i;
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.chartWidth, y);
        this.ctx.stroke();
    }
    
    // Dikey çizgiler (zaman)
    if (this.candleData.length > 0) {
        const candleCount = Math.min(this.candleData.length, this.maxCandles);
        const timeSteps = Math.max(5, Math.floor(candleCount / 10));
        
        for (let i = 0; i < candleCount; i += timeSteps) {
            const x = i * (this.candleWidth + this.candlePadding) + this.offsetX;
            if (x > 0 && x < this.chartWidth) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.chartHeight);
                this.ctx.stroke();
            }
        }
    }
    
    this.ctx.setLineDash([]); // Kesikli çizgiyi sıfırla
    
    // Ana fiyat çizgisi (mevcut fiyat)
    if (this.lastPrice > 0 && this.candleData.length > 0) {
        const currentPriceY = this.priceToY(this.lastPrice);
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, currentPriceY);
        this.ctx.lineTo(this.chartWidth, currentPriceY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Fiyat etiketi
        this.ctx.fillStyle = '#FFD700';
        this.ctx.fillRect(this.chartWidth - 80, currentPriceY - 10, 75, 20);
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 11px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.lastPrice.toFixed(4), this.chartWidth - 42, currentPriceY + 4);
    }
}

drawCandlesticks() {
    const visibleCandles = this.candleData.slice(-this.maxCandles);
    const candleCount = visibleCandles.length;
    const totalWidth = candleCount * (this.candleWidth + this.candlePadding) * this.scale;
    const startX = Math.max(0, this.chartWidth - totalWidth) + this.offsetX;
        
        visibleCandles.forEach((candle, index) => {
            const x = startX + index * (this.candleWidth + this.candlePadding) * this.scale;
            
            // Sadece ekranda görünen mumları çiz
            if (x + this.candleWidth > 0 && x < this.chartWidth) {
                this.drawCandle(candle, x);
            }
        });
    }
    
    drawCandle(candle, x) {
        // Fiyatları Y koordinatlarına çevir
        const openY = this.priceToY(candle.open);
        const closeY = this.priceToY(candle.close);
        const highY = this.priceToY(candle.high);
        const lowY = this.priceToY(candle.low);
        
        // TradingView tarzı renk belirleme
        const isGreen = candle.close > candle.open;
        const wickColor = isGreen ? '#26a69a' : '#ef5350';
        const bodyColor = isGreen ? '#26a69a' : '#ef5350';
        const borderColor = isGreen ? '#00695c' : '#c62828';
        
        // Wick kalalığı (daha ince fitil)
        const wickWidth = Math.max(1, this.candleWidth * 0.1);
        const wickX = x + (this.candleWidth / 2) - (wickWidth / 2);
        
        // Yüksek-Düşük Fitil Çizgisi (Wick)
        this.ctx.fillStyle = wickColor;
        this.ctx.fillRect(wickX, highY, wickWidth, lowY - highY);
        
        // Mum gövdesi boyutları
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.abs(closeY - openY);
        const minBodyHeight = 2; // Minimum mum yüksekliği
        
        if (bodyHeight < minBodyHeight) {
            // Doji/Hammer durumu - ince çizgi
            const dojiY = (openY + closeY) / 2;
            this.ctx.fillStyle = wickColor;
            this.ctx.fillRect(x, dojiY - 1, this.candleWidth, 2);
            
            // Doji kenar çizgisi
            this.ctx.strokeStyle = borderColor;
            this.ctx.lineWidth = 0.5;
            this.ctx.strokeRect(x, dojiY - 1, this.candleWidth, 2);
        } else {
            // Normal mum gövdesi
            this.ctx.fillStyle = bodyColor;
            this.ctx.fillRect(x + 1, bodyTop, this.candleWidth - 2, bodyHeight);
            
            // Mum kenar çizgisi (daha professional)
            this.ctx.strokeStyle = borderColor;
            this.ctx.lineWidth = 0.8;
            this.ctx.strokeRect(x + 1, bodyTop, this.candleWidth - 2, bodyHeight);
            
            // İç gölge efekti (depth)
            if (isGreen) {
                this.ctx.fillStyle = 'rgba(38, 166, 154, 0.3)';
                this.ctx.fillRect(x + 1, bodyTop, (this.candleWidth - 2) * 0.3, bodyHeight);
            } else {
                this.ctx.fillStyle = 'rgba(239, 83, 80, 0.3)';
                this.ctx.fillRect(x + 1, bodyTop, (this.candleWidth - 2) * 0.3, bodyHeight);
            }
        }
        
        // Volume bar (altta ince)
        if (candle.volume > 0) {
            const maxVolume = Math.max(...this.candleData.map(c => c.volume));
            const volumeHeight = (candle.volume / maxVolume) * 30;
            const volumeY = this.chartHeight - volumeHeight;
            
            this.ctx.fillStyle = isGreen ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)';
            this.ctx.fillRect(x, volumeY, this.candleWidth, volumeHeight);
        }
    }
    
    priceToY(price) {
        return this.chartHeight - ((price - this.minPrice) / (this.maxPrice - this.minPrice)) * this.chartHeight;
    }
    
    drawPriceLabels() {
        this.ctx.fillStyle = '#D9D9D9';
        this.ctx.font = '11px Roboto';
        this.ctx.textAlign = 'left';
        
        // Sağ tarafta fiyat etiketleri
        for (let i = 0; i <= 10; i++) {
            const price = this.minPrice + (this.maxPrice - this.minPrice) * (i / 10);
            const y = this.chartHeight - (this.chartHeight / 10) * i;
            this.ctx.fillText(price.toFixed(6), this.chartWidth - 80, y + 4);
        }
        
        // Son fiyat çizgisi (yeşil kesikli)
        if (this.candleData.length > 0) {
            const lastPrice = this.candleData[this.candleData.length - 1].close;
            const y = this.chartHeight - ((lastPrice - this.minPrice) / (this.maxPrice - this.minPrice)) * this.chartHeight;
            
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeStyle = '#00ff88';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.chartWidth, y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        // Volume barları (çok basit, alt kısımda)
        const visibleCandles = this.candleData.slice(-this.maxCandles);
        const candleCount = visibleCandles.length;
        const totalWidth = candleCount * (this.candleWidth + this.candlePadding);
        const startX = Math.max(0, this.chartWidth - totalWidth);
        this.drawVolumeHistory(visibleCandles, startX);
        
        // Sinyal oklarını çiz
        this.drawSignalArrows(visibleCandles, startX);
    }
    
    drawVolumeHistory(candles, startX) {
        candles.forEach((candle, index) => {
            const x = startX + index * (this.candleWidth + this.candlePadding);
            const volumeHeight = (candle.volume / this.maxVolume) * 20;
            this.ctx.fillStyle = candle.close > candle.open ? '#00FF88' : '#FF3366';
            this.ctx.fillRect(x, this.chartHeight - volumeHeight, this.candleWidth, volumeHeight);
        });
    }
    
    drawSignalArrows(candles, startX) {
        candles.forEach((candle, index) => {
            const x = startX + index * (this.candleWidth + this.candlePadding);
            if (candle.signal === 'buy') {
                this.ctx.fillStyle = '#00FF88';
                this.ctx.beginPath();
                this.ctx.moveTo(x + this.candleWidth / 2, this.chartHeight - 10);
                this.ctx.lineTo(x + this.candleWidth / 2, this.chartHeight - 20);
                this.ctx.lineTo(x + this.candleWidth / 2 + 5, this.chartHeight - 15);
                this.ctx.fill();
            } else if (candle.signal === 'sell') {
                this.ctx.fillStyle = '#FF3366';
                this.ctx.beginPath();
                this.ctx.moveTo(x + this.candleWidth / 2, this.chartHeight - 20);
                this.ctx.lineTo(x + this.candleWidth / 2, this.chartHeight - 10);
                this.ctx.lineTo(x + this.candleWidth / 2 + 5, this.chartHeight - 15);
                this.ctx.fill();
            }
        });
    }
    
    drawRSI() {
        // RSI canvas'ını temizle
        this.rsiCtx.clearRect(0, 0, this.chartWidth, 100);
        
        if (this.rsiData.length === 0) return;
        
        // RSI çizgisi
        this.rsiCtx.strokeStyle = '#FFD700';
        this.rsiCtx.lineWidth = 2;
        this.rsiCtx.beginPath();
        
        const visibleRSI = this.rsiData.slice(-this.maxCandles);
        const candleCount = visibleRSI.length;
        const totalWidth = candleCount * (this.candleWidth + this.candlePadding);
        const startX = Math.max(0, this.chartWidth - totalWidth);
        
        visibleRSI.forEach((rsi, index) => {
            const x = startX + index * (this.candleWidth + this.candlePadding) + this.candleWidth / 2;
            const y = 100 - (rsi / 100) * 100;
            
            if (index === 0) {
                this.rsiCtx.moveTo(x, y);
            } else {
                this.rsiCtx.lineTo(x, y);
            }
        });
        
        this.rsiCtx.stroke();
        
        // RSI seviye çizgileri (30, 50, 70)
        this.rsiCtx.strokeStyle = '#666';
        this.rsiCtx.lineWidth = 1;
        this.rsiCtx.setLineDash([3, 3]);
        
        [30, 50, 70].forEach(level => {
            const y = 100 - (level / 100) * 100;
            this.rsiCtx.beginPath();
            this.rsiCtx.moveTo(0, y);
            this.rsiCtx.lineTo(this.chartWidth, y);
            this.rsiCtx.stroke();
        });
        
        this.rsiCtx.setLineDash([]);
    }
    
    // Buy/Sell Signal Oklarını Çiz
    drawBuySellSignals() {
        if (!this.signals || this.signals.length === 0) return;
        
        this.signals.forEach(signal => {
            const candle = this.candleData[signal.index];
            if (!candle) return;
            
            const x = (signal.index * this.candleWidth) + this.offsetX;
            if (x < -this.candleWidth || x > this.chartWidth + this.candleWidth) return;
            
            // Normalize edilmiş fiyat pozisyonu
            const normalizedPrice = (signal.price - this.minPrice) / (this.maxPrice - this.minPrice);
            const y = this.chartHeight - (normalizedPrice * this.chartHeight) + 40;
            
            // Signal tipi kontrolü
            if (signal.type === 'BUY') {
                this.drawBuyArrow(x, y);
            } else if (signal.type === 'SELL') {
                this.drawSellArrow(x, y);
            }
        });
    }
    
    // BUY Ok Çizimi
    drawBuyArrow(x, y) {
        this.ctx.save();
        
        // Ok gövdesi
        this.ctx.fillStyle = '#00ff88';
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + 30);
        this.ctx.lineTo(x - 8, y + 15);
        this.ctx.lineTo(x - 4, y + 15);
        this.ctx.lineTo(x - 4, y);
        this.ctx.lineTo(x + 4, y);
        this.ctx.lineTo(x + 4, y + 15);
        this.ctx.lineTo(x + 8, y + 15);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Kenar çizgisi
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        // "BUY" yazısı
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('BUY', x, y + 45);
        
        this.ctx.restore();
    }
    
    // SELL Ok Çizimi
    drawSellArrow(x, y) {
        this.ctx.save();
        
        // Ok gövdesi
        this.ctx.fillStyle = '#ff4757';
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - 30);
        this.ctx.lineTo(x - 8, y - 15);
        this.ctx.lineTo(x - 4, y - 15);
        this.ctx.lineTo(x - 4, y);
        this.ctx.lineTo(x + 4, y);
        this.ctx.lineTo(x + 4, y - 15);
        this.ctx.lineTo(x + 8, y - 15);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Kenar çizgisi
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        // "SELL" yazısı
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SELL', x, y - 35);
        
        this.ctx.restore();
    }
    
    drawWatermark() {
        this.ctx.fillStyle = 'rgba(0, 255, 136, 0.1)';
        this.ctx.font = '48px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('FinyX Pro', this.chartWidth / 2, this.chartHeight / 2);
    }
    
    startAnimation() {
        const animate = () => {
            this.drawChart();
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }
    
    resizeChart() {
        const chartContainer = document.getElementById('tradingChart');
        this.chartWidth = chartContainer.offsetWidth;
        this.chartHeight = chartContainer.offsetHeight - 100;
        
        if (this.canvas) {
            this.canvas.width = this.chartWidth;
            this.canvas.height = this.chartHeight;
        }
        
        if (this.rsiCanvas) {
            this.rsiCanvas.width = this.chartWidth;
            this.rsiCanvas.height = 100;
        }
    }
    
    // Mouse etkileşimi metodları
    bindMouseEvents() {
        if (!this.canvas) return;
        
        // Mouse down - sürükleme başlat
        this.canvas.addEventListener('mousedown', (e) => {
            this.isMouseDown = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.canvas.style.cursor = 'grabbing';
        });
        
        // Mouse move - sürükleme
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isMouseDown) {
                const deltaX = e.clientX - this.lastMouseX;
                this.offsetX += deltaX;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            } else {
                this.canvas.style.cursor = 'grab';
            }
        });
        
        // Mouse up - sürükleme bitir
        this.canvas.addEventListener('mouseup', () => {
            this.isMouseDown = false;
            this.canvas.style.cursor = 'grab';
        });
        
        // Mouse leave - sürükleme iptal
        this.canvas.addEventListener('mouseleave', () => {
            this.isMouseDown = false;
            this.canvas.style.cursor = 'default';
        });
        
        // Mouse wheel - zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * delta));
            
            if (newScale !== this.scale) {
                // Zoom noktasını koruyarak zoom yap
                const scaleChange = newScale / this.scale;
                this.offsetX = mouseX - (mouseX - this.offsetX) * scaleChange;
                this.scale = newScale;
                
                // Candle genişliğini zoom'a göre ayarla
                this.candleWidth = Math.max(4, Math.min(20, 8 * this.scale));
                this.candlePadding = Math.max(1, Math.min(5, 2 * this.scale));
            }
        });
        
        // Touch events (mobil destek)
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                this.isMouseDown = true;
                this.lastMouseX = touch.clientX;
                this.lastMouseY = touch.clientY;
            }
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1 && this.isMouseDown) {
                const touch = e.touches[0];
                const deltaX = touch.clientX - this.lastMouseX;
                this.offsetX += deltaX;
                this.lastMouseX = touch.clientX;
                this.lastMouseY = touch.clientY;
            }
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.isMouseDown = false;
        });
    }
    
    bindEvents() {
        // Sembol değişikliği
        document.getElementById('chartSymbol').addEventListener('change', (e) => {
            this.currentSymbol = e.target.value;
            this.restartChart();
        });
        
        // Timeframe değişikliği  
        document.getElementById('chartTimeframe').addEventListener('change', (e) => {
            this.currentTimeframe = e.target.value;
            this.restartChart();
        });
        
        // Tam ekran
        document.getElementById('chartFullscreen').addEventListener('click', () => {
            this.toggleFullscreen();
        });
    }
    
    async loadHistoricalData() {
        try {
            // Binance API'den geçmiş veriler
            const interval = this.timeframeToInterval(this.currentTimeframe);
            const response = await fetch(
                `https://api.binance.com/api/v3/klines?symbol=${this.currentSymbol}&interval=${interval}&limit=100`
            );
            const data = await response.json();
            
            // Candlestick formatına çevir
            this.candleData = data.map(candle => ({
                time: Math.floor(candle[0] / 1000),
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));
            
            // Canvas chart verileri hazır
            
            // İndikatörleri hesapla
            this.calculateIndicators();
            
            // Fiyat bilgisini güncelle
            if (this.candleData.length > 0) {
                const lastCandle = this.candleData[this.candleData.length - 1];
                this.updatePriceInfo(lastCandle.close);
                this.lastPrice = lastCandle.close;
            }
            
        } catch (error) {
            console.error('Geçmiş veri yükleme hatası:', error);
        }
    }
    
    startWebSocket() {
        if (this.websocket) {
            this.websocket.close();
        }
        
        const interval = this.timeframeToInterval(this.currentTimeframe);
        const symbol = this.currentSymbol.toLowerCase();
        
        // Multi-stream WebSocket URL (doğru format)
        const streams = [
            `${symbol}@kline_${interval}`,
            `${symbol}@ticker`
        ];
        const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
        
        console.log('🔗 WebSocket URL:', wsUrl);
        this.websocket = new WebSocket(wsUrl);
        
        this.websocket.onopen = () => {
            console.log('📊 Chart WebSocket bağlantısı açıldı:', this.currentSymbol);
        };
        
        this.websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            // Multi-stream format kontrolü
            if (data.stream && data.data) {
                const streamName = data.stream;
                const streamData = data.data;
                
                if (streamName.includes('@kline_')) {
                    this.handleKlineData(streamData.k);
                } else if (streamName.includes('@ticker')) {
                    this.handleTickerData(streamData);
                }
            } else if (data.k) {
                // Tek stream format (fallback)
                this.handleKlineData(data.k);
            }
        };
        
        this.websocket.onerror = (error) => {
            console.error('Chart WebSocket hatası:', error);
        };
        
        this.websocket.onclose = () => {
            console.log('Chart WebSocket bağlantısı kapandı');
            // 5 saniye sonra yeniden bağlan
            setTimeout(() => {
                if (!this.websocket || this.websocket.readyState === WebSocket.CLOSED) {
                    this.startWebSocket();
                }
            }, 5000);
        };
    }
    
    handleKlineData(kline) {
        const candle = {
            time: Math.floor(kline.t / 1000),
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v)
        };
        
        // Mevcut mumu güncelle veya yeni mum ekle
        if (kline.x) { // Kapalı mum
            if (this.candleData.length > 0) {
                this.candleData[this.candleData.length - 1] = candle;
            } else {
                this.candleData.push(candle);
            }
        } else { // Açık mum
            if (this.candleData.length > 0 && 
                this.candleData[this.candleData.length - 1].time === candle.time) {
                // Mevcut mumu güncelle
                this.candleData[this.candleData.length - 1] = candle;
            } else {
                // Yeni mum ekle
                this.candleData.push(candle);
            }
        }
        
        // Fiyat bilgilerini güncelle
        this.updatePriceInfo(candle.close);
        
        // İndikatörleri yeniden hesapla
        this.updateIndicators();
        
        // Buy/Sell sinyallerini kontrol et
        this.calculateBuySellSignals();
        
        // Son 200 mumu tut
        if (this.candleData.length > 200) {
            this.candleData = this.candleData.slice(-200);
        }
    }
    
    // Ticker verilerini işle (gerçek zamanlı fiyat)
    handleTickerData(ticker) {
        const currentPrice = parseFloat(ticker.c);
        const priceChange = parseFloat(ticker.P);
        
        // Fiyat bilgilerini hemen güncelle
        this.updatePriceInfo(currentPrice, priceChange);
        this.lastPrice = currentPrice;
        
        // Son candle'ı güncelle (tick-by-tick animation)
        if (this.candleData.length > 0) {
            const lastCandle = this.candleData[this.candleData.length - 1];
            lastCandle.close = currentPrice;
            
            // Yüksek/düşük kontrol
            if (currentPrice > lastCandle.high) {
                lastCandle.high = currentPrice;
            }
            if (currentPrice < lastCandle.low) {
                lastCandle.low = currentPrice;
            }
        }
    }
    
    // Pine Script Buy/Sell Signal Logic (Tesla 3-6-9 + Fibonacci)
    calculateBuySellSignals() {
        if (this.candleData.length < 50) return; // Yeterli veri yok
        
        const len = this.candleData.length;
        const closes = this.candleData.map(c => c.close);
        const highs = this.candleData.map(c => c.high);
        const lows = this.candleData.map(c => c.low);
        
        // Tesla 3-6-9 Harmonic Pattern
        const ema3 = this.calculateEMA(this.candleData, 3);
        const ema6 = this.calculateEMA(this.candleData, 6);
        const ema9 = this.calculateEMA(this.candleData, 9);
        const ema21 = this.calculateEMA(this.candleData, 21);
        
        if (ema3.length < 3 || ema6.length < 3 || ema9.length < 3) return;
        
        const currentIdx = len - 1;
        const prevIdx = len - 2;
        
        // RSI değerleri
        const rsiValues = this.calculateRSI(this.candleData, 14);
        if (rsiValues.length < 2) return;
        
        const currentRSI = rsiValues[rsiValues.length - 1];
        const prevRSI = rsiValues[rsiValues.length - 2];
        
        // Fibonacci Retracement Levels
        const fibLevels = this.calculateFibonacci(this.candleData);
        
        // BUY Signal Logic (Pine Script mantığı)
        const buyCondition1 = ema3[ema3.length - 1] > ema6[ema6.length - 1]; // 3 > 6
        const buyCondition2 = ema6[ema6.length - 1] > ema9[ema9.length - 1]; // 6 > 9
        const buyCondition3 = ema9[ema9.length - 1] > ema21[ema21.length - 1]; // 9 > 21
        const buyCondition4 = currentRSI > 30 && currentRSI < 70; // RSI optimal
        const buyCondition5 = closes[currentIdx] > closes[prevIdx]; // Fiyat yükselişte
        const buyCondition6 = closes[currentIdx] > fibLevels.level618; // Fib üzerinde
        
        const buySignal = buyCondition1 && buyCondition2 && buyCondition3 && 
                         buyCondition4 && buyCondition5 && buyCondition6;
        
        // SELL Signal Logic (Pine Script mantığı)
        const sellCondition1 = ema3[ema3.length - 1] < ema6[ema6.length - 1]; // 3 < 6
        const sellCondition2 = ema6[ema6.length - 1] < ema9[ema9.length - 1]; // 6 < 9
        const sellCondition3 = ema9[ema9.length - 1] < ema21[ema21.length - 1]; // 9 < 21
        const sellCondition4 = currentRSI > 70 || currentRSI < 30; // RSI aşırı
        const sellCondition5 = closes[currentIdx] < closes[prevIdx]; // Fiyat düşüşte
        const sellCondition6 = closes[currentIdx] < fibLevels.level382; // Fib altında
        
        const sellSignal = sellCondition1 && sellCondition2 && sellCondition3 && 
                          sellCondition4 && sellCondition5 && sellCondition6;
        
        // Signal'ları kaydet
        if (buySignal) {
            this.signals.push({
                type: 'BUY',
                time: this.candleData[currentIdx].time,
                price: this.candleData[currentIdx].close,
                index: currentIdx
            });
            console.log('🟢 BUY SIGNAL:', this.candleData[currentIdx].close);
        }
        
        if (sellSignal) {
            this.signals.push({
                type: 'SELL',
                time: this.candleData[currentIdx].time,
                price: this.candleData[currentIdx].close,
                index: currentIdx
            });
            console.log('🔴 SELL SIGNAL:', this.candleData[currentIdx].close);
        }
        
        // Son 50 sinyali tut
        if (this.signals.length > 50) {
            this.signals = this.signals.slice(-50);
        }
    }
    
    // Fibonacci Retracement Levels
    calculateFibonacci(data) {
        if (data.length < 20) return { level382: 0, level618: 0 };
        
        const recent = data.slice(-20);
        const high = Math.max(...recent.map(c => c.high));
        const low = Math.min(...recent.map(c => c.low));
        const range = high - low;
        
        return {
            level382: high - (range * 0.382),
            level618: high - (range * 0.618),
            level786: high - (range * 0.786)
        };
    }
    
    // Pine Script indikatörlerini JavaScript'e çevir
    calculateIndicators() {
        if (this.candleData.length < 14) return;
        
        // RSI Hesaplama (Pine Script'teki rsi() fonksiyonu)
        this.rsiData = this.calculateRSI(this.candleData, 14);
        
        // EMA Hesaplama (Pine Script'teki ema() fonksiyonu)
        this.emaData = this.calculateEMA(this.candleData, 21);
        
        // Canvas RSI verileri hazır
    }
    
    updateIndicators() {
        if (this.candleData.length < 14) return;
        
        // Tüm RSI verilerini yeniden hesapla
        this.rsiData = this.calculateRSI(this.candleData, 14);
        
        // Son RSI değerini UI'da göster
        if (this.rsiData.length > 0) {
            const rsiValue = this.rsiData[this.rsiData.length - 1];
            this.updateRSIDisplay(rsiValue);
        }
    }
    
    // Pine Script RSI fonksiyonu JavaScript versiyonu
    calculateRSI(data, period = 14) {
        if (data.length < period + 1) return [];
        
        const rsiValues = [];
        
        for (let i = period; i < data.length; i++) {
            let gains = 0;
            let losses = 0;
            
            // Son 14 periyot için kazanç/kayıp hesapla
            for (let j = i - period + 1; j <= i; j++) {
                const change = data[j].close - data[j - 1].close;
                if (change > 0) {
                    gains += change;
                } else {
                    losses += Math.abs(change);
                }
            }
            
            const avgGain = gains / period;
            const avgLoss = losses / period;
            
            if (avgLoss === 0) {
                rsiValues.push(100);
            } else {
                const rs = avgGain / avgLoss;
                const rsi = 100 - (100 / (1 + rs));
                rsiValues.push(rsi);
            }
        }
        
        return rsiValues;
    }
    
    // Pine Script EMA fonksiyonu JavaScript versiyonu
    calculateEMA(data, period) {
        if (data.length < period) return [];
        
        const emaValues = [];
        const multiplier = 2 / (period + 1);
        
        // İlk EMA değeri SMA ile başla
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i].close;
        }
        emaValues.push(sum / period);
        
        // Sonraki EMA değerlerini hesapla
        for (let i = period; i < data.length; i++) {
            const ema = (data[i].close - emaValues[emaValues.length - 1]) * multiplier + emaValues[emaValues.length - 1];
            emaValues.push(ema);
        }
        
        return emaValues;
    }
    
    updatePriceInfo(currentPrice) {
        const priceElement = document.getElementById('currentPrice');
        const changeElement = document.getElementById('priceChange');
        
        if (priceElement) {
            priceElement.textContent = `$${currentPrice.toFixed(6)}`;
        }
        
        if (changeElement && this.lastPrice > 0) {
            const change = currentPrice - this.lastPrice;
            const changePercent = (change / this.lastPrice) * 100;
            
            changeElement.textContent = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
            changeElement.className = `price-change ${changePercent >= 0 ? 'positive' : 'negative'}`;
        }
    }
    
    updateRSIDisplay(rsiValue) {
        const rsiElement = document.getElementById('rsiValue');
        if (rsiElement) {
            rsiElement.textContent = `RSI: ${rsiValue.toFixed(1)}`;
            
            // RSI renk kodlaması
            if (rsiValue >= 70) {
                rsiElement.className = 'rsi-value overbought';
            } else if (rsiValue <= 30) {
                rsiElement.className = 'rsi-value oversold';
            } else {
                rsiElement.className = 'rsi-value';
            }
        }
    }
    
    timeframeToInterval(timeframe) {
        const mapping = {
            '1m': '1m',
            '5m': '5m', 
            '15m': '15m',
            '1h': '1h',
            '4h': '4h'
        };
        return mapping[timeframe] || '5m';
    }
    
    restartChart() {
        // WebSocket'i kapat
        if (this.websocket) {
            this.websocket.close();
        }
        
        // Veriyi temizle
        this.candleData = [];
        
        // Yeni veriyi yükle
        this.loadHistoricalData();
        this.startWebSocket();
    }
    
    // Binance'den geçmiş veri yükle 
    async loadHistoricalData() {
        try {
            const symbol = this.currentSymbol;
            const interval = this.timeframeToInterval(this.currentTimeframe);
            const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`;
            
            console.log(`📈 ${symbol} için geçmiş veri yükleniyor...`);
            
            const response = await fetch(url);
            const data = await response.json();
            
            this.candleData = data.map(candle => ({
                time: candle[0],
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));
            
            // İndikatörleri hesapla
            this.calculateIndicators();
            
            console.log(`✅ ${this.candleData.length} mum verisi yüklendi!`);
            
        } catch (error) {
            console.error('❌ Veri yükleme hatası:', error);
        }
    }
    
    // Binance WebSocket başlat - Hem Kline hem Ticker
    startWebSocket() {
        try {
            const symbol = this.currentSymbol.toLowerCase();
            const interval = this.timeframeToInterval(this.currentTimeframe);
            
            // Çoklu stream - hem kline hem ticker
            const streams = [
                `${symbol}@kline_${interval}`,  // Mum verileri
                `${symbol}@ticker`              // Anlık fiyat değişimleri
            ];
            
            const wsUrl = `wss://stream.binance.com:9443/ws/${streams.join('/')}`;
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                console.log('✅ Binance WebSocket bağlantısı aÇıldı!');
            };
            
            this.websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.k) {
                    const kline = data.k;
                    const newCandle = {
                        time: kline.t,
                        open: parseFloat(kline.o),
                        high: parseFloat(kline.h),
                        low: parseFloat(kline.l),
                        close: parseFloat(kline.c),
                        volume: parseFloat(kline.v)
                    };
                    
                    if (kline.x) { // Kapanmış mum
                        this.candleData.push(newCandle);
                        if (this.candleData.length > 200) {
                            this.candleData.shift();
                        }
                    } else { // Açık mum - son mumu güncelle
                        if (this.candleData.length > 0) {
                            this.candleData[this.candleData.length - 1] = newCandle;
                        }
                    }
                    
                    // İndikatörleri güncelle
                    this.updateIndicators();
                    
                    // Fiyat bilgisini güncelle
                    this.updatePriceInfo(newCandle.close);
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('❌ WebSocket hata:', error);
            };
            
            this.websocket.onclose = () => {
                console.log('⚠️ WebSocket bağlantısı kapandı. Yeniden deneniyor...');
                setTimeout(() => this.startWebSocket(), 3000);
            };
            
        } catch (error) {
            console.error('❌ WebSocket başlatma hatası:', error);
        }
    }
    
    toggleFullscreen() {
        const chartSection = document.querySelector('.chart-section');
        chartSection.classList.toggle('fullscreen');
        
        // Canvas boyutunu yeniden ayarla
        setTimeout(() => {
            this.resizeChart();
        }, 100);
    }
    
    // Ana animasyon döngüsü
    animate() {
        // Canvas'ı temizle
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.rsiCtx.clearRect(0, 0, this.rsiCanvas.width, this.rsiCanvas.height);
        
        // Chart bileşenlerini çiz
        if (this.candleData.length > 0) {
            this.updatePriceRange();
            this.drawGrid();
            this.drawCandlesticks();
            this.drawPriceLabels();
            this.drawRSI();
            this.drawWatermark();
        } else {
            this.drawLoadingMessage();
        }
        
        // Sonraki frame için planla
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    // Animasyonu başlat
    startAnimation() {
        if (!this.animationId) {
            this.animate();
        }
    }
    
    // Animasyonu durdur
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
}

// Canvas Chart'ı başlat
let tradingChart = null;

document.addEventListener('DOMContentLoaded', () => {
    try {
        // Chart container var mı kontrol et
        const chartContainer = document.getElementById('tradingChart');
        if (!chartContainer) {
            console.error('❌ Chart container bulunamadı!');
            return;
        }
        
        console.log('🎆 Canvas tabanlı chart sistemi başlatılıyor...');
        
        // Chart'ı başlat
        tradingChart = new TradingChart();
        
        // Animasyon döngüsünü başlat
        tradingChart.startAnimation();
        console.log('✅ Custom Candlestick Chart sistemi başlatıldı!');
        console.log('🎬 Canvas animasyon döngüsü aktif!');
        
    } catch (error) {
        console.error('❌ Chart başlatma hatası:', error);
        
        // Fallback: Chart container'a hata mesajı göster
        const chartContainer = document.getElementById('tradingChart');
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #ff6b6b; text-align: center;">
                    <div>
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                        <h3>Chart Yükleme Hatası</h3>
                        <p>Canvas grafik sistemi yüklenemedi. Konsolu kontrol edin.</p>
                        <button onclick="location.reload()" style="padding: 10px 20px; background: #00ff88; color: #000; border: none; border-radius: 5px; cursor: pointer;">Yenile</button>
                    </div>
                </div>
            `;
        }
    }
});
