// ============= FINYX SCANNERS INTEGRATION =============
// Android scanner'larını web uygulamasına entegre eden kod

class ScannerUI {
    constructor() {
        this.isScanning = false;
        this.scanProgress = 0;
        this.allSymbols = [];  // Dinamik olarak doldurulacak
        this.maxParallelRequests = 15; // Paralel istek sayısı
        this.initializeUI();
        this.fetchAllSymbols(); // Sembol listesini al
    }

    initializeUI() {
        // Scanner butonları
        document.getElementById('scanLQ').addEventListener('click', () => this.startScan('LQ'));
        document.getElementById('scanWhale').addEventListener('click', () => this.startScan('WHALE'));
        document.getElementById('scanV1').addEventListener('click', () => this.startScan('V1'));
        // NOT: 'scanAll' butonu artık HTML'de yok, kaldırıldı
        // document.getElementById('scanAll')?.addEventListener('click', () => this.startScan('ALL'));
        
        // Tarama tipi değiştiğinde coin seçim kontrolünü göster/gizle
        document.getElementById('scanType').addEventListener('change', function() {
            const singleCoinDiv = document.getElementById('singleCoinControl');
            if (this.value === 'single') {
                singleCoinDiv.style.display = 'flex';
            } else {
                singleCoinDiv.style.display = 'none';
            }
        });
        
        // Coin arama butonu
        document.getElementById('searchCoinBtn')?.addEventListener('click', () => {
            this.searchSingleCoin();
        });
        
        // Enter tuşu ile arama yapma
        document.getElementById('coinSymbolInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.searchSingleCoin();
            }
        });
        
        // Tarama hızı event listener'ı
        document.getElementById('scanSpeed')?.addEventListener('change', (e) => {
            this.maxParallelRequests = parseInt(e.target.value);
        });
    }
    
    // Manuel girilen coin için tarama fonksiyonu
    async searchSingleCoin() {
        const coinInput = document.getElementById('coinSymbolInput');
        if (!coinInput || !coinInput.value.trim()) {
            alert('Lütfen bir coin adı girin!');
            return;
        }
        
        // Coin adını formatı düzenle
        let symbol = coinInput.value.trim().toUpperCase();
        
        // USDT_PERP ekini kontrol et, yoksa ekle
        if (!symbol.endsWith('USDT_PERP')) {
            // Coin'den USDT içerenleri düzelt
            if (symbol.endsWith('USDT')) {
                symbol = symbol + '_PERP';
            } else {
                symbol = symbol + 'USDT_PERP';
            }
        }
        
        if (this.isScanning) {
            this.stopScan();
        }
        
        this.isScanning = true;
        this.updateScanButtons(true);
        this.clearResults();
        
        const statusElement = document.getElementById('scannerStatus');
        const progressElement = document.getElementById('progressFill');
        
        statusElement.textContent = `${symbol.replace('_PERP', '').replace('USDT', '')} taranıyor...`;
        progressElement.style.width = '50%';
        
        try {
            // Tüm scanner'ları çalıştır (LQ, Whale, V1)
            const candles = await this.getCandleData(symbol);
            if (!candles || candles.length === 0) {
                statusElement.textContent = `${symbol} için veri bulunamadı. Coin adını kontrol edin.`;
                progressElement.style.width = '100%';
                this.isScanning = false;
                this.updateScanButtons(false);
                return;
            }
            
            // Tüm scanner'ları aynı coin için çalıştır
            const results = await window.finyxScanners.scanSymbol(symbol, candles);
            
            // Herhangi bir sinyal bulundu mu kontrol et
            let signalFound = false;
            
            // Sonuçları tablolara ekle
            if (results.lq) {
                this.displayLQResults([results.lq]);
                signalFound = true;
            }
            if (results.whale) {
                this.displayWhaleResults([results.whale]);
                signalFound = true;
            }
            if (results.v1) {
                this.displayV1Results([results.v1]);
                signalFound = true;
            }
            
            if (signalFound) {
                statusElement.textContent = `${symbol.replace('_PERP', '').replace('USDT', '')} için sinyaller bulundu!`;
            } else {
                statusElement.textContent = `${symbol.replace('_PERP', '').replace('USDT', '')} için sinyal bulunamadı.`;
            }
            
        } catch (error) {
            console.error('Tarama sırasında hata:', error);
            statusElement.textContent = 'Tarama sırasında bir hata oluştu: ' + error.message;
        } finally {
            progressElement.style.width = '100%';
            this.isScanning = false;
            this.updateScanButtons(false);
        }
    }

    async startScan(scannerType) {
        if (this.isScanning) {
            this.stopScan();
            return;
        }

        this.isScanning = true;
        this.updateScanButtons(true);
        this.clearResults();
        
        const statusElement = document.getElementById('scannerStatus');
        const progressElement = document.getElementById('progressFill');
        
        // Seçilen zaman dilimini göster
        const timeframe = document.getElementById('scannerTimeframe').value;
        statusElement.textContent = `${scannerType} Scanner başlatılıyor... [${timeframe}]`;
        progressElement.style.width = '0%';

        try {
            let results = {};
            
            if (scannerType === 'ALL') {
                results = await this.scanAllSymbols();
            } else {
                results = await this.scanWithType(scannerType);
            }
            
            this.displayResults(results);
            const timeframe = document.getElementById('scannerTimeframe').value;
            statusElement.textContent = `Tarama tamamlandı [${timeframe}] - ${Object.keys(results).length} sinyal bulundu`;
            
        } catch (error) {
            console.error('Scanner hatası:', error);
            statusElement.textContent = 'Tarama sırasında hata oluştu';
        } finally {
            this.isScanning = false;
            this.updateScanButtons(false);
            progressElement.style.width = '100%';
        }
    }

    async scanAllSymbols() {
        const results = { lq: [], whale: [], v1: [] };
        const progressElement = document.getElementById('progressFill');
        const statusElement = document.getElementById('scannerStatus');
        
        // Tarama tipini kontrol et
        const scanType = document.getElementById('scanType')?.value || 'all';
        let symbolsToScan = [];
        
        if (scanType === 'single') {
            // Belirli coin seçilmiş
            const selectedCoin = document.getElementById('singleCoinSelect')?.value;
            if (selectedCoin) {
                symbolsToScan = [selectedCoin];
                statusElement.textContent = `${selectedCoin.replace('_PERP', '')} taranıyor...`;
            } else {
                statusElement.textContent = 'Lütfen bir coin seçin!';
                return { lq: [], whale: [], v1: [] };
            }
        } else {
            // Tüm coinler
            if (this.allSymbols.length === 0) {
                statusElement.textContent = 'Sembol listesi alınıyor...';
                await this.fetchAllSymbols();
            }
            symbolsToScan = this.allSymbols;
        }
        
        const totalSymbols = symbolsToScan.length;
        let processedCount = 0;
        
        // Tüm sembolleri parçalara böl ve paralel işle
        const batchSize = this.maxParallelRequests; // Paralel işleme sayısı
        
        for (let i = 0; i < totalSymbols; i += batchSize) {
            if (!this.isScanning) break;
            
            const batch = this.allSymbols.slice(i, i + batchSize);
            const promises = batch.map(async (symbol) => {
                try {
                    const candles = await this.getCandleData(symbol);
                    if (candles && candles.length > 0) {
                        return {
                            symbol, 
                            results: await window.finyxScanners.scanSymbol(symbol, candles)
                        };
                    }
                } catch (error) {
                    console.error(`${symbol} taranırken hata:`, error);
                }
                return { symbol, results: null };
            });
            
            // Batch'i paralel işle ve tamamlandığında sonuçları topla
            const batchResults = await Promise.all(promises);
            
            batchResults.forEach(item => {
                if (item && item.results) {
                    if (item.results.lq) results.lq.push(item.results.lq);
                    if (item.results.whale) results.whale.push(item.results.whale);
                    if (item.results.v1) results.v1.push(item.results.v1);
                }
            });
            
            // İlerlemeyi güncelle
            processedCount += batch.length;
            const progress = (processedCount / totalSymbols) * 100;
            progressElement.style.width = progress + '%';
            
            const timeframe = document.getElementById('scannerTimeframe').value;
            statusElement.textContent = `Taranıyor: [${timeframe}] (${processedCount}/${totalSymbols})`;
        }
        
        return results;
    }

    async scanWithType(scannerType) {
        const results = { lq: [], whale: [], v1: [] };
        const progressElement = document.getElementById('progressFill');
        const statusElement = document.getElementById('scannerStatus');
        
        // Tarama tipini kontrol et
        const scanType = document.getElementById('scanType')?.value || 'all';
        let symbolsToScan = [];
        
        if (scanType === 'single') {
            // Belirli coin seçilmiş
            const selectedCoin = document.getElementById('singleCoinSelect')?.value;
            if (selectedCoin) {
                symbolsToScan = [selectedCoin];
                statusElement.textContent = `${selectedCoin.replace('_PERP', '')} ${scannerType} taraması yapılıyor...`;
            } else {
                statusElement.textContent = 'Lütfen bir coin seçin!';
                return { lq: [], whale: [], v1: [] };
            }
        } else {
            // Tüm coinler
            if (this.allSymbols.length === 0) {
                statusElement.textContent = 'Sembol listesi alınıyor...';
                await this.fetchAllSymbols();
            }
            symbolsToScan = this.allSymbols;
        }
        
        const totalSymbols = symbolsToScan.length;
        let processedCount = 0;
        
        // Tüm sembolleri parçalara böl ve paralel işle
        const batchSize = this.maxParallelRequests; // Paralel işleme sayısı
        
        for (let i = 0; i < totalSymbols; i += batchSize) {
            if (!this.isScanning) break;
            
            const batch = this.allSymbols.slice(i, i + batchSize);
            const promises = batch.map(async (symbol) => {
                try {
                    const candles = await this.getCandleData(symbol);
                    if (candles && candles.length > 0) {
                        let result = null;
                        
                        switch (scannerType) {
                            case 'LQ':
                                const lqResult = window.finyxScanners.lqScanner.get786Level(candles);
                                if (lqResult) {
                                    result = window.finyxScanners.lqScanner.addTrackedSignal(symbol, lqResult.price, lqResult.levelName);
                                    return { type: 'lq', result };
                                }
                                break;
                                
                            case 'WHALE':
                                result = window.finyxScanners.whaleScanner.processData(symbol, candles);
                                if (result) {
                                    result.symbol = symbol;
                                    return { type: 'whale', result };
                                }
                                break;
                                
                            case 'V1':
                                const v1Results = window.finyxScanners.v1Scanner.findLatestPeak(candles);
                                if (v1Results.length > 0) {
                                    v1Results[0].symbol = symbol;
                                    return { type: 'v1', result: v1Results[0] };
                                }
                                break;
                        }
                    }
                } catch (error) {
                    console.error(`${symbol} ${scannerType} taranırken hata:`, error);
                }
                return null;
            });
            
            // Batch'i paralel işle ve tamamlandığında sonuçları topla
            const batchResults = await Promise.all(promises);
            
            batchResults.forEach(item => {
                if (item) {
                    if (item.type === 'lq' && item.result) results.lq.push(item.result);
                    if (item.type === 'whale' && item.result) results.whale.push(item.result);
                    if (item.type === 'v1' && item.result) results.v1.push(item.result);
                }
            });
            
            // İlerlemeyi güncelle
            processedCount += batch.length;
            const progress = (processedCount / totalSymbols) * 100;
            progressElement.style.width = progress + '%';
            
            const timeframe = document.getElementById('scannerTimeframe').value;
            statusElement.textContent = `${scannerType} Taranıyor: [${timeframe}] (${processedCount}/${totalSymbols})`;
        }
        
        return results;
    }

    async getCandleData(symbol) {
        try {
            // Scanner için özel zaman dilimini kullan
            const interval = document.getElementById('scannerTimeframe')?.value || '15m';
            // Futures API endpoint'ine istek at ve _PERP suffix'ini kaldır
            const cleanSymbol = symbol.replace('_PERP', '');
            const response = await fetch(`/api/futures/klines?symbol=${cleanSymbol}&interval=${interval}&limit=100`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Binance formatını scanner formatına dönüştür
            return data.map(kline => ({
                timestamp: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5])
            }));
            
        } catch (error) {
            console.error(`${symbol} için candle verisi alınırken hata:`, error);
            return null;
        }
    }

    displayResults(results) {
        // LQ Results
        this.displayLQResults(results.lq || []);
        
        // Whale Results
        this.displayWhaleResults(results.whale || []);
        
        // V1 Results
        this.displayV1Results(results.v1 || []);
    }

    displayLQResults(signals) {
        const container = document.getElementById('lqSignalsList');
        container.innerHTML = '';
        const timeframe = document.getElementById('scannerTimeframe').value;
        
        if (signals.length === 0) {
            container.innerHTML = `<div style="color: #888; text-align: center; padding: 20px;">Sinyal bulunamadı [${timeframe}]</div>`;
            return;
        }
        
        signals.forEach(signal => {
            const signalElement = document.createElement('div');
            signalElement.className = 'signal-item';
            signalElement.onclick = () => this.switchToSymbol(signal.symbol);
            
            signalElement.innerHTML = `
                <div class="signal-symbol">${signal.symbol}</div>
                <div class="signal-price">0.786 Fib: ${signal.price.toFixed(8)}</div>
                <div class="signal-info">Level: ${signal.levelName}</div>
                <div class="signal-time">${new Date(signal.timestamp).toLocaleString()}</div>
            `;
            
            container.appendChild(signalElement);
        });
    }

    displayWhaleResults(signals) {
        const container = document.getElementById('whaleSignalsList');
        container.innerHTML = '';
        const timeframe = document.getElementById('scannerTimeframe').value;
        
        if (signals.length === 0) {
            container.innerHTML = `<div style="color: #888; text-align: center; padding: 20px;">Sinyal bulunamadı [${timeframe}]</div>`;
            return;
        }
        
        signals.forEach(signal => {
            const signalElement = document.createElement('div');
            signalElement.className = 'signal-item';
            signalElement.onclick = () => this.switchToSymbol(signal.symbol);
            
            const strengthColor = signal.strength === 'VERY_STRONG' ? '#ff4444' : '#ffa500';
            
            signalElement.innerHTML = `
                <div class="signal-symbol">${signal.symbol}</div>
                <div class="signal-price">Price: ${signal.price.toFixed(8)}</div>
                <div class="signal-info" style="color: ${strengthColor}">Strength: ${signal.strength}</div>
                <div class="signal-info">RSI: ${signal.rsi.toFixed(2)} | RV: ${signal.rv.toFixed(2)}</div>
                <div class="signal-time">${new Date(signal.timestamp).toLocaleString()}</div>
            `;
            
            container.appendChild(signalElement);
        });
    }

    displayV1Results(signals) {
        const container = document.getElementById('v1SignalsList');
        container.innerHTML = '';
        const timeframe = document.getElementById('scannerTimeframe').value;
        
        if (signals.length === 0) {
            container.innerHTML = `<div style="color: #888; text-align: center; padding: 20px;">Sinyal bulunamadı [${timeframe}]</div>`;
            return;
        }
        
        signals.forEach(signal => {
            const signalElement = document.createElement('div');
            signalElement.className = 'signal-item';
            signalElement.onclick = () => this.switchToSymbol(signal.symbol);
            
            signalElement.innerHTML = `
                <div class="signal-symbol">${signal.symbol}</div>
                <div class="signal-price">Peak: ${signal.peakPrice.toFixed(8)}</div>
                <div class="signal-info">Buy Levels:</div>
                <div class="signal-info" style="color: #00ff00;">Low: ${signal.lowBuy.toFixed(8)}</div>
                <div class="signal-info" style="color: #ffff00;">Med: ${signal.mediumBuy.toFixed(8)}</div>
                <div class="signal-info" style="color: #ff6600;">High: ${signal.highBuy.toFixed(8)}</div>
                <div class="signal-time">${new Date(signal.timestamp).toLocaleString()}</div>
            `;
            
            container.appendChild(signalElement);
        });
    }

    switchToSymbol(symbol) {
        // Chart'ın sembolünü değiştir
        const symbolSelect = document.getElementById('symbolSelect');
        if (symbolSelect) {
            symbolSelect.value = symbol;
            
            // Chart'ı güncelle (eğer chart instance'ı mevcutsa)
            if (window.chart && typeof window.chart.loadData === 'function') {
                window.chart.loadData();
            }
        }
        
        // Konsola log yaz
        console.log(`Switched to symbol: ${symbol}`);
    }

    clearResults() {
        document.getElementById('lqSignalsList').innerHTML = '';
        document.getElementById('whaleSignalsList').innerHTML = '';
        document.getElementById('v1SignalsList').innerHTML = '';
        
        // Temizleme işlemi sadece UI seviyesinde, backend temizlemesine gerek yok
        // window.finyxScanners içindeki clear fonksiyonları silindi
    }

    updateScanButtons(isScanning) {
        const buttons = ['scanLQ', 'scanWhale', 'scanV1', 'scanAll'];
        buttons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                if (isScanning) {
                    button.textContent = 'Dur';
                    button.classList.add('active');
                } else {
                    // Orijinal metinleri geri yükle
                    switch (buttonId) {
                        case 'scanLQ': button.textContent = 'LQ Scanner'; break;
                        case 'scanWhale': button.textContent = 'Whale Scanner'; break;
                        case 'scanV1': button.textContent = 'V1 Scanner'; break;
                        case 'scanAll': button.textContent = 'Scan All'; break;
                    }
                    button.classList.remove('active');
                }
            }
        });
    }

    stopScan() {
        this.isScanning = false;
        this.updateScanButtons(false);
        document.getElementById('scannerStatus').textContent = 'Tarama durduruldu';
        document.getElementById('progressFill').style.width = '0%';
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Tüm perpetual futures sembollerini Binance API'den al
    async fetchAllSymbols() {
        try {
            const response = await fetch('/api/futures/symbols');
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            const data = await response.json();
            if (data && Array.isArray(data)) {
                // Sadece USDT çiftleri ve işlem gören semboller
                this.allSymbols = data
                    .filter(symbol => symbol.symbol.endsWith('USDT') && symbol.status === 'TRADING')
                    .map(symbol => symbol.symbol + '_PERP');
                
                console.log(`${this.allSymbols.length} perpetual futures sembolü yüklendi`);
                return this.allSymbols;
            }
            
            // API'den alınamazsa varsayılan listeyi kullan
            if (!this.allSymbols.length) {
                this.setDefaultSymbols();
            }
        } catch (error) {
            console.error('Sembol listesi alınırken hata:', error);
            this.setDefaultSymbols();
        }
        
        return this.allSymbols;
    }
    
    // API'den alınamazsa varsayılan sembol listesini kullan
    setDefaultSymbols() {
        this.allSymbols = [
            // Major USDT-M Perpetual Futures
            'BTCUSDT_PERP', 'ETHUSDT_PERP', 'BNBUSDT_PERP', 'ADAUSDT_PERP', 'XRPUSDT_PERP',
            'SOLUSDT_PERP', 'DOTUSDT_PERP', 'DOGEUSDT_PERP', 'AVAXUSDT_PERP', 'MATICUSDT_PERP', 
            'LINKUSDT_PERP', 'LTCUSDT_PERP', 'UNIUSDT_PERP', 'TRXUSDT_PERP', 'ETCUSDT_PERP', 
            'FILUSDT_PERP', 'XLMUSDT_PERP', 'ATOMUSDT_PERP', 'NEARUSDT_PERP', 'FTMUSDT_PERP',
            'SANDUSDT_PERP', 'AXSUSDT_PERP', 'AAVEUSDT_PERP', '1000SHIBUSDT_PERP', 'ICPUSDT_PERP',
            'EOSUSDT_PERP', 'ALGOUSDT_PERP', 'GALAUSDT_PERP', 'CRVUSDT_PERP', 'APTUSDT_PERP',
            'RUNEUSDT_PERP', 'OPUSDT_PERP', 'GMTUSDT_PERP', 'FLOWUSDT_PERP', 'APEUSDT_PERP',
            // Additional Popular Perpetual Futures
            'BCHUSDT_PERP', 'VETUSDT_PERP', 'MANAUSDT_PERP', 'THETAUSDT_PERP', 'JASMYUSDT_PERP',
            'DASHUSDT_PERP', 'GRTUSDT_PERP', 'LITUSDT_PERP', 'SUIUSDT_PERP', 'IMXUSDT_PERP',
            'ARBUSDT_PERP', 'AGIXUSDT_PERP', 'FETUSDT_PERP', 'LDOUSDT_PERP', 'INJUSDT_PERP',
            'STXUSDT_PERP', 'RNDRUSDT_PERP', 'DYDXUSDT_PERP', 'BEAMUSDT_PERP', 'ZILUSDT_PERP',
            'ASTRUSDT_PERP', 'CFXUSDT_PERP', 'MASKUSDT_PERP', 'ENSUSDT_PERP', 'LPTUSDT_PERP',
            'CHZUSDT_PERP', 'IOTAUSDT_PERP', 'ONEUSDT_PERP', 'WAVESUSDT_PERP', 'HBARUSDT_PERP',
            // Newer/Trending Perpetual Futures
            'PEPEUSDT_PERP', 'ORDIUSDT_PERP', 'TIARUSDT_PERP', 'WLDUSDT_PERP', 'SEIUSDT_PERP',
            '1000BONKUSDT_PERP', 'PYTHUSDT_PERP', 'JUPUSDT_PERP', 'STRKUSDT_PERP', 'WIFUSDT_PERP',
            'AIUSDT_PERP', 'ALTUSDT_PERP', 'PORTALUSDT_PERP', 'PIXELUSDT_PERP', 'AEURUSDT_PERP',
            'SAGAUSDT_PERP', 'TAOUSDT_PERP', 'OMNIUSDT_PERP', 'NOTUSDT_PERP', 'IOUSDT_PERP'
        ];
        console.log(`${this.allSymbols.length} varsayılan perpetual futures sembolü yüklendi`);
    }
}

// DOM yüklendiğinde scanner UI'yi başlat
document.addEventListener('DOMContentLoaded', function() {
    // FinyX Scanners objesi için scanSymbol fonksiyonu ekle
    if (window.finyxScanners) {
        // Tüm scanner'ları tek bir coin için çalıştıracak fonksiyon
        window.finyxScanners.scanSymbol = async function(symbol, candles) {
            const results = {};
            
            try {
                // LQ Scanner
                try {
                    const lqResult = this.lqScanner.get786Level(candles);
                    if (lqResult) {
                        // addTrackedSignal hata veriyorsa, direk obje oluştur
                        try {
                            results.lq = this.lqScanner.addTrackedSignal(symbol, lqResult.price, lqResult.levelName);
                        } catch (innerErr) {
                            results.lq = {
                                symbol: symbol,
                                price: lqResult.price,
                                levelName: lqResult.levelName,
                                timestamp: new Date().getTime()
                            };
                        }
                    }
                } catch (lqErr) {
                    console.error(`LQ Scanner hatası:`, lqErr);
                }
                
                // Whale Scanner
                try {
                    const whaleResult = this.whaleScanner.processData(symbol, candles);
                    if (whaleResult) {
                        whaleResult.symbol = symbol;
                        results.whale = whaleResult;
                    }
                } catch (whaleErr) {
                    console.error(`Whale Scanner hatası:`, whaleErr);
                }
                
                // V1 Scanner
                try {
                    const v1Results = this.v1Scanner.findLatestPeak(candles);
                    if (v1Results && v1Results.length > 0) {
                        v1Results[0].symbol = symbol;
                        results.v1 = v1Results[0];
                    }
                } catch (v1Err) {
                    console.error(`V1 Scanner hatası:`, v1Err);
                }
                
            } catch (error) {
                console.error(`${symbol} tarama hatası:`, error);
            }
            
            return results;
        };
        
        // Scanner sonuçlarını temizleme fonksiyonu - KALDIRILDI
    }
    
    window.scannerUI = new ScannerUI();
    console.log('FinyX Scanner UI initialized');
});

// Scanner integration tamamlandı
console.log('FinyX Scanner Integration loaded successfully!');
