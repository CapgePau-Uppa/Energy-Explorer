#!/usr/bin/env bash

echo "####################################################################"
echo "# SCRIPT DE CONVERSION GDAL POUR LES DATASETS SOLAIRES ET ÉOLIENS. #"
echo "####################################################################"

set -euo pipefail

COLOR_MAP="solar_color.txt"
MIN_ZOOM=1
MAX_ZOOM=10

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <input_geotiff>"
  exit 1
fi

if [ ! -f "$1" ]; then
  echo "Erreur : le fichier d'entrée '$1' est introuvable."
  exit 1
fi

if [ ! -f "$COLOR_MAP" ]; then
  echo "Erreur : le fichier de color-map '$COLOR_MAP' est introuvable."
  exit 1
fi

INPUT="$1"
NAME="${INPUT%.*}"



gdal raster color-map \
  --color-map "$COLOR_MAP" \
  --add-alpha \
  "$INPUT" "${NAME}.colored.tif"

gdal raster reproject \
  --dst-crs EPSG:3857 \
  --resampling bilinear \
  "${NAME}.colored.tif" "${NAME}.3857.tif"

gdal raster tile \
  --min-zoom "$MIN_ZOOM" \
  --max-zoom "$MAX_ZOOM" \
  --skip-blank \
  "${NAME}.3857.tif" "tiles/$(basename "$NAME")/"
