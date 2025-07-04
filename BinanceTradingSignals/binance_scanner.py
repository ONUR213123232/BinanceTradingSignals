import asyncio
import websocket
import json
import threading
import time
from typing import Dict, List, Any, Optional
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import requests
from trading_signals import FinyXAdvancedSignal
import logging

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BinancePerperualScanner:
    """
    Binance Perpetual Future coinlerini WebSocket ile tarayan sistem
    Pine Script sinyallerini tespit eder
    """
    
    def __init__(self, timeframe: str = "5m", batch_size: int = 10):
        self.timeframe = timeframe
        self.batch_size = batch_size
        self.timeframe_seconds = self._get_timeframe_seconds(timeframe)
        
        # Logger
        self.logger = logger
        
        # Sinyal tespit sistemi
        self.signal_detector = FinyXAdvancedSignal(self.timeframe_seconds)
        
        # Veri depolama
        self.kline_data: Dict[str, List[Dict]] = {}
        self.signals: Dict[str, Dict] = {}
        self.active_symbols = []
        self.ws_connections: Dict[str, websocket.WebSocketApp] = {}
        
        # Kontrol değişkenleri
        self.scanning = False
        self.current_batch = 0
        
        # Binance Perpetual sembollerini al
        self.perpetual_symbols = self._get_perpetual_symbols()
        self.logger.info(f"Toplam {len(self.perpetual_symbols)} perpetual sembol bulundu")
        
        # Symbol batch'lerini oluştur
        self.symbol_batches = self._create_symbol_batches()
        self.logger.info(f"{len(self.symbol_batches)} batch oluşturuldu")
        
    def _get_timeframe_seconds(self, timeframe: str) -> int:
        """Timeframe'i saniyeye çevir"""
        time_mapping = {
            "1m": 60,
            "3m": 180,
            "5m": 300,
            "15m": 900,
            "30m": 1800,
            "1h": 3600,
            "2h": 7200,
            "4h": 14400,
            "6h": 21600,
            "8h": 28800,
            "12h": 43200,
            "1d": 86400
        }
        return time_mapping.get(timeframe, 300)
    
    def _get_perpetual_symbols(self) -> List[str]:
        """Binance Perpetual Future sembollerini al"""
        try:
            url = "https://fapi.binance.com/fapi/v1/exchangeInfo"
            response = requests.get(url, timeout=10)
            data = response.json()
            
            symbols = []
            for symbol_info in data['symbols']:
                if (symbol_info['status'] == 'TRADING' and 
                    symbol_info['contractType'] == 'PERPETUAL' and
                    symbol_info['symbol'].endswith('USDT')):
                    symbols.append(symbol_info['symbol'])
            
            # Popüler coinleri öncelikle al
            priority_symbols = [s for s in symbols if any(coin in s for coin in 
                              ['BTC', 'ETH', 'BNB', 'ADA', 'DOT', 'LINK', 'SOL', 'MATIC', 'AVAX', 'ATOM'])]
            
            other_symbols = [s for s in symbols if s not in priority_symbols]
            
            # Önce popüler coinler, sonra diğerleri
            return priority_symbols + other_symbols
            
        except Exception as e:
            self.logger.error(f"Sembol listesi alınamadı: {e}")
            # Fallback liste
            return [
                'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'DOTUSDT',
                'LINKUSDT', 'SOLUSDT', 'MATICUSDT', 'AVAXUSDT', 'ATOMUSDT'
            ]
    
    def _create_symbol_batches(self) -> List[List[str]]:
        """Sembolleri batch'lere böl"""
        batches = []
        for i in range(0, len(self.perpetual_symbols), self.batch_size):
            batch = self.perpetual_symbols[i:i + self.batch_size]
            batches.append(batch)
        return batches
    
    def _get_historical_klines(self, symbol: str, limit: int = 200) -> Optional[pd.DataFrame]:
        """Geçmiş kline verilerini al"""
        try:
            url = "https://fapi.binance.com/fapi/v1/klines"
            params = {
                'symbol': symbol,
                'interval': self.timeframe,
                'limit': limit
            }
            
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            
            if not data:
                return None
            
            # DataFrame'e çevir
            df = pd.DataFrame(data, columns=[
                'timestamp', 'open', 'high', 'low', 'close', 'volume',
                'close_time', 'quote_asset_volume', 'number_of_trades',
                'taker_buy_base_asset_volume', 'taker_buy_quote_asset_volume', 'ignore'
            ])
            
            # Veri tiplerini düzelt
            for col in ['open', 'high', 'low', 'close', 'volume']:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            
            return df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
            
        except Exception as e:
            self.logger.error(f"{symbol} için geçmiş veri alınamadı: {e}")
            return None
    
    def _on_kline_message(self, ws, message):
        """WebSocket kline mesajını işle"""
        try:
            data = json.loads(message)
            
            if 'k' in data:
                kline = data['k']
                symbol = kline['s']
                
                # Hem kapalı hem de mevcut açık mumu işle
                kline_data = {
                    'timestamp': pd.to_datetime(kline['t'], unit='ms'),
                    'open': float(kline['o']),
                    'high': float(kline['h']),
                    'low': float(kline['l']),
                    'close': float(kline['c']),
                    'volume': float(kline['v']),
                    'is_closed': kline['x']  # Kapanmış mı?
                }
                
                # Veriyi sakla
                if symbol not in self.kline_data:
                    self.kline_data[symbol] = []
                
                # Eğer kapalı mum ise listeye ekle
                if kline['x']:  # is_closed
                    self.kline_data[symbol].append(kline_data)
                    
                    # Maksimum 200 mum tut
                    if len(self.kline_data[symbol]) > 200:
                        self.kline_data[symbol] = self.kline_data[symbol][-200:]
                
                # Mevcut açık mum için son elemanı güncelle
                else:
                    # Eğer liste boş değilse ve son eleman açık bir mum ise güncelle
                    if self.kline_data[symbol] and not self.kline_data[symbol][-1].get('is_closed', True):
                        self.kline_data[symbol][-1] = kline_data
                    else:
                        # Yeni açık mum ekle
                        self.kline_data[symbol].append(kline_data)
                
                # Her durumda sinyal analizi yap (gerçek zamanlı)
                self._analyze_signals(symbol)
                    
        except Exception as e:
            self.logger.error(f"Kline mesajı işlenirken hata: {e}")
    
    def _on_websocket_error(self, ws, error):
        """WebSocket hata durumu"""
        self.logger.error(f"WebSocket hatası: {error}")
    
    def _on_websocket_close(self, ws, close_status_code, close_msg):
        """WebSocket kapatıldığında"""
        self.logger.info("WebSocket bağlantısı kapatıldı")
    
    def _analyze_signals(self, symbol: str):
        """Belirtilen sembol için sinyal analizi yap"""
        try:
            if symbol not in self.kline_data or len(self.kline_data[symbol]) < 100:
                return
            
            # DataFrame oluştur
            df = pd.DataFrame(self.kline_data[symbol])
            
            # Geçmiş verilerle birleştir
            historical_df = self._get_historical_klines(symbol, 100)
            if historical_df is not None:
                # Son 100 kayıtla birleştir
                recent_data = df.tail(50)  # Son 50 real-time veri
                combined_df = pd.concat([historical_df.tail(150), recent_data], ignore_index=True)
                combined_df = combined_df.drop_duplicates(subset=['timestamp'], keep='last')
            else:
                combined_df = df
            
            # Sinyal tespiti
            signals = self.signal_detector.calculate_signals(combined_df)
            
            # Sinyal durumunu kontrol et ve kaydet
            signals['symbol'] = symbol
            signals['timestamp'] = datetime.now()
            
            if any([signals['buy_signal'], signals['pump_signal'], signals['sell_signal']]):
                # Sinyal VAR - kaydet
                self.signals[symbol] = signals
                
                # Sinyal logla
                signal_type = []
                if signals['buy_signal']:
                    signal_type.append("BUY 🛒")
                if signals['pump_signal']:
                    signal_type.append("PUMP 💥")
                if signals['sell_signal']:
                    signal_type.append("SELL 🚨")
                
                self.logger.info(f"🎯 {symbol}: {' + '.join(signal_type)} | "
                          f"Fiyat: ${signals['price']:.4f} | "
                          f"RSI: {signals['rsi']:.1f} | "
                          f"Trend: {signals['trend']}")
            else:
                # Sinyal YOK - ancak durumu kaydet
                if symbol in self.signals:
                    # Eski sinyali sil
                    del self.signals[symbol]
                
        except Exception as e:
            self.logger.error(f"{symbol} sinyal analizi hatası: {e}")
    
    def _start_websocket_for_symbols(self, symbols: List[str]):
        """Belirtilen semboller için WebSocket başlat"""
        if not symbols:
            return
            
        # Stream adlarını oluştur
        streams = [f"{symbol.lower()}@kline_{self.timeframe}" for symbol in symbols]
        stream_url = f"wss://fstream.binance.com/stream?streams={'/'.join(streams)}"
        
        self.logger.info(f"WebSocket başlatılıyor: {len(symbols)} sembol")
        
        ws = websocket.WebSocketApp(
            stream_url,
            on_message=self._on_kline_message,
            on_error=self._on_websocket_error,
            on_close=self._on_websocket_close
        )
        
        # WebSocket'i thread'de çalıştır
        wst = threading.Thread(target=ws.run_forever)
        wst.daemon = True
        wst.start()
        
        return ws
    
    def start_scanning(self):
        """Taramayı başlat"""
        if self.scanning:
            self.logger.warning("Tarama zaten başlatılmış")
            return
            
        self.scanning = True
        self.logger.info(f"Binance Perpetual taraması başlatılıyor...")
        self.logger.info(f"Timeframe: {self.timeframe}")
        self.logger.info(f"Batch boyutu: {self.batch_size}")
        
        # İlk batch'i başlat
        self.start_current_batch()
        
        # Batch döngüsünü başlat
        self._start_batch_rotation()
    
    def _start_next_batch(self):
        """Sonraki batch'e geç"""
        # Mevcut batch'i kapat
        self._close_current_batch()
        
        # Sonraki batch'e geç
        self.current_batch = (self.current_batch + 1) % len(self.symbol_batches)
        self.logger.info(f"Batch değişti: {self.current_batch + 1}/{len(self.symbol_batches)} - Hızlı tarama aktif")
        
        # Yeni batch'i başlat
        self.start_current_batch()
        
    def start_current_batch(self):
        """Mevcut batch'i başlat"""
        if not self.symbol_batches or self.current_batch >= len(self.symbol_batches):
            return
            
        current_symbols = self.symbol_batches[self.current_batch]
        self.active_symbols = current_symbols
        
        self.logger.info(f"Batch {self.current_batch + 1}: {len(current_symbols)} sembol taranıyor")
        self.logger.info(f"Semboller: {', '.join(current_symbols)}")
        
        # WebSocket'i başlat
        ws = self._start_websocket_for_symbols(current_symbols)
        if ws:
            self.ws_connections['current'] = ws
    
    def _close_current_batch(self):
        """Mevcut batch'i kapat"""
        if 'current' in self.ws_connections:
            try:
                self.ws_connections['current'].close()
                del self.ws_connections['current']
            except:
                pass
    
    def _start_batch_rotation(self):
        """Batch döngüsünü başlat"""
        def rotation_loop():
            while self.scanning:
                time.sleep(10)  # 10 saniye bekle (hızlı tarama)
                if self.scanning:
                    self._start_next_batch()
        
        rotation_thread = threading.Thread(target=rotation_loop)
        rotation_thread.daemon = True
        rotation_thread.start()
    
    def stop_scanning(self):
        """Taramayı durdur"""
        self.scanning = False
        self._close_current_batch()
        self.logger.info("Tarama durduruldu")
    
    def get_signals(self) -> Dict[str, Dict]:
        """Aktif sinyalleri döndür"""
        # 5 dakikadan eski sinyalleri temizle
        current_time = datetime.now()
        valid_signals = {}
        
        for symbol, signal in self.signals.items():
            if (current_time - signal['timestamp']).total_seconds() <= 300:  # 5 dakika
                valid_signals[symbol] = signal
        
        self.signals = valid_signals
        return valid_signals
    
    def get_active_symbols(self) -> List[str]:
        """Aktif taranan sembolleri döndür"""
        return self.active_symbols
    
    def get_scanning_status(self) -> Dict[str, Any]:
        """Tarama durumunu döndür"""
        return {
            'scanning': self.scanning,
            'current_batch': self.current_batch,
            'active_symbols': len(self.active_symbols),
            'total_symbols': len(self.perpetual_symbols),
            'signals_count': len(self.get_signals()),
            'timeframe': self.timeframe
        }
    
    def get_console_messages(self) -> List[Dict[str, str]]:
        """Konsol mesajlarını döndür"""
        messages = []
        
        if self.scanning and self.active_symbols:
            # Mevcut batch bilgisi
            messages.append({
                'message': f'Batch {self.current_batch + 1}/{len(self.symbol_batches)} taranıyor: {len(self.active_symbols)} coin - GERÇEK ZAMANLI',
                'type': 'info'
            })
            
            # Aktif semboller - sinyal durumu ile
            for symbol in self.active_symbols[:5]:  # İlk 5 sembolü göster
                # Bu sembol için sinyal var mı kontrol et
                if symbol in self.signals:
                    signal = self.signals[symbol]
                    signal_types = []
                    if signal.get('buy_signal'):
                        signal_types.append('BUY')
                    if signal.get('pump_signal'):
                        signal_types.append('PUMP')
                    if signal.get('sell_signal'):
                        signal_types.append('SELL')
                    
                    if signal_types:
                        messages.append({
                            'message': f'{symbol}: {" + ".join(signal_types)} VAR! 🎯',
                            'type': signal_types[0].lower()
                        })
                    else:
                        messages.append({
                            'message': f'{symbol}: Sinyal YOK ⚪',
                            'type': 'info'
                        })
                else:
                    messages.append({
                        'message': f'{symbol}: Analiz ediliyor... 🔍',
                        'type': 'info'
                    })
            
            # Son sinyaller
            recent_signals = self.get_signals()
            for symbol, signal in list(recent_signals.items())[:3]:  # Son 3 sinyal
                signal_types = []
                if signal.get('buy_signal'):
                    signal_types.append('BUY')
                if signal.get('pump_signal'):
                    signal_types.append('PUMP')
                if signal.get('sell_signal'):
                    signal_types.append('SELL')
                
                if signal_types:
                    messages.append({
                        'message': f'{symbol}: {" + ".join(signal_types)} tespit edildi!',
                        'type': signal_types[0].lower()
                    })
        
        return messages

# Test fonksiyonu
if __name__ == "__main__":
    scanner = BinancePerperualScanner(timeframe="5m", batch_size=10)
    
    try:
        scanner.start_scanning()
        
        # 60 saniye çalıştır
        time.sleep(60)
        
        # Sinyalleri göster
        signals = scanner.get_signals()
        print(f"\n🎯 Tespit edilen sinyaller ({len(signals)}):")
        for symbol, signal in signals.items():
            signal_types = []
            if signal['buy_signal']:
                signal_types.append("BUY 🛒")
            if signal['pump_signal']:
                signal_types.append("PUMP 💥")
            if signal['sell_signal']:
                signal_types.append("SELL 🚨")
            
            print(f"{symbol}: {' + '.join(signal_types)} | "
                  f"Fiyat: ${signal['price']:.4f} | "
                  f"RSI: {signal['rsi']:.1f} | "
                  f"Trend: {signal['trend']}")
        
    except KeyboardInterrupt:
        print("\nTarama durduruluyor...")
    finally:
        scanner.stop_scanning()
