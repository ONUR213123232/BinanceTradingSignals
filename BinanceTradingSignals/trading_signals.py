import numpy as np
import pandas as pd
import ta
from typing import Tuple, Dict, Any, Optional
import math

class FinyXAdvancedSignal:
    """
    Pine Script FinyX Advanced Signal - Pro kodunun Python çevirisi
    Birebir çevrilmiş, orijinal mantık korunmuş
    """
    
    def __init__(self, timeframe_seconds: int = 300):
        self.timeframe_seconds = timeframe_seconds
        self.last_signal_bar = None
        self.signal_cooldown = 3
        
        # Tesla 3-6-9 Kuralı (Frekans Harmonikleri)
        self.tesla_3 = 3
        self.tesla_6 = 6
        self.tesla_9 = 9
        self.harmonic_period = self.tesla_3 * self.tesla_6 * self.tesla_9  # 162 periyot
        
        # Fibonacci ve Altın Oran
        self.golden_ratio = 1.618
        self.phi_inverse = 0.618
        
    def calculate_signals(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        DataFrame ile Pine Script mantığını uygula
        df: OHLCV verisi içeren DataFrame
        """
        if len(df) < 200:  # Minimum veri kontrolü
            return self._empty_signal()
            
        close = df['close'].values
        open_prices = df['open'].values
        high = df['high'].values
        low = df['low'].values
        volume = df['volume'].values
        
        # Zaman dilimi tespiti
        current_timeframe = self.timeframe_seconds
        is_low_tf = current_timeframe <= 300
        is_mid_tf = 300 < current_timeframe <= 3600
        
        # Hacim ve fiyat hesaplamaları
        volume_avg = self._sma(volume, 20)
        volume_avg_short = self._sma(volume, 10)
        price_change = (close - open_prices) / open_prices * 100
        ema_trend = self._ema(close, 50)
        
        # Gelişmiş Fibonacci + Altın Oran Hesaplamaları
        fib_0_618 = self._lowest(low, 50) * 1.618
        fib_1_618 = self._lowest(low, 50) * 2.618
        
        # Sacred Geometry - Altın Spiral Kontrolü
        price_ratio = close / self._highest(high, 89)
        is_golden_zone = (price_ratio >= (self.phi_inverse - 0.08)) & (price_ratio <= (self.phi_inverse + 0.08))
        
        # Gelişmiş Trend Analizi - Çoklu EMA Sistemi
        ema_fast = self._ema(close, 12)
        ema_medium = self._ema(close, 26)
        ema_slow = self._ema(close, 50)
        ema_trend_long = self._ema(close, 100)
        
        # Trend Gücü ve Yönü
        strong_uptrend = (ema_fast > ema_medium) & (ema_medium > ema_slow) & (ema_slow > ema_trend_long) & (close > ema_fast)
        strong_downtrend = (ema_fast < ema_medium) & (ema_medium < ema_slow) & (ema_slow < ema_trend_long) & (close < ema_fast)
        weak_uptrend = (ema_fast > ema_medium) & (close > ema_fast) & (~strong_uptrend)
        weak_downtrend = (ema_fast < ema_medium) & (close < ema_fast) & (~strong_downtrend)
        sideways_market = (~strong_uptrend) & (~strong_downtrend) & (~weak_uptrend) & (~weak_downtrend)
        
        # Trend Değişim Tespiti
        trend_change_up = self._shift(weak_downtrend, 1) & (sideways_market | weak_uptrend)
        trend_change_down = self._shift(weak_uptrend, 1) & (sideways_market | weak_downtrend)
        
        # Momentum ve Güç Göstergeleri
        rsi = self._rsi(close, 14)
        macd_line, signal_line, histogram = self._macd(close, 12, 26, 9)
        macd_bullish = (macd_line > signal_line) & (histogram > self._shift(histogram, 1))
        macd_bearish = (macd_line < signal_line) & (histogram < self._shift(histogram, 1))
        
        # Gerçek Dip/Tepe Tespiti
        lookback = 5 if is_low_tf else 8
        
        # Pivot noktaları
        pivot_high = self._pivot_high(high, lookback)
        pivot_low = self._pivot_low(low, lookback)
        
        # Güçlü dip/tepe tespiti
        is_strong_dip = (~np.isnan(pivot_low)) & (volume > volume_avg * 1.2)
        is_strong_peak = (~np.isnan(pivot_high)) & (volume > volume_avg * 1.2)
        
        # V şeklinde hareket tespiti
        v_shape_dip = (self._shift(low, 2) > self._shift(low, 1)) & (self._shift(low, 1) > low) & \
                      (low < self._shift(low, 1)) & (self._shift(low, 1) < self._shift(low, 2)) & \
                      (volume > volume_avg)
        
        inverted_v_peak = (self._shift(high, 2) < self._shift(high, 1)) & (self._shift(high, 1) < high) & \
                         (high > self._shift(high, 1)) & (self._shift(high, 1) > self._shift(high, 2)) & \
                         (volume > volume_avg)
        
        perfect_dip = is_strong_dip | v_shape_dip
        perfect_peak = is_strong_peak | inverted_v_peak
        
        # Hacim Analizi
        volume_surge = volume > volume_avg * (2.0 if is_low_tf else 1.8)
        volume_above_normal = volume > volume_avg * 1.4
        volume_declining = volume < volume_avg * 0.7
        
        # Smart Money Tespiti
        big_volume_up = (close > open_prices) & (volume > volume_avg * 2.5) & (close > self._shift(close, 1))
        big_volume_down = (close < open_prices) & (volume > volume_avg * 2.5) & (close < self._shift(close, 1))
        
        # BUY Sinyali Koşulları
        buy_condition_1 = perfect_dip & (strong_downtrend | weak_downtrend) & (rsi < 40) & volume_above_normal
        buy_condition_2 = trend_change_up & macd_bullish & (rsi < 50) & volume_surge
        buy_condition_3 = sideways_market & perfect_dip & (rsi < 35) & big_volume_up
        
        # Yanlış buy sinyallerini engelle
        avoid_buy = strong_uptrend | (rsi > 60) | (close > ema_trend_long * 1.05)
        
        is_buy_signal = (buy_condition_1 | buy_condition_2 | buy_condition_3) & (~avoid_buy)
        
        # PUMP Sinyali
        pump_condition_1 = self._shift(perfect_dip, 1) & (close > self._shift(high, 1)) & volume_surge & \
                          (price_change > (1.2 if is_low_tf else 0.8))
        pump_condition_2 = trend_change_up & big_volume_up & (close > ema_fast * 1.008)
        pump_condition_3 = is_golden_zone & macd_bullish & (volume > volume_avg * 1.6) & (close > open_prices)
        
        # Yanlış pump sinyallerini engelle
        avoid_pump = strong_uptrend & (rsi > 70)
        
        is_pump_signal = (pump_condition_1 | pump_condition_2 | pump_condition_3) & (~avoid_pump)
        
        # SELL Sinyali
        sell_condition_1 = perfect_peak & (strong_uptrend | weak_uptrend) & (rsi > 65) & volume_above_normal
        sell_condition_2 = trend_change_down & macd_bearish & (rsi > 50) & volume_surge
        sell_condition_3 = sideways_market & perfect_peak & (rsi > 70) & big_volume_down
        
        # Yanlış sell sinyallerini engelle
        avoid_sell = strong_downtrend | (rsi < 40) | (close < ema_trend_long * 0.95)
        
        is_sell_signal = (sell_condition_1 | sell_condition_2 | sell_condition_3) & (~avoid_sell)
        
        # Son değerleri al (güncel mum)
        current_idx = -1
        
        result = {
            'buy_signal': bool(is_buy_signal[current_idx]) if len(is_buy_signal) > 0 else False,
            'pump_signal': bool(is_pump_signal[current_idx]) if len(is_pump_signal) > 0 else False,
            'sell_signal': bool(is_sell_signal[current_idx]) if len(is_sell_signal) > 0 else False,
            'rsi': float(rsi[current_idx]) if len(rsi) > 0 else 0,
            'trend': self._get_trend_text(strong_uptrend[current_idx], strong_downtrend[current_idx], 
                                        weak_uptrend[current_idx], weak_downtrend[current_idx]),
            'volume_status': self._get_volume_status(volume[current_idx], volume_avg[current_idx]),
            'price': float(close[current_idx]),
            'price_change': float(price_change[current_idx]) if len(price_change) > 0 else 0
        }
        
        return result
    
    def _empty_signal(self) -> Dict[str, Any]:
        """Boş sinyal döndür"""
        return {
            'buy_signal': False,
            'pump_signal': False,
            'sell_signal': False,
            'rsi': 0,
            'trend': 'Veri Yetersiz',
            'volume_status': 'Bilinmiyor',
            'price': 0,
            'price_change': 0
        }
    
    # Teknik gösterge fonksiyonları
    def _sma(self, data: np.ndarray, period: int) -> np.ndarray:
        """Simple Moving Average"""
        return pd.Series(data).rolling(window=period).mean().values
    
    def _ema(self, data: np.ndarray, period: int) -> np.ndarray:
        """Exponential Moving Average"""
        return pd.Series(data).ewm(span=period, adjust=False).mean().values
    
    def _rsi(self, data: np.ndarray, period: int = 14) -> np.ndarray:
        """Relative Strength Index"""
        return ta.momentum.RSIIndicator(pd.Series(data), window=period).rsi().values
    
    def _macd(self, data: np.ndarray, fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """MACD"""
        macd_indicator = ta.trend.MACD(pd.Series(data), window_fast=fast, window_slow=slow, window_sign=signal)
        return (macd_indicator.macd().values, 
                macd_indicator.macd_signal().values, 
                macd_indicator.macd_diff().values)
    
    def _highest(self, data: np.ndarray, period: int) -> np.ndarray:
        """En yüksek değer"""
        return pd.Series(data).rolling(window=period).max().values
    
    def _lowest(self, data: np.ndarray, period: int) -> np.ndarray:
        """En düşük değer"""
        return pd.Series(data).rolling(window=period).min().values
    
    def _shift(self, data: np.ndarray, periods: int) -> np.ndarray:
        """Veriyi kaydır"""
        if periods > 0:
            return np.concatenate([np.full(periods, np.nan), data[:-periods]])
        elif periods < 0:
            return np.concatenate([data[-periods:], np.full(-periods, np.nan)])
        return data
    
    def _pivot_high(self, data: np.ndarray, left_bars: int, right_bars: int = None) -> np.ndarray:
        """Pivot High"""
        if right_bars is None:
            right_bars = left_bars
        
        result = np.full(len(data), np.nan)
        
        for i in range(left_bars, len(data) - right_bars):
            current = data[i]
            is_highest = True
            
            # Sol taraf kontrolü
            for j in range(i - left_bars, i):
                if data[j] >= current:
                    is_highest = False
                    break
            
            # Sağ taraf kontrolü
            if is_highest:
                for j in range(i + 1, i + right_bars + 1):
                    if data[j] >= current:
                        is_highest = False
                        break
            
            if is_highest:
                result[i] = current
        
        return result
    
    def _pivot_low(self, data: np.ndarray, left_bars: int, right_bars: int = None) -> np.ndarray:
        """Pivot Low"""
        if right_bars is None:
            right_bars = left_bars
        
        result = np.full(len(data), np.nan)
        
        for i in range(left_bars, len(data) - right_bars):
            current = data[i]
            is_lowest = True
            
            # Sol taraf kontrolü
            for j in range(i - left_bars, i):
                if data[j] <= current:
                    is_lowest = False
                    break
            
            # Sağ taraf kontrolü
            if is_lowest:
                for j in range(i + 1, i + right_bars + 1):
                    if data[j] <= current:
                        is_lowest = False
                        break
            
            if is_lowest:
                result[i] = current
        
        return result
    
    def _get_trend_text(self, strong_up: bool, strong_down: bool, weak_up: bool, weak_down: bool) -> str:
        """Trend durumunu metin olarak döndür"""
        if strong_up:
            return "Güçlü Yükseliş"
        elif strong_down:
            return "Güçlü Düşüş"
        elif weak_up:
            return "Zayıf Yükseliş"
        elif weak_down:
            return "Zayıf Düşüş"
        else:
            return "Yatay"
    
    def _get_volume_status(self, current_volume: float, avg_volume: float) -> str:
        """Hacim durumunu döndür"""
        if current_volume > avg_volume * 1.5:
            return "Yüksek"
        elif current_volume < avg_volume * 0.8:
            return "Düşük"
        else:
            return "Normal"
