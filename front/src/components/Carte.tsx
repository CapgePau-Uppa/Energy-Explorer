import { useState, useRef, useEffect } from "react";
import MapLibre, { Layer, Source, type MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import clsx from "clsx";

function Carte({ children }: { children?: React.ReactNode }) {
    const mapRef = useRef<MapRef>(null);
    const [SelectedLayer, SetSelectedLayer] = useState<
        "default" | "wind" | "solar"
    >("default");

    const [viewState, setViewState] = useState({
        longitude: 0,
        latitude: 46.71,
        zoom: 5,
    });

    // Register PMTiles protocol BEFORE map loads
    useEffect(() => {
        const protocol = new Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile);

        // Cleanup when component unmounts
        return () => {
            maplibregl.removeProtocol("pmtiles");
        };
    }, []);

    const handleLoad = () => {
        const map = mapRef.current?.getMap();

        if (map) {
            // Loop through all symbol layers to set French language
            map.getStyle().layers.forEach((layer) => {
                if (layer.type === "symbol" && layer.layout?.["text-field"]) {
                    map.setLayoutProperty(layer.id, "text-field", [
                        "coalesce",
                        ["get", "name:fr"],
                        ["get", "name"],
                    ]);
                }
            });
        }
    };

    return (
        <div className="h-full">
            <MapLibre
                attributionControl={{
                    customAttribution:
                        " © OpenStreetMap contributeurs | Energy Explorer",
                    compact: true,
                }}
                ref={mapRef}
                onLoad={handleLoad}
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                style={{ width: "100%", height: "100%" }}
                mapStyle="/map/style.json" // Set directly, not conditionally
                onClick={(evt) => {
                    const { lngLat } = evt;
                    alert(
                        `Clicked at Longitude: ${lngLat.lng}, Latitude: ${lngLat.lat}`,
                    );
                }}
                //mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
            >
                <Source
                    type="raster"
                    tiles={["https://cdn1.julienc.me/{z}/{x}/{y}.png"]}
                >
                    {SelectedLayer === "wind" && (
                        <Layer
                            id="raster-layer"
                            type="raster"
                            paint={{
                                "raster-opacity": 0.8,
                            }}
                        />
                    )}
                </Source>
                {children}
            </MapLibre>

            <aside className="absolute top-6 left-6 bg-white/60 p-8 rounded-lg backdrop-blur-xs h-[95vh] w-sm">
                <img
                    src="/image/energy-explorer.svg"
                    alt="Energy Explorer Logo"
                    className="mb-2 w-32"
                />
                <p className="text-xs text-black/50">
                    Bienvenue ! Cette application interactive vous permet
                    d'explorer les potentiels énergétiques (soleil et vent).
                </p>

                <h2 className="mt-6 mb-1 text-lg font-semibold">
                    Infos debug :
                </h2>
                <p className="text-sm">
                    Longitude: {viewState.longitude.toFixed(4)} | Latitude:{" "}
                    {viewState.latitude.toFixed(4)} | Zoom:{" "}
                    {viewState.zoom.toFixed(2)}
                </p>

                <h2 className="mt-6 mb-1 text-lg font-semibold">
                    Couches d'énergie
                </h2>
                <div className="text-sm flex w-full bg-white/60 p-2 rounded-sm">
                    <button
                        className={clsx(
                            "mr-2 px-4 py-2 rounded-lg w-full transition-all hover:cursor-pointer",
                            {
                                "bg-neutral-800 text-white":
                                    SelectedLayer === "default",
                                "bg-transparent": SelectedLayer !== "default",
                            },
                        )}
                        onClick={() => SetSelectedLayer("default")}
                    >
                        Default
                    </button>
                    <button
                        onClick={() => SetSelectedLayer("wind")}
                        className={clsx(
                            "mr-2 px-4 rounded-sm w-full transition-all hover:cursor-pointer",
                            {
                                "bg-neutral-800 text-white":
                                    SelectedLayer === "wind",
                                "bg-transparent": SelectedLayer !== "wind",
                            },
                        )}
                    >
                        Vent
                    </button>
                    <button
                        onClick={() => SetSelectedLayer("solar")}
                        className={clsx(
                            "px-4  rounded w-full transition-all hover:cursor-pointer",
                            {
                                "bg-neutral-800 text-white":
                                    SelectedLayer === "solar",
                                "bg-transparent": SelectedLayer !== "solar",
                            },
                        )}
                    >
                        Ensoleillement
                    </button>
                </div>
            </aside>
        </div>
    );
}

export default Carte;
