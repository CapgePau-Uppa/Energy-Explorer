import { fromUrl } from "geotiff";

const urlGeoTiffSolar =
    import.meta.env.PUBLIC_SOLAR_GEOTIFF ||
    "https://cdn.julienc.me/ter/solar.geotiff";
const urlGeoTiffWind =
    import.meta.env.PUBLIC_WIND_GEOTIFF ||
    "https://cdn.julienc.me/ter/wind.geotiff";

/**
 * Returns the pixel value of a Cloud Optimized GeoTIFF at the given coordinates.
 * Only the required tile is fetched thanks to HTTP Range requests.
 *
 * Assumes the raster CRS is EPSG:4326 (geographic, lon/lat).
 *
 * @param url  - URL of the COG file
 * @param lat  - Latitude  (–90  … +90)
 * @param lon  - Longitude (–180 … +180)
 * @returns The raster value, or `null` when the point lies outside the extent
 */
async function getValueFromCOG(
    url: string,
    lat: number,
    lon: number,
): Promise<number | null> {
    const tiff = await fromUrl(url);
    const image = await tiff.getImage();

    // bbox = [minLon, minLat, maxLon, maxLat] for EPSG:4326
    const [minX, minY, maxX, maxY] = image.getBoundingBox();
    const width = image.getWidth();
    const height = image.getHeight();

    if (lon < minX || lon > maxX || lat < minY || lat > maxY) {
        console.warn(`(${lat}, ${lon}) is outside the raster extent.`);
        return null;
    }

    // Convert geographic coordinates to pixel indices
    const pixelX = Math.floor(((lon - minX) / (maxX - minX)) * width);
    const pixelY = Math.floor(((maxY - lat) / (maxY - minY)) * height);

    // Read a single pixel window – COG serves only the matching tile/overview
    const [data] = await image.readRasters({
        window: [pixelX, pixelY, pixelX + 1, pixelY + 1],
    });

    return (data as number[])[0] ?? null;
}

/**
 * Returns the solar radiation value (W/m²) for the given coordinates.
 */
export async function getSolarValue(
    lat: number,
    lon: number,
): Promise<number | null> {
    return getValueFromCOG(urlGeoTiffSolar, lat, lon);
}

/**
 * Returns the wind speed value (m/s) for the given coordinates.
 */
export async function getWindValue(
    lat: number,
    lon: number,
): Promise<number | null> {
    return getValueFromCOG(urlGeoTiffWind, lat, lon);
}
