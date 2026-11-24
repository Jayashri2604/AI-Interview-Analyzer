import numpy as np
import wave
import scipy.signal
import scipy.stats
from typing import Dict, Any, Tuple
import datetime

# =========================================================
# CONFIGURABLE THRESHOLDS
# =========================================================

# Background Noise Thresholds
MIN_SNR_DB_THRESHOLD = 7.0           # Below 7 dB SNR is excessive noise
MAX_NOISE_FLOOR_RMS = 0.11           # Noise floor RMS threshold
MIN_NOISE_DURATION_RATIO = 0.28      # Persistent across >= 28% of frames

# Multi-Speaker Detection Thresholds
PITCH_MIN_HZ = 70.0
PITCH_MAX_HZ = 380.0
MIN_PEAK_SEPARATION_HZ = 35.0        # Two distinct speaker pitch centers separated by >= 35Hz
MIN_SECONDARY_SPEAKER_RATIO = 0.15   # Secondary peak must have >= 15% of voiced frames


def read_wav_samples(wav_path: str) -> Tuple[np.ndarray, int]:
    with wave.open(wav_path, "rb") as wf:
        n_channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        sample_rate = wf.getframerate()
        n_frames = wf.getnframes()
        raw_bytes = wf.readframes(n_frames)

    if sample_width == 2:
        dtype = np.int16
        max_val = 32768.0
    elif sample_width == 4:
        dtype = np.int32
        max_val = 2147483648.0
    else:
        dtype = np.uint8
        max_val = 255.0

    samples = np.frombuffer(raw_bytes, dtype=dtype).astype(np.float32) / max_val
    if n_channels > 1:
        samples = samples.reshape(-1, n_channels).mean(axis=1)

    return samples, sample_rate


def estimate_pitch_autocorr(frame: np.ndarray, sample_rate: int) -> Tuple[float, float, float]:
    """
    Estimates F0 and checks for competing secondary pitch lag.
    Returns (f0_hz, primary_confidence, secondary_confidence).
    """
    if len(frame) == 0:
        return 0.0, 0.0, 0.0

    frame_norm = frame - np.mean(frame)
    energy = np.sum(frame_norm ** 2)
    if energy < 1e-6:
        return 0.0, 0.0, 0.0

    corr = scipy.signal.correlate(frame_norm, frame_norm, mode="full")
    corr = corr[len(frame_norm) - 1:]

    min_lag = int(sample_rate / PITCH_MAX_HZ)
    max_lag = int(sample_rate / PITCH_MIN_HZ)

    if max_lag >= len(corr) or min_lag >= max_lag:
        return 0.0, 0.0, 0.0

    lag_window = corr[min_lag:max_lag]
    peaks, props = scipy.signal.find_peaks(lag_window, height=energy * 0.25, distance=int(sample_rate / 350))

    if len(peaks) == 0:
        return 0.0, 0.0, 0.0

    sorted_peaks = sorted(peaks, key=lambda p: lag_window[p], reverse=True)
    primary_lag = sorted_peaks[0] + min_lag
    primary_conf = float(corr[primary_lag] / energy)

    secondary_conf = 0.0
    if len(sorted_peaks) > 1:
        sec_lag = sorted_peaks[1] + min_lag
        # Check if secondary peak is not just a harmonic (multiple) of primary
        ratio = max(primary_lag, sec_lag) / min(primary_lag, sec_lag)
        if not (1.85 <= ratio <= 2.15 or 2.85 <= ratio <= 3.15):
            secondary_conf = float(corr[sec_lag] / energy)

    if primary_conf < 0.35:
        return 0.0, primary_conf, secondary_conf

    f0 = float(sample_rate / primary_lag)
    return f0, primary_conf, secondary_conf


def detect_multiple_speakers(voiced_pitches: np.ndarray, competing_frame_count: int, total_voiced: int) -> Tuple[bool, int, float]:
    """
    Analyzes voiced pitch distribution to detect two distinct speakers.
    """
    if len(voiced_pitches) < 15:
        return False, 1, 0.0

    # Histogram peak detection
    bins = np.arange(PITCH_MIN_HZ, PITCH_MAX_HZ + 15, 12.0)
    counts, bin_edges = np.histogram(voiced_pitches, bins=bins)
    smooth_counts = scipy.ndimage.gaussian_filter1d(counts.astype(float), sigma=1.0)
    bin_centers = 0.5 * (bin_edges[:-1] + bin_edges[1:])

    # Find peaks with at least 12% of total voiced frames
    peak_indices, _ = scipy.signal.find_peaks(smooth_counts, height=len(voiced_pitches) * 0.12, distance=3)

    if len(peak_indices) >= 2:
        peak_freqs = bin_centers[peak_indices]
        # Sort by peak count
        sorted_indices = sorted(peak_indices, key=lambda idx: smooth_counts[idx], reverse=True)
        f1 = bin_centers[sorted_indices[0]]
        f2 = bin_centers[sorted_indices[1]]
        freq_diff = abs(f1 - f2)

        c1 = smooth_counts[sorted_indices[0]]
        c2 = smooth_counts[sorted_indices[1]]
        ratio = min(c1, c2) / max(1e-5, max(c1, c2))

        variance_score = round(float(freq_diff / 100.0 + ratio), 2)

        if freq_diff >= MIN_PEAK_SEPARATION_HZ and ratio >= MIN_SECONDARY_SPEAKER_RATIO:
            return True, 2, variance_score

    # Check for significant simultaneous overlapping competing speech frames
    if total_voiced > 0 and (competing_frame_count / total_voiced) >= 0.22:
        return True, 2, round(float(competing_frame_count / total_voiced), 2)

    return False, 1, 0.0


def analyze_audio_integrity(wav_path: str) -> Dict[str, Any]:
    """
    Performs acoustic analysis to detect:
    1. Multiple distinct speakers / simultaneous talking
    2. Severe background noise / continuous interference
    """
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    try:
        samples, sr = read_wav_samples(wav_path)
        total_duration = len(samples) / float(sr)

        if total_duration < 1.0 or len(samples) < sr:
            return {
                "violationDetected": False,
                "violationType": None,
                "warningMessage": None,
                "terminateInterview": False,
                "timestamp": now_iso,
                "metrics": {
                    "durationSeconds": round(total_duration, 2),
                    "estimatedSpeakers": 1,
                    "snrDb": 25.0,
                    "backgroundNoiseLevel": 0.01,
                    "voiceVarianceScore": 0.1
                }
            }

        frame_size = int(sr * 0.030)
        hop_size = int(sr * 0.015)
        num_frames = (len(samples) - frame_size) // hop_size

        frame_energies = []
        frame_pitches = []
        frame_confidences = []
        competing_frames = 0

        for i in range(num_frames):
            idx = i * hop_size
            frame = samples[idx:idx + frame_size] * np.hamming(frame_size)
            rms = np.sqrt(np.mean(frame ** 2))
            frame_energies.append(rms)

            f0, primary_conf, sec_conf = estimate_pitch_autocorr(frame, sr)
            frame_pitches.append(f0)
            frame_confidences.append(primary_conf)

            if primary_conf > 0.45 and sec_conf > 0.35:
                competing_frames += 1

        frame_energies = np.array(frame_energies)
        frame_pitches = np.array(frame_pitches)
        frame_confidences = np.array(frame_confidences)

        # -----------------------------------------------------
        # 1. NOISE & SNR ANALYSIS
        # -----------------------------------------------------
        unvoiced_mask = (frame_pitches == 0.0) | (frame_confidences < 0.30)
        unvoiced_energies = frame_energies[unvoiced_mask]
        voiced_energies = frame_energies[~unvoiced_mask]

        if len(unvoiced_energies) > 0:
            noise_floor_rms = float(np.percentile(unvoiced_energies, 50))
        else:
            noise_floor_rms = float(np.min(frame_energies)) * 0.05

        signal_peak_rms = float(np.percentile(voiced_energies, 85)) if len(voiced_energies) > 0 else float(np.percentile(frame_energies, 85))

        snr_db = 20.0 * np.log10(max(1e-5, signal_peak_rms) / max(1e-5, noise_floor_rms))
        snr_db = max(0.0, min(60.0, float(snr_db)))

        high_noise_unvoiced = np.sum((frame_energies > MAX_NOISE_FLOOR_RMS) & unvoiced_mask)
        noise_ratio = high_noise_unvoiced / max(1, len(frame_energies))

        # Check if the entire recording is dominated by non-speech noise
        is_pure_noise = (len(unvoiced_energies) / max(1, len(frame_energies)) > 0.75) and (noise_floor_rms > 0.08)

        is_excessive_noise = (
            is_pure_noise or
            (snr_db < MIN_SNR_DB_THRESHOLD and noise_floor_rms > MAX_NOISE_FLOOR_RMS and noise_ratio > 0.15) or
            (noise_ratio > MIN_NOISE_DURATION_RATIO and noise_floor_rms > 0.12)
        )

        # -----------------------------------------------------
        # 2. MULTI-SPEAKER DETECTION
        # -----------------------------------------------------
        voiced_mask = (frame_pitches >= PITCH_MIN_HZ) & (frame_pitches <= PITCH_MAX_HZ) & (frame_confidences > 0.40)
        voiced_pitches = frame_pitches[voiced_mask]

        is_multi_speaker, estimated_speakers, voice_var_score = detect_multiple_speakers(
            voiced_pitches, competing_frames, len(voiced_pitches)
        )

        # -----------------------------------------------------
        # 3. DECISION
        # -----------------------------------------------------
        if is_multi_speaker:
            return {
                "violationDetected": True,
                "violationType": "MULTIPLE_VOICES",
                "warningMessage": "Warning: Multiple voices detected in your audio. Interviews must be completed independently in a private environment.",
                "terminateInterview": True,
                "timestamp": now_iso,
                "metrics": {
                    "durationSeconds": round(total_duration, 2),
                    "estimatedSpeakers": estimated_speakers,
                    "snrDb": round(snr_db, 1),
                    "backgroundNoiseLevel": round(noise_floor_rms, 3),
                    "voiceVarianceScore": voice_var_score,
                    "noiseRatio": round(noise_ratio, 2)
                }
            }

        if is_excessive_noise:
            return {
                "violationDetected": True,
                "violationType": "EXCESSIVE_NOISE",
                "warningMessage": "Warning: Excessive background noise detected. Please ensure you are in a quiet room free from loud continuous interference.",
                "terminateInterview": True,
                "timestamp": now_iso,
                "metrics": {
                    "durationSeconds": round(total_duration, 2),
                    "estimatedSpeakers": 1,
                    "snrDb": round(snr_db, 1),
                    "backgroundNoiseLevel": round(noise_floor_rms, 3),
                    "voiceVarianceScore": voice_var_score,
                    "noiseRatio": round(noise_ratio, 2)
                }
            }

        return {
            "violationDetected": False,
            "violationType": None,
            "warningMessage": None,
            "terminateInterview": False,
            "timestamp": now_iso,
            "metrics": {
                "durationSeconds": round(total_duration, 2),
                "estimatedSpeakers": 1,
                "snrDb": round(snr_db, 1),
                "backgroundNoiseLevel": round(noise_floor_rms, 3),
                "voiceVarianceScore": voice_var_score,
                "noiseRatio": round(noise_ratio, 2)
            }
        }

    except Exception as e:
        print(f"Audio integrity analysis error: {e}")
        return {
            "violationDetected": False,
            "violationType": None,
            "warningMessage": None,
            "terminateInterview": False,
            "timestamp": now_iso,
            "error": str(e),
            "metrics": {
                "estimatedSpeakers": 1,
                "snrDb": 30.0,
                "backgroundNoiseLevel": 0.01,
                "voiceVarianceScore": 0.0
            }
        }
