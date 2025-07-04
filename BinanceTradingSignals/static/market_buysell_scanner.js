// ============= MARKET-WIDE BUY/SELL SCANNER =============
// Tüm USDT perpetual çiftlerini tarayarak Buy/Sell sinyallerini tespit eden kod

class BuySellScanner {
    constructor() {
        this.isScanning = false;
        this.scanProgress = 0;
        this.allSymbols = [];
        this.maxParallelRequests = 10; // Paralel istek sayısı
        this.signals = []; // Tespit edilen sinyaller
        this.timeframe = '5m'; // Varsayılan timeframe
    }

    // Scanner'ı başlat
    async startScan(timeframe) {
        if (this.isScanning) {
            console.log("Zaten tarama yapılıyor, lütfen önce durdurun.");
            return;
        }

        this.timeframe = timeframe || '5m';
        this.isScanning = true;
        this.scanProgress = 0;
        this.signals = [];
        
        this.updateProgress("Semboller yükleniyor...", 0);
        
        try {
            // 1. Tüm USDT çiftlerini al
            await this.fetchAllSymbols();
            
            // 2. Batch halinde tara
            await this.scanAllSymbols();
            
            // 3. Tamamlandı mesajı
            this.updateProgress("Tarama tamamlandı", 100);
            this.isScanning = false;
            
            // 4. Sinyalleri göster
            this.displaySignals();
            
            return this.signals;
        } catch (error) {
            console.error("Tarama sırasında hata:", error);
            this.updateProgress("Hata: " + error.message, 0);
            this.isScanning = false;
            return [];
        }
    }
    
    // Tüm USDT çiftlerini getir
    async fetchAllSymbols() {
        try {
            const response = await fetch('/api/get_symbols');
            const data = await response.json();
            
            if (!data.success) {
                throw new Error("Sembol listesi alınamadı");
            }
            
            // Sadece USDT çiftlerini filtrele
            this.allSymbols = data.symbols.filter(symbol => symbol.endsWith('USDT'));
            console.log(`Toplam ${this.allSymbols.length} USDT çifti bulundu`);
            
            return this.allSymbols;
        } catch (error) {
            console.error("Semboller alınırken hata:", error);
            throw error;
        }
    }
    
    // Tüm sembolleri batch halinde tara
    async scanAllSymbols() {
        const batchSize = this.maxParallelRequests;
        let processedCount = 0;
        const batches = [];
        
        // Batch'lere böl
        for (let i = 0; i < this.allSymbols.length; i += batchSize) {
            batches.push(this.allSymbols.slice(i, i + batchSize));
        }
        
        // Her batch'i sırayla tara
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            
            // Batch başlangıcında ilerleme göster
            this.updateProgress(`Batch ${i+1}/${batches.length} taranıyor...`, Math.round((processedCount / this.allSymbols.length) * 100));
            
            // Bu batch'deki tüm sembolleri paralel tara
            const batchPromises = batch.map(symbol => this.scanSymbol(symbol));
            const batchResults = await Promise.all(batchPromises);
            
            // Sonuçları ana sinyaller listesine ekle
            batchResults.forEach(result => {
                if (result && result.length) {
                    this.signals.push(...result);
                }
            });
            
            // İlerlemeyi güncelle
            processedCount += batch.length;
            this.scanProgress = Math.round((processedCount / this.allSymbols.length) * 100);
            this.updateProgress(`${processedCount}/${this.allSymbols.length} coin tarandı (${this.scanProgress}%)`, this.scanProgress);
        }
    }
    
    // Tekil sembolü tara
    async scanSymbol(symbol) {
        try {
            // Mum verilerini al
            const candles = await this.getCandleData(symbol);
            
            if (!candles || candles.length < 10) {
                console.log(`${symbol} için yeterli mum verisi yok`);
                return [];
            }
            
            // Buy/Sell sinyallerini kontrol et
            return this.checkBuySellSignals(symbol, candles);
        } catch (error) {
            console.error(`${symbol} taranırken hata:`, error);
            return [];
        }
    }
    
    // Mum verilerini al
    async getCandleData(symbol) {
        try {
            const response = await fetch(`/api/get_candles?symbol=${symbol}&interval=${this.timeframe}&limit=100`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(`${symbol} için mum verileri alınamadı`);
            }
            
            return data.candles;
        } catch (error) {
            console.error(`${symbol} için mum verileri alınırken hata:`, error);
            throw error;
        }
    }
    
    // Tesla 3-6-9 + Fibonacci buy/sell sinyallerini kontrol et
    checkBuySellSignals(symbol, candles) {
        // BURADA GERÇEK BUY/SELL ALGORİTMASI OLACAK
        // Bu algoritma grafikte kullanılan Tesla 3-6-9 + Fibonacci algoritmalarını uygulayacak
        const signals = [];
        
        // Son 50 mumu kullan
        const recentCandles = candles.slice(-50);
        
        // Örnek buy/sell tespit eden basit bir algoritma
        for (let i = 3; i < recentCandles.length; i++) {
            // BUY SİNYALİ
            // 3 çubuk önceki kapanışın altında şu anki kapanış + hacim artışı
            if (recentCandles[i].close > recentCandles[i-3].close &&
                recentCandles[i].volume > recentCandles[i-1].volume * 1.3) {
                
                signals.push({
                    symbol: symbol,
                    price: recentCandles[i].close,
                    timestamp: recentCandles[i].timestamp,
                    type: "BUY",
                    timeframe: this.timeframe
                });
            }
            
            // SELL SİNYALİ
            // 3 çubuk önceki kapanışın üstünde şu anki kapanış + hacim artışı
            if (recentCandles[i].close < recentCandles[i-3].close &&
                recentCandles[i].volume > recentCandles[i-1].volume * 1.3) {
                
                signals.push({
                    symbol: symbol,
                    price: recentCandles[i].close,
                    timestamp: recentCandles[i].timestamp,
                    type: "SELL",
                    timeframe: this.timeframe
                });
            }
        }
        
        return signals;
    }
    
    // İlerleme durumunu güncelle
    updateProgress(message, progress) {
        const statusElement = document.getElementById('scannerStatus');
        const progressElement = document.getElementById('progressFill');
        
        if (statusElement) {
            statusElement.textContent = message;
        }
        
        if (progressElement) {
            progressElement.style.width = `${progress}%`;
        }
        
        // Stats güncelleme
        document.getElementById('activeCoins').textContent = this.allSymbols.length;
        document.getElementById('totalSignals').textContent = this.signals.length;
    }
    
    // Sinyalleri göster
    displaySignals() {
        const container = document.getElementById('signalsContainer');
        
        if (!container) return;
        
        // Eğer sinyal yoksa bilgi mesajı göster
        if (this.signals.length === 0) {
            container.innerHTML = `
                <div class="no-signals">
                    <i class="fas fa-search"></i>
                    <p>Sinyal tespit edilmedi</p>
                </div>
            `;
            return;
        }
        
        // Sinyalleri temizle
        container.innerHTML = '';
        
        // Sinyalleri sırala (en yeni en üstte)
        const sortedSignals = [...this.signals].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        // Her sinyal için kart oluştur
        sortedSignals.forEach(signal => {
            const signalElement = document.createElement('div');
            signalElement.className = `signal-card ${signal.type.toLowerCase()}-signal`;
            signalElement.dataset.symbol = signal.symbol;
            
            // Sinyale tıklandığında o sembolü grafikte göster
            signalElement.addEventListener('click', () => {
                document.getElementById('chartSymbol').value = signal.symbol;
                const changeEvent = new Event('change');
                document.getElementById('chartSymbol').dispatchEvent(changeEvent);
                
                // Bildirim göster
                this.showNotification(`${signal.symbol} grafikte gösteriliyor`);
            });
            
            // Sinyal kartının içeriği
            signalElement.innerHTML = `
                <div class="signal-symbol">${signal.symbol.replace('USDT', '')}</div>
                <div class="signal-details">
                    <span class="signal-type ${signal.type.toLowerCase()}">${signal.type}</span>
                    <span class="signal-price">$${parseFloat(signal.price).toFixed(4)}</span>
                    <span class="signal-time">${new Date(signal.timestamp).toLocaleTimeString()}</span>
                    <span class="signal-timeframe">${signal.timeframe}</span>
                </div>
                <div class="signal-actions">
                    <button class="view-btn"><i class="fas fa-chart-line"></i></button>
                </div>
            `;
            
            container.appendChild(signalElement);
        });
    }
    
    // Bildirim göster
    showNotification(message) {
        const event = new CustomEvent('showNotification', {
            detail: {
                title: 'Sinyal Bildirimi',
                message: message,
                type: 'info'
            }
        });
        
        document.dispatchEvent(event);
    }
}

// Sayfa yüklendiğinde scanner'ı oluştur
document.addEventListener('DOMContentLoaded', () => {
    // Global olarak erişilebilir scanner nesnesi
    window.buySellScanner = new BuySellScanner();
    
    // Tarama Başlat butonuna event listener ekle
    document.getElementById('startBtn').addEventListener('click', async () => {
        const timeframe = document.getElementById('timeframe').value;
        await window.buySellScanner.startScan(timeframe);
    });
    
    // BUY/SELL filtre butonları için event listenerlar
    document.getElementById('buyFilterBtn').addEventListener('click', () => {
        document.getElementById('buyFilterBtn').classList.toggle('active');
        applySignalFilters();
    });
    
    document.getElementById('sellFilterBtn').addEventListener('click', () => {
        document.getElementById('sellFilterBtn').classList.toggle('active');
        applySignalFilters();
    });
    
    // Sinyal filtreleme fonksiyonu
    function applySignalFilters() {
        const showBuy = document.getElementById('buyFilterBtn').classList.contains('active');
        const showSell = document.getElementById('sellFilterBtn').classList.contains('active');
        
        // Tüm sinyal kartlarını al
        const buySignals = document.querySelectorAll('.buy-signal');
        const sellSignals = document.querySelectorAll('.sell-signal');
        
        // BUY sinyallerini göster/gizle
        buySignals.forEach(signal => {
            signal.style.display = showBuy ? 'flex' : 'none';
        });
        
        // SELL sinyallerini göster/gizle
        sellSignals.forEach(signal => {
            signal.style.display = showSell ? 'flex' : 'none';
        });
        
        // Hiç sinyal gösterilmiyorsa mesaj göster
        const signalsContainer = document.getElementById('signalsContainer');
        const visibleSignals = signalsContainer.querySelectorAll('.signal-card[style="display: flex;"]');
        
        if (visibleSignals.length === 0 && (buySignals.length > 0 || sellSignals.length > 0)) {
            // Sinyaller var ama hepsi filtreden dolayı gizli
            const noVisibleSignals = document.createElement('div');
            noVisibleSignals.className = 'no-signals';
            noVisibleSignals.innerHTML = `
                <i class="fas fa-filter"></i>
                <p>Seçili filtrelerle eşleşen sinyal bulunamadı</p>
                <p>Filtreleri değiştirin</p>
            `;
            
            // Önce tüm no-signals divlerini temizle
            signalsContainer.querySelectorAll('.no-signals').forEach(el => el.remove());
            
            // Sonra yeni mesajı ekle
            signalsContainer.appendChild(noVisibleSignals);
        } else {
            // Filtre mesajını kaldır (eğer görünür sinyaller varsa)
            signalsContainer.querySelectorAll('.no-signals').forEach(el => {
                if (el.querySelector('.fa-filter')) {
                    el.remove();
                }
            });
        }
    }
    
    // Refresh butonuna event listener ekle
    document.getElementById('refreshBtn').addEventListener('click', () => {
        window.buySellScanner.displaySignals();
        applySignalFilters(); // Filtreleri tekrar uygula
    });
    
    // Clear butonuna event listener ekle
    document.getElementById('clearBtn').addEventListener('click', () => {
        window.buySellScanner.signals = [];
        window.buySellScanner.displaySignals();
    });
    
    console.log('Market-wide Buy/Sell Scanner başlatıldı');
});
