import rasterio
import numpy as np
from os import getenv

print("Chargement des datasets...")
dataset_solar = rasterio.open(getenv("SOLAR_DATASET_PATH", '../temp/solar.tif'))
dataset_wind = rasterio.open(getenv("WIND_DATASET_PATH", '../temp/wind.tif'))

data_solar = dataset_solar.read(1)
data_wind = dataset_wind.read(1)

SOLAR_MIN = 1.6
WIND_MIN = 2.0

valid_indices_solar = np.argwhere(data_solar > SOLAR_MIN)
valid_indices_wind = np.argwhere(data_wind > WIND_MIN)
