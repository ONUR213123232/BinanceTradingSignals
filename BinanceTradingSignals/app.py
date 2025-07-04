from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import threading
import time
import requests
from datetime import datetime
from binance_scanner import BinancePerperualScanner
import logging

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Global scanner instance
scanner = None
scanner_thread = None

@app.route('/')
def index():
    """Ana sayfa"""
    return render_template('index.html')

@app.route('/api/start_scanner', methods=['POST'])
def start_scanner():
    """Taramayı başlat"""
    global scanner, scanner_thread
    
    try:
        data = request.get_json() or {}
        timeframe = data.get('timeframe', '5m')
        # Batch size sabit 10, kullanıcıdan alınmaz
        batch_size = 10
        
        if scanner and scanner.scanning:
            return jsonify({
                'success': False,
                'message': 'Tarama zaten aktif'
            })
        
        # Yeni scanner oluştur
        scanner = BinancePerperualScanner(timeframe=timeframe, batch_size=batch_size)
        scanner.start_scanning()
        
        logger.info(f"Scanner başlatıldı - Timeframe: {timeframe}, Batch: {batch_size}")
        
        return jsonify({
            'success': True,
            'message': f'Tarama başlatıldı - {timeframe} timeframe ile'
        })
        
    except Exception as e:
        logger.error(f"Scanner başlatma hatası: {e}")
        return jsonify({
            'success': False,
            'message': f'Hata: {str(e)}'
        })

@app.route('/api/stop_scanner', methods=['POST'])
def stop_scanner():
    """Taramayı durdur"""
    global scanner
    
    try:
        if scanner:
            scanner.stop_scanning()
            scanner = None
            logger.info("Scanner durduruldu")
        
        return jsonify({
            'success': True,
            'message': 'Tarama durduruldu'
        })
        
    except Exception as e:
        logger.error(f"Scanner durdurma hatası: {e}")
        return jsonify({
            'success': False,
            'message': f'Hata: {str(e)}'
        })

@app.route('/api/signals')
def get_signals():
    """Aktif sinyalleri getir"""
    try:
        if not scanner:
            return jsonify({
                'success': False,
                'signals': [],
                'message': 'Scanner aktif değil'
            })
        
        signals = scanner.get_signals()
        
        # Sinyalleri JSON formatına çevir
        signal_list = []
        for symbol, signal in signals.items():
            signal_types = []
            if signal['buy_signal']:
                signal_types.append('BUY')
            if signal['pump_signal']:
                signal_types.append('PUMP')
            if signal['sell_signal']:
                signal_types.append('SELL')
            
            signal_list.append({
                'symbol': symbol,
                'signals': signal_types,
                'price': round(signal['price'], 6),
                'rsi': round(signal['rsi'], 1),
                'trend': signal['trend'],
                'volume_status': signal['volume_status'],
                'price_change': round(signal['price_change'], 2),
                'timestamp': signal['timestamp'].strftime('%H:%M:%S')
            })
        
        # Son sinyalleri önce göster
        signal_list.sort(key=lambda x: x['timestamp'], reverse=True)
        
        return jsonify({
            'success': True,
            'signals': signal_list,
            'count': len(signal_list)
        })
        
    except Exception as e:
        logger.error(f"Sinyal getirme hatası: {e}")
        return jsonify({
            'success': False,
            'signals': [],
            'message': f'Hata: {str(e)}'
        })

@app.route('/api/status')
def get_status():
    """Tarama durumunu getir"""
    try:
        if not scanner:
            return jsonify({
                'success': True,
                'status': {
                    'scanning': False,
                    'current_batch': 0,
                    'active_symbols': 0,
                    'total_symbols': 0,
                    'signals_count': 0,
                    'timeframe': 'N/A'
                }
            })
        
        status = scanner.get_scanning_status()
        active_symbols = scanner.get_active_symbols()
        
        return jsonify({
            'success': True,
            'status': status,
            'active_symbols': active_symbols
        })
        
    except Exception as e:
        logger.error(f"Durum getirme hatası: {e}")
        return jsonify({
            'success': False,
            'status': {},
            'message': f'Hata: {str(e)}'
        })

@app.route('/api/health')
def health_check():
    """Sistem sağlık kontrolü"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'scanner_status': scanner.scanning if scanner else False
    })

@app.route('/api/klines')
def get_klines():
    """Binance spot market kline verilerini getir"""
    try:
        symbol = request.args.get('symbol', 'BTCUSDT')
        interval = request.args.get('interval', '5m')
        limit = request.args.get('limit', '100')
        
        # Binance Spot API'den veri çek
        url = f"https://api.binance.com/api/v3/klines"
        params = {
            'symbol': symbol,
            'interval': interval,
            'limit': limit
        }
        
        response = requests.get(url, params=params)
        
        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({'error': 'Binance API hatası'}), 500
            
    except Exception as e:
        logger.error(f"Kline veri hatası: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/get_futures_klines')
def get_futures_klines():
    """Binance perpetual futures kline verilerini getir"""
    symbol = request.args.get('symbol', 'BTCUSDT')
    interval = request.args.get('interval', '5m')
    limit = request.args.get('limit', '100')
    
    try:
        # Binance Futures API endpoint'i
        url = f"https://fapi.binance.com/fapi/v1/klines?symbol={symbol}&interval={interval}&limit={limit}"
        
        response = requests.get(url, timeout=10)
        data = response.json()
        
        # Verileri dönüştür
        candles = []
        for item in data:
            candle = {
                'timestamp': item[0],
                'open': float(item[1]),
                'high': float(item[2]),
                'low': float(item[3]),
                'close': float(item[4]),
                'volume': float(item[5]),
                'close_time': item[6]
            }
            candles.append(candle)
        
        return jsonify({
            'success': True,
            'candles': candles
        })
        
    except Exception as e:
        logger.error(f"Kline verisi alma hatası: {e}")
        return jsonify({
            'success': False,
            'message': f'Hata: {str(e)}'
        })

@app.route('/api/get_symbols')
def get_symbols():
    """Tüm Binance sembollerini getir"""
    try:
        # Binance Futures API'dan sembolleri çek
        url = "https://fapi.binance.com/fapi/v1/exchangeInfo"
        
        response = requests.get(url, timeout=10)
        data = response.json()
        
        # Sadece USDT çiftlerini filtrele
        symbols = []
        for item in data.get('symbols', []):
            if item.get('status') == 'TRADING' and 'USDT' in item.get('symbol', ''):
                symbols.append(item.get('symbol'))
        
        return jsonify({
            'success': True,
            'symbols': symbols
        })
        
    except Exception as e:
        logger.error(f"Sembol listesi alma hatası: {e}")
        return jsonify({
            'success': False,
            'message': f'Hata: {str(e)}'
        })
        
@app.route('/api/get_candles')
def get_candles():
    """Binance mum verilerini getir"""
    symbol = request.args.get('symbol', 'BTCUSDT')
    interval = request.args.get('interval', '5m')
    limit = request.args.get('limit', '100')
    
    try:
        # Binance Futures API endpoint'i
        url = f"https://fapi.binance.com/fapi/v1/klines"
        params = {
            'symbol': symbol,
            'interval': interval,
            'limit': limit
        }
        
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        # Verileri dönüştür
        candles = []
        for item in data:
            candle = {
                'timestamp': item[0],
                'open': float(item[1]),
                'high': float(item[2]),
                'low': float(item[3]),
                'close': float(item[4]),
                'volume': float(item[5]),
                'close_time': item[6]
            }
            candles.append(candle)
        
        return jsonify({
            'success': True,
            'candles': candles
        })
        
    except Exception as e:
        logger.error(f"Mum verisi alma hatası: {e}")
        return jsonify({
            'success': False,
            'message': f'Hata: {str(e)}'
        }), 500

@app.route('/api/futures/symbols')
def get_futures_symbols():
    """Tüm Binance perpetual futures sembollerini getir"""
    try:
        # Binance Futures API'den tüm sembolleri getir
        url = "https://fapi.binance.com/fapi/v1/exchangeInfo"
        response = requests.get(url)
        
        if response.status_code == 200:
            data = response.json()
            # Sadece aktif semboller
            symbols = [{
                'symbol': s['symbol'],
                'status': s['status'],
                'baseAsset': s['baseAsset'],
                'quoteAsset': s['quoteAsset']
            } for s in data['symbols'] if s['contractType'] == 'PERPETUAL']
            
            logger.info(f"{len(symbols)} perpetual futures sembolü alındı")
            return jsonify(symbols)
        else:
            return jsonify({'error': f'Binance Futures API hatası: {response.status_code}'}), 500
            
    except Exception as e:
        logger.error(f"Futures sembol listesi hatası: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/console_messages')
def get_console_messages():
    """Konsol mesajlarını getir"""
    global scanner
    
    try:
        messages = []
        
        if scanner and scanner.scanning:
            # Aktif batch bilgisi
            messages.append({
                'timestamp': datetime.now().strftime('%H:%M:%S'),
                'message': f'Batch {scanner.current_batch + 1}/{len(scanner.symbol_batches)} taranıyor',
                'type': 'scanning'
            })
            
            # Aktif sembol bilgileri
            if hasattr(scanner, 'active_symbols') and scanner.active_symbols:
                for symbol in scanner.active_symbols[-3:]:  # Son 3 sembolü göster
                    messages.append({
                        'timestamp': datetime.now().strftime('%H:%M:%S'),
                        'message': f'{symbol} taranıyor...',
                        'type': 'scanning'
                    })
        
        return jsonify({
            'success': True,
            'messages': messages
        })
        
    except Exception as e:
        logger.error(f"Console mesajları getirme hatası: {e}")
        return jsonify({
            'success': False,
            'messages': []
        })

@app.route('/api/binance/<path:endpoint>')
def proxy_binance(endpoint):
    """Binance API için proxy - CORS hatalarını önlemek için"""
    try:
        # Base URL seçimi
        if 'fapi' in endpoint:
            base_url = "https://fapi.binance.com/"
            endpoint = endpoint.replace('fapi/', '')
        else:
            base_url = "https://api.binance.com/"
        
        # URL oluştur
        url = f"{base_url}{endpoint}"
        
        # Tüm query parametrelerini geçir
        params = request.args.to_dict()
        
        # API isteğini yap
        response = requests.get(url, params=params, timeout=10)
        
        # Yanıtı döndür
        return jsonify(response.json()), response.status_code
    except Exception as e:
        logger.error(f"Binance proxy hatası: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/futures/symbols')
def get_futures_symbols_proxy():
    """Futures sembolleri için proxy endpoint"""
    try:
        url = "https://fapi.binance.com/fapi/v1/exchangeInfo"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if 'symbols' in data:
            return jsonify(data['symbols'])
        return jsonify([])
    except Exception as e:
        logger.error(f"Futures sembol listesi hatası: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/futures/klines')
def get_futures_klines_proxy():
    """Futures kline verileri için proxy endpoint"""
    try:
        # Query parametrelerini al
        symbol = request.args.get('symbol')
        interval = request.args.get('interval', '5m')
        limit = request.args.get('limit', '100')
        
        if not symbol:
            return jsonify({'error': 'Symbol parameter required'}), 400
            
        # Binance API'sine istek yap
        url = f"https://fapi.binance.com/fapi/v1/klines?symbol={symbol}&interval={interval}&limit={limit}"
        response = requests.get(url, timeout=10)
        
        return jsonify(response.json()), response.status_code
    except Exception as e:
        logger.error(f"Futures kline verileri hatası: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print("🚀 Binance Trading Signals sistemi başlatılıyor...")
    print("🌐 Web arayüzü: http://localhost:5000")
    print("📊 API Endpoint'leri:")
    print("   - GET  /api/signals - Aktif sinyaller")
    print("   - GET  /api/status  - Tarama durumu") 
    print("   - POST /api/start_scanner - Taramayı başlat")
    print("   - POST /api/stop_scanner  - Taramayı durdur")
    print("   - GET  /api/binance/<endpoint> - Binance API proxy")
    print("\n⏰ Sistem hazır! Web arayüzünü açabilirsiniz.")
    
    app.run(debug=True, host='0.0.0.0', port=5000)
