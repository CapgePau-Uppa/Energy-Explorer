import rasterio
import numpy as np
from os import getenv

print("Chargement des datasets...")
dataset_solar = rasterio.open(
    getenv("SOLAR_DATASET_PATH", '../temp/solar.tif'))
dataset_wind = rasterio.open(getenv("WIND_DATASET_PATH", '../temp/wind.tif'))

data_solar = dataset_solar.read(1)
data_wind = dataset_wind.read(1)

SOLAR_MIN = 1.6
WIND_MIN = 2.0

SCORE_WINDOW_DEG = 6  # ±10 degree neighborhood for regional scoring

valid_indices_solar = np.argwhere(data_solar > SOLAR_MIN)
valid_indices_wind = np.argwhere(data_wind > WIND_MIN)


def compute_regional_score(lat, lon, value, data, dataset, window_deg=SCORE_WINDOW_DEG):
    row, col = dataset.index(lon, lat)
    window_px = int(round(window_deg / abs(dataset.res[0])))

    row_start = max(0, row - window_px)
    row_end = min(data.shape[0], row + window_px + 1)
    col_start = max(0, col - window_px)
    col_end = min(data.shape[1], col + window_px + 1)

    window = data[row_start:row_end, col_start:col_end]
    valid = window[window > 0]

    if len(valid) == 0:
        return 40, 50.0, lat, lon, value

    # Percentile math
    percentile_rank = float(np.sum(valid <= value) / len(valid) * 100)

    if percentile_rank >= 80:
        score = 100
    elif percentile_rank <= 20:
        score = -20
    else:
        score = round(-20 + (percentile_rank - 20) / 60 * 120)

    best_idx = np.nanargmax(window)
    best_row_local, best_col_local = np.unravel_index(best_idx, window.shape)
    best_x, best_y = dataset.xy(
        int(row_start + best_row_local), int(col_start + best_col_local))
    best_value = float(window[best_row_local, best_col_local])

    return score, percentile_rank, float(best_y), float(best_x), best_value
