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
                pitch={0}
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
            <aside
                className={clsx(
                    "grid grid-cols-2 transition-all absolute bottom-16 sm:bottom-12 right-6 gap-1",
                )}
            >
                <div
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer"
                    onClick={() => {
                        console.log("Geolocating user...");
                        /* Geolocate */
                        const location = window.navigator.geolocation;
                        if (location) {
                            console.log("Requesting current position...");
                            location.getCurrentPosition(
                                (position) => {
                                    console.log("Position obtained:", position);
                                    const { latitude, longitude } =
                                        position.coords;
                                    const map = mapRef.current;
                                    if (map) {
                                        map.easeTo({
                                            center: [longitude, latitude],
                                            zoom: 12,
                                            duration: 1000,
                                        });
                                    }
                                },
                                (error) => {
                                    console.error(
                                        "Error obtaining geolocation:",
                                        error,
                                    );
                                    alert(
                                        "Impossible d'obtenir votre position.",
                                    );
                                },
                                {
                                    enableHighAccuracy: true,
                                    timeout: 10000,
                                    maximumAge: 0,
                                },
                            );
                        } else {
                            alert(
                                "Géolocalisation non supportée par ce navigateur.",
                            );
                        }
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <g
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                        >
                            <path d="M2 12h3m14 0h3M12 2v3m0 14v3" />
                            <circle cx="12" cy="12" r="7" />
                        </g>
                    </svg>
                </div>
                <div
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer"
                    onClick={() => {
                        // Rotation vers le nord
                        const map = mapRef.current;
                        if (map) {
                            map.easeTo({
                                bearing: 0,
                                duration: 500,
                            });
                        }
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 56 56"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            fill="currentColor"
                            d="M11.992 52.375c1.172 0 1.922-.422 3.07-1.547l12.61-12.492c.117-.117.21-.211.328-.211c.117 0 .211.094.328.21l12.61 12.493c1.148 1.125 1.898 1.547 3.07 1.547c1.57 0 2.554-1.219 2.554-2.812c0-.891-.374-1.946-.726-2.907L31.188 6.625c-.75-2.062-1.852-3-3.188-3s-2.437.938-3.187 3L10.164 46.656c-.351.961-.726 2.016-.726 2.907c0 1.593.984 2.812 2.554 2.812"
                        />
                    </svg>
                </div>
                <div
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer"
                    onClick={() => {
                        // Rotation à droite
                        const map = mapRef.current;
                        if (map) {
                            map.easeTo({
                                bearing: map.getBearing() + 30,
                                duration: 500,
                            });
                        }
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            fill="currentColor"
                            d="M13.05 22v-2.05q.85-.125 1.663-.45t1.537-.85l1.4 1.45q-1.05.8-2.2 1.287t-2.4.613m-2 0q-3.45-.45-5.725-2.988T3.05 13.05q0-1.875.713-3.512t1.925-2.85t2.85-1.925t3.512-.713h.15L10.65 2.5l1.4-1.45l4 4l-4 4l-1.4-1.4l1.6-1.6h-.2q-2.925 0-4.962 2.038T5.05 13.05q0 2.6 1.7 4.563t4.3 2.337zm8.05-3.35l-1.45-1.4q.525-.725.85-1.537t.45-1.663H21q-.125 1.25-.612 2.4t-1.288 2.2m1.9-6.6h-2.05q-.125-.85-.45-1.662t-.85-1.538l1.45-1.4q.8.975 1.275 2.15T21 12.05"
                        />
                    </svg>
                </div>
                <div
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer"
                    onClick={() => {
                        // Rotation à gauche
                        const map = mapRef.current;
                        if (map) {
                            map.easeTo({
                                bearing: map.getBearing() - 30,
                                duration: 500,
                            });
                        }
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            fill="currentColor"
                            d="M11 22q-1.25-.125-2.4-.612T6.4 20.1l1.4-1.45q.725.525 1.538.85t1.662.45zm2 0v-2.05q2.6-.375 4.3-2.337T19 13.05q0-2.925-2.037-4.962T12 6.05h-.2l1.6 1.6l-1.4 1.4l-4-4l4-4l1.4 1.45l-1.55 1.55H12q1.875 0 3.513.713t2.85 1.925t1.925 2.85T21 13.05q0 3.425-2.275 5.963T13 22m-8.05-3.35q-.8-1.05-1.288-2.2t-.612-2.4H5.1q.125.85.45 1.663t.85 1.537zm-1.9-6.6q.15-1.275.625-2.45T4.95 7.45l1.45 1.4q-.525.725-.85 1.538T5.1 12.05z"
                        />
                    </svg>
                </div>
                <div
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer"
                    onClick={() => {
                        const map = mapRef.current;
                        if (map) {
                            map.easeTo({
                                zoom: map.getZoom() + 0.6,
                                duration: 500,
                            });
                        }
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            fill="currentColor"
                            d="M13 6a1 1 0 1 0-2 0v5H6a1 1 0 1 0 0 2h5v5a1 1 0 1 0 2 0v-5h5a1 1 0 1 0 0-2h-5z"
                        />
                    </svg>
                </div>
                <div
                    onClick={() => {
                        const map = mapRef.current;
                        if (map) {
                            map.easeTo({
                                zoom: map.getZoom() - 0.6,
                                duration: 500,
                            });
                        }
                    }}
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            fill="none"
                            stroke="currentColor"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 12h14"
                        />
                    </svg>
                </div>
            </aside>
        </div>
    );
}

export default Carte;
