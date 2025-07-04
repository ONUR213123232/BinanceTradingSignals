// Binance Trading Signals - Interactive Dashboard
class TradingDashboard {
    constructor() {
        this.scanning = false;
        this.startTime = null;
        this.updateInterval = null;
        this.signalSound = null;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.loadStatus();
        this.setupNotifications();
        this.startAutoRefresh();
        
        // Initialize audio for signal notifications
        this.initAudio();
        
        console.log('🚀 Trading Dashboard initialized');
    }
    
    bindEvents() {
        // Control buttons
        document.getElementById('startBtn').addEventListener('click', () => this.startScanning());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopScanning());
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshSignals());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearSignals());
        document.getElementById('clearConsole').addEventListener('click', () => this.clearConsole());
        
        // Auto-refresh when visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.loadStatus();
                this.loadSignals();
            }
        });
    }
    
    initAudio() {
        // Create audio context for signal notifications
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Audio context not supported');
        }
    }
    
    playSignalSound() {
        if (!this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.1);
        } catch (e) {
            console.warn('Could not play signal sound:', e);
        }
    }
    
    async startScanning() {
        const timeframe = document.getElementById('timeframe').value;
        
        this.showLoading('Tarama başlatılıyor...');
        
        try {
            const response = await fetch('/api/start_scanner', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    timeframe: timeframe
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.scanning = true;
                this.startTime = new Date();
                this.updateUI();
                this.showNotification('Başarılı', data.message, 'success');
                
                // Start intensive updates when scanning
                this.startIntensiveUpdates();
            } else {
                this.showNotification('Hata', data.message, 'error');
            }
        } catch (error) {
            this.showNotification('Hata', 'Bağlantı hatası: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    async stopScanning() {
        this.showLoading('Tarama durduruluyor...');
        
        try {
            const response = await fetch('/api/stop_scanner', {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.scanning = false;
                this.startTime = null;
                this.updateUI();
                this.showNotification('Başarılı', data.message, 'success');
                
                // Stop intensive updates
                this.stopIntensiveUpdates();
            } else {
                this.showNotification('Hata', data.message, 'error');
            }
        } catch (error) {
            this.showNotification('Hata', 'Bağlantı hatası: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    async loadStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            if (data.success) {
                this.updateStatusDisplay(data.status, data.active_symbols);
                this.scanning = data.status.scanning;
                this.updateUI();
            }
        } catch (error) {
            console.error('Status yüklenirken hata:', error);
        }
    }
    
    async loadSignals() {
        try {
            const response = await fetch('/api/signals');
            const data = await response.json();
            
            if (data.success) {
                this.updateSignalsDisplay(data.signals);
                
                // Play sound if new signals detected
                if (data.signals.length > 0) {
                    this.playSignalSound();
                }
            }
        } catch (error) {
            console.error('Sinyaller yüklenirken hata:', error);
        }
    }
    
    updateStatusDisplay(status, activeSymbols) {
        // Update stats
        document.getElementById('activeCoins').textContent = status.active_symbols;
        document.getElementById('totalSignals').textContent = status.signals_count;
        document.getElementById('currentBatch').textContent = status.current_batch;
        
        // Update uptime
        if (this.scanning && this.startTime) {
            const uptime = this.formatUptime(new Date() - this.startTime);
            document.getElementById('uptime').textContent = uptime;
        } else {
            document.getElementById('uptime').textContent = '00:00';
        }
        
        // Update connection status
        const statusElement = document.getElementById('connectionStatus');
        const statusText = statusElement.querySelector('span');
        const statusDot = statusElement.querySelector('.pulse-dot');
        
        if (status.scanning) {
            statusText.textContent = 'Tarama Aktif';
            statusDot.style.background = '#00FF88';
        } else {
            statusText.textContent = 'Sistem Hazır';
            statusDot.style.background = '#FFD700';
        }
        
        // Update active symbols
        this.updateActiveSymbols(activeSymbols);
    }
    
    updateActiveSymbols(symbols) {
        // Semboller paneli kaldırıldığı için boş bir fonksiyon
        // Sadece istatistik güncellemesi için kullanılıyor
        document.getElementById('activeCoins').textContent = symbols ? symbols.length : 0;
        // Bu fonksiyon artık semboller panelini güncellemez
    }
    
    updateSignalsDisplay(signals) {
        const container = document.getElementById('signalsContainer');
        
        if (!signals || signals.length === 0) {
            container.innerHTML = `
                <div class="no-signals">
                    <i class="fas fa-search"></i>
                    <p>Henüz sinyal tespit edilmedi</p>
                    <p>Taramayı başlatın...</p>
                </div>
            `;
            return;
        }
        
        const signalsHTML = signals.map(signal => this.createSignalCard(signal)).join('');
        container.innerHTML = signalsHTML;
    }
    
    createSignalCard(signal) {
        const badges = signal.signals.map(type => {
            const badgeClass = type.toLowerCase() === 'buy' ? 'badge-buy' : 
                              type.toLowerCase() === 'pump' ? 'badge-pump' : 'badge-sell';
            const icon = type.toLowerCase() === 'buy' ? '🛒' : 
                        type.toLowerCase() === 'pump' ? '💥' : '🚨';
            
            return `<span class="signal-badge ${badgeClass}">${icon} ${type}</span>`;
        }).join('');
        
        const trendColor = signal.trend.includes('Yükseliş') ? '#00FF88' : 
                          signal.trend.includes('Düşüş') ? '#FF3366' : '#FFD700';
        
        return `
            <div class="signal-card">
                <div class="signal-header">
                    <div class="signal-symbol">${signal.symbol.replace('USDT', '')}</div>
                    <div class="signal-time">${signal.timestamp}</div>
                </div>
                <div class="signal-badges">
                    ${badges}
                </div>
                <div class="signal-details">
                    <div class="detail-item">
                        <div class="detail-label">Fiyat</div>
                        <div class="detail-value">$${signal.price}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">RSI</div>
                        <div class="detail-value">${signal.rsi}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Trend</div>
                        <div class="detail-value" style="color: ${trendColor}">${signal.trend}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Hacim</div>
                        <div class="detail-value">${signal.volume_status}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Değişim</div>
                        <div class="detail-value" style="color: ${signal.price_change >= 0 ? '#00FF88' : '#FF3366'}">
                            ${signal.price_change >= 0 ? '+' : ''}${signal.price_change}%
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    updateUI() {
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (this.scanning) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Tarama Aktif';
            stopBtn.innerHTML = '<i class="fas fa-stop"></i> Durdur';
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            startBtn.innerHTML = '<i class="fas fa-play"></i> Taramayı Başlat';
            stopBtn.innerHTML = '<i class="fas fa-stop"></i> Durdur';
        }
    }
    
    formatUptime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        const displayHours = hours % 24;
        const displayMinutes = minutes % 60;
        const displaySeconds = seconds % 60;
        
        return `${displayHours.toString().padStart(2, '0')}:${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
    }
    
    startAutoRefresh() {
        // Regular updates every 10 seconds
        this.updateInterval = setInterval(() => {
            this.loadStatus();
        }, 10000);
    }
    
    startIntensiveUpdates() {
        // Intensive updates every 1 second when scanning for real-time console
        this.intensiveInterval = setInterval(() => {
            this.loadSignals();
            this.loadStatus();
            this.loadConsoleMessages();
        }, 1000);
    }
    
    stopIntensiveUpdates() {
        if (this.intensiveInterval) {
            clearInterval(this.intensiveInterval);
            this.intensiveInterval = null;
        }
    }
    
    refreshSignals() {
        this.loadSignals();
        this.showNotification('Bilgi', 'Sinyaller yenilendi', 'success');
    }
    
    clearSignals() {
        document.getElementById('signalsContainer').innerHTML = `
            <div class="no-signals">
                <i class="fas fa-search"></i>
                <p>Sinyaller temizlendi</p>
                <p>Yeni sinyaller için bekleyin...</p>
            </div>
        `;
        this.showNotification('Bilgi', 'Sinyaller temizlendi', 'warning');
    }
    
    showLoading(text = 'Yükleniyor...') {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        
        loadingText.textContent = text;
        overlay.style.display = 'flex';
    }
    
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = 'none';
    }
    
    setupNotifications() {
        this.notificationContainer = document.getElementById('notificationContainer');
    }
    
    showNotification(title, message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = type === 'success' ? 'fa-check-circle' :
                    type === 'error' ? 'fa-exclamation-triangle' :
                    type === 'warning' ? 'fa-exclamation-circle' : 'fa-info-circle';
        
        notification.innerHTML = `
            <div class="notification-header">
                <i class="fas ${icon}"></i>
                <span>${title}</span>
            </div>
            <div class="notification-message">${message}</div>
        `;
        
        this.notificationContainer.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'notificationSlide 0.5s ease-out reverse';
                setTimeout(() => {
                    notification.remove();
                }, 500);
            }
        }, 5000);
    }
    
    // Konsol fonksiyonları
    addConsoleMessage(message, type = 'info') {
        const container = document.getElementById('consoleContainer');
        const welcome = container.querySelector('.console-welcome');
        
        // İlk mesajda welcome mesajını kaldır
        if (welcome) {
            welcome.remove();
        }
        
        const timestamp = new Date().toLocaleTimeString('tr-TR', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const consoleLine = document.createElement('div');
        consoleLine.className = 'console-line';
        
        consoleLine.innerHTML = `
            <span class="console-timestamp">${timestamp}</span>
            <span class="console-message console-${type}">${message}</span>
        `;
        
        container.appendChild(consoleLine);
        
        // Otomatik scroll en alta
        container.scrollTop = container.scrollHeight;
        
        // Maksimum 100 mesaj tut
        const lines = container.querySelectorAll('.console-line');
        if (lines.length > 100) {
            lines[0].remove();
        }
    }
    
    clearConsole() {
        const container = document.getElementById('consoleContainer');
        container.innerHTML = `
            <div class="console-welcome">
                <i class="fas fa-rocket"></i>
                <p>Konsol temizlendi</p>
            </div>
        `;
    }
    
    async loadConsoleMessages() {
        if (!this.scanning) return;
        
        try {
            const response = await fetch('/api/console_messages');
            const data = await response.json();
            
            if (data.success && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    this.addConsoleMessage(msg.message, msg.type);
                });
            }
        } catch (error) {
            console.error('Konsol mesajları yüklenemedi:', error);
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new TradingDashboard();
});

// Add some nice console messages
console.log('%c🚀 Binance Trading Signals Dashboard', 'color: #FFD700; font-size: 20px; font-weight: bold;');
console.log('%c⚡ Pine Script sinyalleri canlı olarak tespit ediliyor!', 'color: #00FF88; font-size: 14px;');
console.log('%c📊 FinyX Pro - Gelişmiş Sinyal Sistemi', 'color: #00FFFF; font-size: 12px;');
