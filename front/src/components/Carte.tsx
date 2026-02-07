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

    const [asideFolded, setAsideFolded] = useState(true);

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
                        " © Contributeurs d'OpenStreetMap  | Energy Explorer",
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

            <aside
                className={clsx(
                    "transition-all absolute top-6 left-6 bg-white/60 p-8 rounded-lg backdrop-blur-xs md:h-[95vh] w-[90vw] sm:max-w-sm",
                    {
                        "h-26 md:block overflow-hidden": asideFolded,
                        "h-[95vh]": !asideFolded,
                    },
                )}
            >
                <div className="flex justify-between w-full items-center">
                    <div className="flex gap-4 items-center">
                        <img
                            src="/image/logo-chayma.png"
                            alt="Energy Explorer Logo"
                            className="mb-2 h-10"
                        />
                        <h1 className="text-lg font-bold mb-2">
                            Energy Explorer
                        </h1>
                    </div>

                    <svg
                        viewBox="0 0 48 48"
                        xmlns="http://www.w3.org/2000/svg"
                        className={clsx(
                            "h-6 w-6 text-black/50 hover:cursor-pointer md:hidden",
                            {},
                        )}
                        onClick={() => setAsideFolded(!asideFolded)}
                    >
                        <path
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="4"
                            d="M7.95 11.95h32m-32 12h32m-32 12h32"
                        />
                    </svg>
                </div>
                <p
                    className={clsx(
                        { hidden: asideFolded },
                        "text-xs text-black/50",
                    )}
                >
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
                        Soleil
                    </button>
                </div>
            </aside>
        </div>
    );
}

export default Carte;
