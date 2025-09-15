/**
 * ハイブリッド校正の設定型とデフォルト値
 */

export interface HybridCalibConfig {
  latencySec: number;          // 配信遅延
  edgeSlackSec: number;        // 右端判定の余裕
  nearLiveSlackSec: number;    // seekableEnd基準の近接判定
  pll: {
    hysSec: number;            // 誤差ヒステリシス
    consecN: number;           // 連続一致回数
    alpha: number;             // PLLゲイン
    maxRatePerSec: number;     // C変化速度上限
    outlierESec: number;       // 外れ値上限
    intervalMs: number;        // 実行間隔
  };
}

export const DEFAULT_HYBRID_CONFIG: HybridCalibConfig = {
  latencySec: 20,
  // QA観測から: UIがLIVEでも bufferedEnd 直前に張り付けないケースが多い
  // Edge判定の余裕を広げ、自然動作で Edge-Snap が通りやすい既定値に調整
  edgeSlackSec: 12,
  nearLiveSlackSec: 18,
  pll: {
    hysSec: 2.5,
    consecN: 5,
    alpha: 0.02,
    maxRatePerSec: 0.5 / 60,
    outlierESec: 4000,
    intervalMs: 1000,
  },
};
