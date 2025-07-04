// ============= FINYX SCANNERS =============
// Android uygulamasından direkt kopyalanan 3 scanner algoritması
// 1. FinyX LQ Scanner
// 2. FinyX Whale Scanner  
// 3. FinyX V1 Scanner

// ============= 1. FINYX LQ SCANNER =============
class FinyXLQScanner {
    constructor() {
        this.lookbackPeriod = 60;
        this.minPriceMovement = 0.02; // %2'lik minimum hareket
        this.trackedSignals = [];
    }

    // Python'daki find_last_dip_fib fonksiyonuna benzer şekilde en güncel ve temas edilmemiş 0.786 seviyesini bulur
    get786Level(candles) {
        if (candles.length <= 2) {
            return null; // Yeterli veri yok (Python'daki gibi en az 2 mum lazım)
        }

        try {
            // Python'daki findLastDipFib metoduyla aynı mantık
            // En güncel veriden başlayarak geriye doğru tarama yaparak "dip" ara
            for (let i = 1; i < candles.length - 1; i++) {
                const currentIdx = candles.length - 1 - i; // Sondan başa doğru git
                
                // Bu indeks bir dip mi kontrol et
                if (this.isDip(candles, currentIdx)) {
                    // Dip mumun yüksek ve düşük noktaları (Python'daki gibi)
                    const dipHigh = candles[currentIdx].high;
                    const dipLow = candles[currentIdx].low;
                    
                    // 0.786 Fibonacci seviyesi hesapla (Python'daki round fonksiyonu gibi)
                    const fibLevel = Math.round((dipHigh - (dipHigh - dipLow) * 0.786) * 100000000) / 100000000;
                    
                    // Seviyeye daha önce temas edilmiş mi kontrol et (ASIL KRİTİK NOKTA)
                    if (!this.isLevelTouched(candles, fibLevel, currentIdx)) {
                        // Python uygulamanızdaki gibi "Temas edilmemiş en güncel 0.786" bulundu
                        console.log("Bulundu: 0.786 Fib seviyesi (dip " + currentIdx + ", seviye: " + fibLevel + ")");
                        return { levelName: "fib786", price: fibLevel };
                    } else {
                        console.log("Bu seviyeye daha önce temas edilmiş: " + fibLevel);
                    }
                }
            }
            
            return null; // Kriteri karşılayan seviye bulunamadı
        } catch (e) {
            console.log("786 seviyesi hesaplanırken hata: " + e.message);
            return null;
        }
    }
    
    // Python'daki is_dip metoduyla aynı mantık - Pine Script isDip uyumlu
    // İlgili indeksteki mumun bir dip olup olmadığını kontrol eder
    isDip(candles, idx) {
        // Sınırları kontrol et
        if (idx <= 0 || idx >= candles.length - 1) {
            return false;
        }
        
        // Önceki ve sonraki mumdan daha düşük olmalı (Python'daki is_lower mantığı)
        const isLower = candles[idx].low < candles[idx - 1].low && candles[idx].low < candles[idx + 1].low;
        
        // Mumun gövdesi kırmızı olmalı (bearish) (Python'daki is_bearish mantığı)
        const isBearish = candles[idx].close < candles[idx].open;
        
        return isLower && isBearish;
    }

    // Python'daki is_level_touched fonksiyonuyla aynı mantık
    // Belirli bir Fibonacci seviyesine daha sonraki bir mum tarafından temas edilip edilmediğini kontrol eder
    isLevelTouched(candles, level, startIdx) {
        // startIdx sonrasındaki mumlarda bu seviyeye temas edilmiş mi kontrol et
        for (let i = startIdx + 1; i < candles.length; i++) {
            // Python'daki if float(data['Low'].iloc[i]) <= level: mantığı
            if (candles[i].low <= level) {
                return true; // Daha sonraki bir mum bu seviyeye temas etmiş
            }
        }
        return false; // Temas edilmemiş seviye (alınmamış seviye)
    }

    // LQ sinyal ekleme
    addTrackedSignal(symbol, price, levelName) {
        const signal = {
            symbol: symbol,
            price: price,
            levelName: levelName,
            timestamp: new Date().toISOString(),
            type: "LQ"
        };
        this.trackedSignals.push(signal);
        return signal;
    }
}

// ============= 2. FINYX WHALE SCANNER =============
class FinyXWhaleScanner {
    constructor() {
        this.settings = {
            lookbackPeriod: 10,
            rvThresholdStrong: 2.0,
            rvThresholdVeryStrong: 4.0,
            rsiPeriod: 14,
            rsiOverbought: 70.0
        };
        this.activeSignals = {};
    }

    // Ayarları güncelle
    setSettings(lookbackPeriod, rvThresholdStrong, rvThresholdVeryStrong, rsiPeriod, rsiOverbought) {
        this.settings = {
            lookbackPeriod,
            rvThresholdStrong,
            rvThresholdVeryStrong,
            rsiPeriod,
            rsiOverbought
        };
    }

    // Bir sembol için verileri işle ve sinyal hesapla
    processData(symbol, candles) {
        // Önce sembolü aktif sinyallerden kaldır
        // TradingView gibi, her kontrol öncesi sinyali temizliyoruz
        if (this.activeSignals[symbol]) {
            console.log(symbol + " için önceki sinyal temizleniyor");
            delete this.activeSignals[symbol];
        }
        
        // Göstergeleri hesapla
        const indicators = this.calculateIndicators(candles);
        
        // Gösterge hesaplamasında hata varsa işleme devam etme
        if (indicators.length === 0) {
            console.log(symbol + " için gösterge hesaplaması başarısız!");
            return null;
        }
        
        // SADECE SON MUM (Şu anki) için sinyal kontrolü
        const lastCandle = indicators[indicators.length - 1];
        const currentSignal = this.checkSignal(lastCandle);
        
        if (currentSignal) {
            // Yeni sinyal bulundu
            this.activeSignals[symbol] = currentSignal;
            console.log("Whale sinyal bulundu: " + symbol);
            return currentSignal;
        }
        
        return null;
    }

    // Göstergeleri hesapla
    calculateIndicators(candles) {
        const enhanced = [];
        
        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];
            
            // RSI hesapla
            const rsi = this.calculateRSI(candles, i, this.settings.rsiPeriod);
            
            // RV (Relative Volume) hesapla
            const rv = this.calculateRV(candles, i, this.settings.lookbackPeriod);
            
            enhanced.push({
                ...candle,
                rsi: rsi,
                rv: rv
            });
        }
        
        return enhanced;
    }

    // RSI hesaplama
    calculateRSI(candles, currentIndex, period) {
        if (currentIndex < period) return 50.0; // Yeterli veri yok
        
        let gains = 0;
        let losses = 0;
        
        for (let i = currentIndex - period + 1; i <= currentIndex; i++) {
            const change = candles[i].close - candles[i - 1].close;
            if (change > 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return 100.0;
        
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        return rsi;
    }

    // RV (Relative Volume) hesaplama
    calculateRV(candles, currentIndex, lookbackPeriod) {
        if (currentIndex < lookbackPeriod) return 1.0;
        
        const currentVolume = candles[currentIndex].volume;
        
        let totalVolume = 0;
        for (let i = currentIndex - lookbackPeriod; i < currentIndex; i++) {
            totalVolume += candles[i].volume;
        }
        
        const avgVolume = totalVolume / lookbackPeriod;
        
        if (avgVolume === 0) return 1.0;
        
        return currentVolume / avgVolume;
    }

    // Sinyal kontrolü
    checkSignal(enhancedCandle) {
        // Whale sinyal kriterleri:
        // 1. RV > threshold (güçlü hacim)
        // 2. RSI < overbought (aşırı alım değil)
        // 3. Mum yeşil (yükseliş)
        
        const isGreenCandle = enhancedCandle.close > enhancedCandle.open;
        const strongVolume = enhancedCandle.rv >= this.settings.rvThresholdStrong;
        const veryStrongVolume = enhancedCandle.rv >= this.settings.rvThresholdVeryStrong;
        const notOverbought = enhancedCandle.rsi < this.settings.rsiOverbought;
        
        if (isGreenCandle && strongVolume && notOverbought) {
            const signalType = veryStrongVolume ? "VERY_STRONG" : "STRONG";
            
            return {
                type: "WHALE",
                strength: signalType,
                price: enhancedCandle.close,
                rsi: enhancedCandle.rsi,
                rv: enhancedCandle.rv,
                timestamp: new Date().toISOString()
            };
        }
        
        return null;
    }
}

// ============= 3. FINYX V1 SCANNER =============
class FinyXV1Scanner {
    constructor(lookbackBars = 50) {
        this.lookbackBars = lookbackBars;
    }

    // Verilen mum verilerinde Fibonacci sinyallerini hesaplar
    // Python'daki find_latest_peak metodu ile aynı mantık
    findLatestPeak(candles) {
        // Son lookbackBars kadar mumu al
        const lookbackData = candles.length > this.lookbackBars ? 
            candles.slice(-this.lookbackBars) : candles;
        
        if (lookbackData.length < 20) {  // En az 20 mum gerekli
            return [];
        }

        // Tepe arama parametrelerini ayarla - Python'daki gibi
        const peakLookback = Math.min(80, this.lookbackBars);
        
        // Son peakLookback mum içinde tepe noktayı bul
        const recentData = lookbackData.slice(-peakLookback);

        // TEPE BULMA - Python'daki algoritmayla aynı
        const peakBars = [];

        // Tüm mumları iterate et ve tepe olanları işaretle
        for (let i = 1; i < recentData.length - 1; i++) {
            if (recentData[i].high > recentData[i-1].high && 
                recentData[i].high > recentData[i+1].high) {
                peakBars.push(i);
            }
        }

        // Eğer tepe bulunamadıysa, sinyal dönme
        if (peakBars.length === 0) {
            return [];
        }

        // En son tepeyi bul
        const lastPeakIdx = peakBars[peakBars.length - 1];
        const peakHigh = recentData[lastPeakIdx].high;
        const peakLow = recentData[lastPeakIdx].low;  // TEPE MUMUN DÜŞÜĞÜ
        const peakTime = new Date(recentData[lastPeakIdx].timestamp).toLocaleString();
        const peakBar = lastPeakIdx;
        
        // *** ÖNEMLİ: İNDIKATÖR KODU GİBİ HESAPLA ***
        // İndikatör kodunda peakHigh ve peakLow, tepe mumun kendi değerleridir
        const priceRange = peakHigh - peakLow;

        // TradingView indikatöründe AYNEN olduğu gibi hesapla:
        // fib1618 = peakLow - (peakHigh - peakLow) * 1.618
        // fib175 = peakLow - (peakHigh - peakLow) * 1.75
        // fib2 = peakLow - (peakHigh - peakLow) * 2.0
        const lowBuy = peakLow - (priceRange * 1.618);    // -1.618 seviyesi 
        const mediumBuy = peakLow - (priceRange * 1.75);  // -1.75 seviyesi
        const highBuy = peakLow - (priceRange * 2.0);     // -2.0 seviyesi

        // Tepe mesafesi - en son tepenin kaç mum önce oluştuğunu gösterir
        const peakDistance = recentData.length - 1 - lastPeakIdx;

        // Sinyal oluştur
        const signal = {
            type: "entry",
            peakPrice: peakHigh,
            peakTime: peakTime,
            lowBuy: lowBuy,
            mediumBuy: mediumBuy,
            highBuy: highBuy,
            peakDistance: peakDistance,
            timestamp: new Date().toISOString()
        };

        return [signal];
    }

    // Mum formatını dönüştür
    formatCandle(klineData) {
        return {
            timestamp: klineData[0],
            open: parseFloat(klineData[1]),
            high: parseFloat(klineData[2]),
            low: parseFloat(klineData[3]),
            close: parseFloat(klineData[4]),
            volume: parseFloat(klineData[5])
        };
    }
}

// ============= SCANNER MANAGER =============
class FinyXScannerManager {
    constructor() {
        this.lqScanner = new FinyXLQScanner();
        this.whaleScanner = new FinyXWhaleScanner();
        this.v1Scanner = new FinyXV1Scanner();
        this.results = {
            lq: [],
            whale: [],
            v1: []
        };
    }

    // Tüm scanner'ları çalıştır
    async scanSymbol(symbol, candles) {
        const results = {};

        // LQ Scanner
        try {
            const lqResult = this.lqScanner.get786Level(candles);
            if (lqResult) {
                const signal = this.lqScanner.addTrackedSignal(symbol, lqResult.price, lqResult.levelName);
                results.lq = signal;
                this.results.lq.push(signal);
            }
        } catch (e) {
            console.log("LQ Scanner hatası: " + e.message);
        }

        // Whale Scanner
        try {
            const whaleResult = this.whaleScanner.processData(symbol, candles);
            if (whaleResult) {
                whaleResult.symbol = symbol;
                results.whale = whaleResult;
                this.results.whale.push(whaleResult);
            }
        } catch (e) {
            console.log("Whale Scanner hatası: " + e.message);
        }

        // V1 Scanner
        try {
            const v1Results = this.v1Scanner.findLatestPeak(candles);
            if (v1Results.length > 0) {
                v1Results[0].symbol = symbol;
                results.v1 = v1Results[0];
                this.results.v1.push(v1Results[0]);
            }
        } catch (e) {
            console.log("V1 Scanner hatası: " + e.message);
        }

        return results;
    }

    // Sonuçları temizle
    clearResults() {
        this.results = {
            lq: [],
            whale: [],
            v1: []
        };
    }

    // Tüm sonuçları al
    getAllResults() {
        return this.results;
    }
}

// Global scanner manager
window.finyxScanners = new FinyXScannerManager();

console.log("FinyX Scanners loaded successfully!");
