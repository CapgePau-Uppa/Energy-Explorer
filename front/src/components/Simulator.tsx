import { useState, useEffect, useRef } from "react";
import MapLibre, {
    Marker,
    Source,
    Layer,
    type MapLayerMouseEvent,
    type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import clsx from "clsx";
import type { Project, Revenu, Viability } from "./types";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from "recharts";

const SOLAR_PANEL_UNIT_AREA = 2.56; // m² per amerisolar panel
const WIND_TURBINE_TYPES = [
    "Rutland 1200",
    "Aeolos-V 1 kW",
    "Antaris 3.5 kW",
    "Antaris 7.5 kW",
];

function formatEnergyKwh(value: number): string {
    if (value >= 1000000) {
        return (value / 1000000).toFixed(2) + " GWh";
    }
    if (value >= 1000) {
        return (value / 1000).toFixed(2) + " MWh";
    }
    if (value >= 1) {
        return value.toFixed(2) + " kWh";
    }
    return value * 1000 + " Wh";
}

function SimulatorEnergy({ children }: { children?: React.ReactNode }) {
    const projectId = new URLSearchParams(window.location.search).get("id");
    const [Loading, setLoading] = useState(false);
    const [Data, setData] = useState<Project | null>(null);
    const [Revenu, setRevenu] = useState<Revenu | null>(null);
    const [viability, setViability] = useState<Viability | null>(null);
    const [asideFolded, setAsideFolded] = useState(true);
    const [errorMessage, setError] = useState<string | null>(null);

    const [placementMode, setPlacementMode] = useState<
        "solar" | "wind" | null
    >(null);
    const [pendingLatLng, setPendingLatLng] = useState<{
        lat: number;
        lng: number;
    } | null>(null);
    const [solarPanelCount, setSolarPanelCount] = useState(1);
    const [windTurbineType, setWindTurbineType] = useState(
        WIND_TURBINE_TYPES[0],
    );
    const [submitting, setSubmitting] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(true);
    const [viabilityOpen, setViabilityOpen] = useState(true);

    console.log("Project ID:", projectId);

    const reloadProject = () => {
        if (!projectId) return;
        fetch(
            `${import.meta.env.PUBLIC_BACKEND_SERVER}/simulator/project/${projectId}`,
        )
            .then((r) => r.json())
            .then((data) => setData(data));
        fetch(
            `${import.meta.env.PUBLIC_BACKEND_SERVER}/simulator/project/${projectId}/estimate`,
        )
            .then((r) => r.json())
            .then((data) => setRevenu(data));
        fetch(
            `${import.meta.env.PUBLIC_BACKEND_SERVER}/simulator/project/${projectId}/viability`,
        )
            .then((r) => r.json())
            .then((data) => setViability(data));
    };

    useEffect(() => {
        setLoading(true);
        if (!projectId) {
            setError("No project ID provided in the URL.");
            setLoading(false);
        } else {
            fetch(
                `${import.meta.env.PUBLIC_BACKEND_SERVER}/simulator/project/${projectId}`,
            )
                .then((response) => {
                    if (!response.ok) {
                        setError(
                            `Error fetching project data: ${response.statusText}. May be the project ID is invalid?`,
                        );
                        throw new Error(
                            `Error fetching project data. May be the project ID is invalid? Status`,
                        );
                    }
                    return response.json();
                })
                .then((data) => {
                    setData(data);
                    setLoading(false);

                    // Fetch revenue data
                    return fetch(
                        `${import.meta.env.PUBLIC_BACKEND_SERVER}/simulator/project/${projectId}/estimate`,
                    );
                })
                .then((response) => {
                    if (!response.ok) {
                        setError(
                            `Error fetching revenue data: ${response.statusText}. May be the project ID is invalid?`,
                        );
                        throw new Error(
                            `Error fetching revenue data. May be the project ID is invalid? Status: ${response.status}`,
                        );
                    }
                    return response.json();
                })
                .then((revenueData) => {
                    setRevenu(revenueData);
                    return fetch(
                        `${import.meta.env.PUBLIC_BACKEND_SERVER}/simulator/project/${projectId}/viability`,
                    );
                })
                .then((response) => response.json())
                .then((viabilityData) => {
                    setViability(viabilityData);
                    setLoading(false);
                })
                .catch((err) => {
                    setError(err.message);
                    setLoading(false);
                });
        }
    }, []);

    // Escape key cancels placement mode and closes modal
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setPlacementMode(null);
                setPendingLatLng(null);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    // Update map cursor when placement mode changes
    useEffect(() => {
        const canvas = mapRef.current?.getMap()?.getCanvas();
        if (canvas) canvas.style.cursor = placementMode ? "crosshair" : "";
    }, [placementMode]);

    console.log("Project Data:", Data);
    console.log("Revenue Data:", Revenu);

    const mapRef = useRef<MapRef>(null);
    const handleLoad = () => {
        const map = mapRef.current?.getMap();

        if (map) {
            map.getStyle().layers.forEach((layer) => {
                if (layer.type === "symbol" && layer.layout?.["text-field"]) {
                    map.setLayoutProperty(layer.id, "text-field", [
                        "coalesce",
                        ["get", "name:fr"],
                        ["get", "name"],
                    ]);
                }
            });
            if (placementMode) map.getCanvas().style.cursor = "crosshair";
        }
    };

    const handleMapClick = (e: MapLayerMouseEvent) => {
        if (!placementMode) return;
        setPendingLatLng({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };

    const handleConfirm = async () => {
        if (!pendingLatLng || !projectId || !placementMode) return;
        setSubmitting(true);
        try {
            if (placementMode === "solar") {
                const res = await fetch(
                    `${import.meta.env.PUBLIC_BACKEND_SERVER}/simulator/project/${projectId}/solar`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            latitude: pendingLatLng.lat,
                            longitude: pendingLatLng.lng,
                            surface_area:
                                solarPanelCount * SOLAR_PANEL_UNIT_AREA,
                            panel_type: "amerisolar",
                        }),
                    },
                );
                if (!res.ok) throw new Error(await res.text());
            } else {
                const res = await fetch(
                    `${import.meta.env.PUBLIC_BACKEND_SERVER}/simulator/project/${projectId}/wind`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            latitude: pendingLatLng.lat,
                            longitude: pendingLatLng.lng,
                            turbine_type: windTurbineType,
                        }),
                    },
                );
                if (!res.ok) throw new Error(await res.text());
            }
            setPendingLatLng(null);
            setSolarPanelCount(1);
            reloadProject();
        } catch (err) {
            console.error("Failed to add installation:", err);
        } finally {
            setSubmitting(false);
        }
    };

    const deleteSolarPanel = async (panelId: number) => {
        if (!projectId) return;
        await fetch(
            `${import.meta.env.PUBLIC_BACKEND_SERVER}/simulator/project/${projectId}/solar/${panelId}`,
            { method: "DELETE" },
        );
        reloadProject();
    };

    const deleteWindTurbine = async (turbineId: number) => {
        if (!projectId) return;
        await fetch(
            `${import.meta.env.PUBLIC_BACKEND_SERVER}/simulator/project/${projectId}/wind/${turbineId}`,
            { method: "DELETE" },
        );
        reloadProject();
    };

    const cancelModal = () => {
        setPendingLatLng(null);
    };

    const togglePlacementMode = (mode: "solar" | "wind") => {
        setPlacementMode((prev) => (prev === mode ? null : mode));
        setPendingLatLng(null);
    };

    if (errorMessage) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-red-500 text-lg">{errorMessage}</p>
            </div>
        );
    }
    if (Loading || !Data || !Revenu) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-gray-800 text-md animate-bounce">
                    Chargement en cours...
                </p>
            </div>
        );
    }
    return (
        <div className="h-screen w-full">
            <MapLibre
                attributionControl={{
                    customAttribution: "Energy Explorer",
                    compact: true,
                }}
                ref={mapRef}
                onLoad={handleLoad}
                style={{ width: "100%", height: "100vh" }}
                mapStyle="/map/style.json"
                initialViewState={{
                    latitude: 46.71,
                    longitude: 4,
                    zoom: 5.25,
                    pitch: 0,
                    bearing: 0,
                }}
                maxBounds={[
                    [-11.381836, 39.67337],
                    [16.787109, 52.160455],
                ]}
                onClick={handleMapClick}
            >
                {Data.solar_panels.map((panel) => (
                    <Marker
                        key={`solar-${panel.id}`}
                        longitude={panel.longitude}
                        latitude={panel.latitude}
                        anchor="bottom"
                    >
                        <div className="p-2 rounded-full bg-yellow-500">
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 256 256"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    fill="currentColor"
                                    d="M32 104a8 8 0 0 1 8-8h16a8 8 0 0 1 0 16H40a8 8 0 0 1-8-8m39.43-45.25a8 8 0 0 0 11.32-11.32L71.43 36.12a8 8 0 0 0-11.31 11.31ZM128 40a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v16a8 8 0 0 0 8 8m50.91 21.09a8 8 0 0 0 5.66-2.34l11.31-11.32a8 8 0 0 0-11.31-11.31l-11.32 11.31a8 8 0 0 0 5.66 13.66M192 104a8 8 0 0 0 8 8h16a8 8 0 0 0 0-16h-16a8 8 0 0 0-8 8m-104 8a8 8 0 0 0 8-8a32 32 0 0 1 64 0a8 8 0 0 0 16 0a48 48 0 0 0-96 0a8 8 0 0 0 8 8m55.2 24h-30.4a4 4 0 0 0-3.91 3.15L102.62 168h50.76l-6.27-28.85a4 4 0 0 0-3.91-3.15M31.75 186L17 212.06a8 8 0 0 0 1.16 9.45a8.22 8.22 0 0 0 6 2.49h46.69a4 4 0 0 0 3.91-3.15l8-36.85H35.23a4 4 0 0 0-3.48 2m207.21 26l-14.71-26a4 4 0 0 0-3.48-2h-47.54l8 36.85a4 4 0 0 0 3.91 3.15h46.62a8.22 8.22 0 0 0 6-2.49a8 8 0 0 0 1.24-9.45Zm-28.27-50l-12.42-22a8 8 0 0 0-7-4.06h-23.51a4 4 0 0 0-3.91 4.85l5.9 27.15h37.45a4 4 0 0 0 3.49-5.94M88.24 136H64.7a8 8 0 0 0-7 4.06L45.31 162a4 4 0 0 0 3.49 6h37.45l5.9-27.15a4 4 0 0 0-3.91-4.85m68.62 48H99.14l-7.64 35.15a4 4 0 0 0 3.91 4.85h65.18a4 4 0 0 0 3.91-4.85Z"
                                />
                            </svg>
                        </div>
                    </Marker>
                ))}
                {Data.wind_turbines.map((turbine) => (
                    <Marker
                        key={`turbine-${turbine.id}`}
                        longitude={turbine.longitude}
                        latitude={turbine.latitude}
                        anchor="bottom"
                    >
                        <div className="p-2 rounded-full bg-blue-300">
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 48 48"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <defs>
                                    <mask id="SVGf8Qy0dXC">
                                        <g fill="none">
                                            <path
                                                stroke="#fff"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="4"
                                                d="M24 30v14"
                                            />
                                            <path
                                                fill="#fff"
                                                stroke="#fff"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="4"
                                                d="M29 23c11 5 16 14 16 14s-12 0-21-8c-9 8-21 8-21 8s5-10 16-14c0-13 5-19 5-19s5 6 5 19"
                                            />
                                            <circle
                                                cx="24"
                                                cy="24"
                                                r="2"
                                                fill="#000"
                                            />
                                        </g>
                                    </mask>
                                </defs>
                                <path
                                    fill="currentColor"
                                    d="M0 0h48v48H0z"
                                    mask="url(#SVGf8Qy0dXC)"
                                />
                            </svg>
                        </div>
                    </Marker>
                ))}
                {children}
            </MapLibre>

            {/* Placement mode banner */}
            {placementMode && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-2 rounded-full backdrop-blur-sm pointer-events-none">
                    {placementMode === "solar"
                        ? "Cliquez sur la carte pour placer un panneau solaire"
                        : "Cliquez sur la carte pour placer une éolienne"}
                    {" — "}
                    <span className="opacity-60">Échap pour annuler</span>
                </div>
            )}

            {/* Add installation modal */}
            {pendingLatLng && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={cancelModal}
                >
                    <div
                        className="bg-white rounded-2xl p-6 w-[90vw] max-w-sm shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-bold mb-1">
                            {placementMode === "solar"
                                ? "Ajouter un panneau solaire"
                                : "Ajouter une éolienne"}
                        </h2>
                        <p className="text-xs text-black/40 mb-4">
                            {pendingLatLng.lat.toFixed(5)},{" "}
                            {pendingLatLng.lng.toFixed(5)}
                        </p>

                        {placementMode === "solar" && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-sm font-medium text-black/70 block mb-1">
                                        Type de panneau
                                    </label>
                                    <p className="text-sm bg-gray-100 rounded-lg px-3 py-2">
                                        Amerisolar (22.64 % de rendement)
                                    </p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-black/70 block mb-1">
                                        Nombre de panneaux
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={500}
                                        value={solarPanelCount}
                                        onChange={(e) =>
                                            setSolarPanelCount(
                                                Math.max(
                                                    1,
                                                    parseInt(e.target.value) ||
                                                        1,
                                                ),
                                            )
                                        }
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                    />
                                    <p className="text-xs text-black/40 mt-1">
                                        Surface totale :{" "}
                                        {(
                                            solarPanelCount *
                                            SOLAR_PANEL_UNIT_AREA
                                        ).toFixed(2)}{" "}
                                        m²
                                    </p>
                                </div>
                            </div>
                        )}

                        {placementMode === "wind" && (
                            <div>
                                <label className="text-sm font-medium text-black/70 block mb-1">
                                    Type d'éolienne
                                </label>
                                <select
                                    value={windTurbineType}
                                    onChange={(e) =>
                                        setWindTurbineType(e.target.value)
                                    }
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                                >
                                    {WIND_TURBINE_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="flex gap-2 mt-5">
                            <button
                                onClick={cancelModal}
                                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-black/60 hover:bg-gray-50 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={submitting}
                                className={clsx(
                                    "flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors",
                                    placementMode === "solar"
                                        ? "bg-yellow-500 hover:bg-yellow-600"
                                        : "bg-blue-400 hover:bg-blue-500",
                                    {
                                        "opacity-50 cursor-not-allowed":
                                            submitting,
                                    },
                                )}
                            >
                                {submitting ? "Ajout..." : "Confirmer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <aside
                className={clsx(
                    "flex flex-col transition-all absolute top-6 left-6 bg-white/60 p-8 rounded-lg backdrop-blur-xs  w-[90vw] sm:max-w-lg",
                    {
                        "h-30 md:block overflow-hidden": asideFolded,
                        "h-[95vh] overflow-y-auto": !asideFolded,
                    },
                )}
            >
                <div className="flex justify-between w-full items-center">
                    <a href="/" className="text-black/40 mb-1 text-xs">
                        Revenir à l'accueil
                    </a>

                    <svg
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                        className={clsx(
                            "h-6 w-6 text-black/50 hover:cursor-pointer",
                            {
                                "rotate-180": !asideFolded,
                            },
                        )}
                        onClick={() => setAsideFolded(!asideFolded)}
                    >
                        <path
                            fill="currentColor"
                            fill-rule="evenodd"
                            d="m6 7l6 6l6-6l2 2l-8 8l-8-8z"
                        />
                    </svg>
                </div>
                <img
                    src="/image/logo-v5.svg"
                    alt="Energy Explorer Logo"
                    className="mb-4 h-12 transition-all"
                />
                <h1 className="text-2xl font-bold mb-1">{Data.name}</h1>

                <p className="text-xs text-black/50 mt-1">
                    Ce simulateur ne fonctionne que pour la France
                    métropolitaine pour l'instant. Il considère la consommation
                    moyenne d'un foyer français (16 kWh par jour), le prix de
                    revente à 0.04€/kWh, et le prix d'achat à 0.1940€/kWh.
                </p>
                <h2 className="text-xl font-semibold mt-4 mb-2">
                    Résumé du projet
                </h2>
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white/50 p-4 rounded-lg flex flex-col items-center">
                        <p className="font-bold">{Data.solar_panels.length}</p>
                        <p className="text-xs text-black/30">
                            {Data.solar_panels.length > 1
                                ? "Panneaux solaires"
                                : "Panneau solaire"}
                        </p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg flex flex-col items-center">
                        <p className="font-bold">{Data.wind_turbines.length}</p>
                        <p className="text-xs text-black/30">
                            {Data.wind_turbines.length > 1
                                ? "Éoliennes"
                                : "Éolienne"}
                        </p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg flex flex-col items-center">
                        <p className="font-bold">
                            {formatEnergyKwh(Revenu.total_annual_kwh)}
                        </p>
                        <p className="text-xs text-black/30">
                            Production annuelle estimée
                        </p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg flex flex-col items-center">
                        <p className="font-bold">
                            {Revenu.total_cost.toFixed(0)} €
                        </p>
                        <p className="text-xs text-black/30">
                            Cout total estimé
                        </p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg flex flex-col items-center">
                        <p className="font-bold">
                            {viability?.annual_savings_eur?.toFixed(0) || 0} €
                        </p>
                        <p className="text-xs text-black/30">
                            Économies annuelles estimées
                        </p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg flex flex-col items-center">
                        <p className="font-bold">
                            {viability?.annual_grid_cost_eur?.toFixed(0) || 0} €
                        </p>
                        <p className="text-xs text-black/30">
                            Facture électrique annuelle estimée
                        </p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg flex flex-col items-center">
                        <p className="font-bold">
                            {viability?.daily_resell_kwh?.toFixed(0) || 0} kWh
                        </p>
                        <p className="text-xs text-black/30">
                            Énergie revendue au réseau par jour
                        </p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg flex flex-col items-center">
                        <p className="font-bold">
                            {viability?.daily_deficit_kwh?.toFixed(0) || 0} kWh
                        </p>
                        <p className="text-xs text-black/30">
                            Énergie achetée au réseau par jour
                        </p>
                    </div>
                    <div className="bg-white/50 p-4 rounded-lg flex flex-col items-center">
                        <p className="font-bold">
                            {viability?.daily_self_consumption_kwh?.toFixed(
                                0,
                            ) || 0}{" "}
                            kWh
                        </p>
                        <p className="text-xs text-black/30">
                            Énergie autoconsommée par jour
                        </p>
                    </div>
                </div>

                <button
                    className="flex items-center justify-between w-full mt-6 mb-2 hover:cursor-pointer"
                    onClick={() => setDetailsOpen((o) => !o)}
                >
                    <h2 className="text-xl font-semibold">
                        Détails des installations
                    </h2>
                    <svg
                        viewBox="0 0 24 24"
                        className={clsx(
                            "h-5 w-5 text-black/40 transition-transform",
                            { "rotate-180": detailsOpen },
                        )}
                    >
                        <path
                            fill="currentColor"
                            fillRule="evenodd"
                            d="m6 7l6 6l6-6l2 2l-8 8l-8-8z"
                        />
                    </svg>
                </button>
                {detailsOpen && (
                    <>
                        <h3 className="text-lg font-semibold mt-2">
                            Panneaux solaires
                        </h3>
                        <p className="text-xs text-black/50 mb-2">
                            {Revenu.solar_panels.length > 0
                                ? "Voici les détails de vos panneaux solaires."
                                : "Vous n'avez pas de panneaux solaires dans ce projet."}
                        </p>
                        {Revenu.solar_panels.map((panel) => (
                            <div
                                key={`rev-solar-${panel.id}`}
                                className="bg-white/50 p-3 rounded-lg mb-2 flex gap-3 items-start"
                            >
                                <div className="h-6 w-6 rounded-full bg-yellow-400 shrink-0"></div>
                                <div className="flex-1">
                                    <p className="font-medium tracking-tight">
                                        {panel.panel_type} -{" "}
                                        {panel.surface_area} m²
                                    </p>
                                    <p className="text-xs text-black/70">
                                        Production quotidienne estimée :{" "}
                                        {formatEnergyKwh(panel.daily_kwh)}
                                    </p>
                                    <p className="text-xs text-black/70">
                                        Cout : {panel.cost.toFixed(2)} €
                                    </p>
                                </div>
                                <button
                                    onClick={() => deleteSolarPanel(panel.id)}
                                    className="text-black/20 hover:text-red-400 transition-colors hover:cursor-pointer shrink-0"
                                >
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            fill="currentColor"
                                            d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
                                        />
                                    </svg>
                                </button>
                            </div>
                        ))}
                        <h3 className="text-lg font-semibold mt-4">
                            Éoliennes
                        </h3>
                        <p className="text-xs text-black/50 mb-2">
                            {Revenu.wind_turbines.length > 0
                                ? "Voici les détails de vos éoliennes."
                                : "Vous n'avez pas d'éoliennes dans ce projet."}
                        </p>
                        {Revenu.wind_turbines.map((turbine) => (
                            <div
                                key={`rev-turbine-${turbine.id}`}
                                className="bg-white/50 p-3 rounded-lg mb-2 flex gap-3 items-start"
                            >
                                <div className="h-6 w-6 rounded-full bg-gray-400 shrink-0"></div>
                                <div className="flex-1">
                                    <p className="font-medium tracking-tight">
                                        {turbine.turbine_type}
                                    </p>
                                    <p className="text-xs text-black/70">
                                        Production quotidienne estimée :{" "}
                                        {formatEnergyKwh(turbine.daily_kwh)}
                                    </p>
                                    <p className="text-xs text-black/70">
                                        Cout : {turbine.cost.toFixed(2)} €
                                    </p>
                                </div>
                                <button
                                    onClick={() =>
                                        deleteWindTurbine(turbine.id)
                                    }
                                    className="text-black/20 hover:text-red-400 transition-colors hover:cursor-pointer shrink-0"
                                >
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            fill="currentColor"
                                            d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
                                        />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </>
                )}

                {viability && (
                    <>
                        <button
                            className="flex items-center justify-between w-full mt-6 mb-1 hover:cursor-pointer"
                            onClick={() => setViabilityOpen((o) => !o)}
                        >
                            <h2 className="text-xl font-semibold">Viabilité</h2>
                            <svg
                                viewBox="0 0 24 24"
                                className={clsx(
                                    "h-5 w-5 text-black/40 transition-transform",
                                    { "rotate-180": viabilityOpen },
                                )}
                            >
                                <path
                                    fill="currentColor"
                                    fillRule="evenodd"
                                    d="m6 7l6 6l6-6l2 2l-8 8l-8-8z"
                                />
                            </svg>
                        </button>
                        <p className="text-xs text-black/50 mb-3">
                            {viability.payback_years !== null
                                ? `Remboursement estimé en ${viability.payback_years} ans — économies annuelles de ${viability.annual_savings_eur.toFixed(0)} €`
                                : "Aucune économie estimée avec les installations actuelles."}
                        </p>

                        {viabilityOpen && (
                            <h3 className="text-sm font-semibold mb-2 text-black/70">
                                Retour sur investissement cumulé
                            </h3>
                        )}
                        {viabilityOpen && (
                            <div className="bg-white/50 rounded-lg p-3 mb-2">
                                <p className="text-xs text-black/60 mb-1">
                                    Ce graphique montre l'évolution du retour
                                    sur investissement cumulé de vos
                                    installations au fil du temps.
                                </p>
                                <ResponsiveContainer width="100%" height={200}>
                                    <AreaChart
                                        data={viability.yearly_cumulative}
                                        margin={{
                                            top: 8,
                                            right: 8,
                                            left: 0,
                                            bottom: 0,
                                        }}
                                    >
                                        <defs>
                                            <linearGradient
                                                id="paybackGradient"
                                                x1="0"
                                                y1="0"
                                                x2="0"
                                                y2="1"
                                            >
                                                <stop
                                                    offset="5%"
                                                    stopColor="#22c55e"
                                                    stopOpacity={0.3}
                                                />
                                                <stop
                                                    offset="95%"
                                                    stopColor="#22c55e"
                                                    stopOpacity={0}
                                                />
                                            </linearGradient>
                                            <linearGradient
                                                id="paybackGradientNeg"
                                                x1="0"
                                                y1="0"
                                                x2="0"
                                                y2="1"
                                            >
                                                <stop
                                                    offset="5%"
                                                    stopColor="#ef4444"
                                                    stopOpacity={0}
                                                />
                                                <stop
                                                    offset="95%"
                                                    stopColor="#ef4444"
                                                    stopOpacity={0.3}
                                                />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke="#0000000a"
                                        />
                                        <XAxis
                                            dataKey="year"
                                            tick={{ fontSize: 10 }}
                                            tickFormatter={(v) => `${v} ans`}
                                            interval={4}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10 }}
                                            tickFormatter={(v) =>
                                                v >= 0
                                                    ? `+${(v / 1000).toFixed(0)}k€`
                                                    : `${(v / 1000).toFixed(0)}k€`
                                            }
                                            width={48}
                                        />
                                        <Tooltip
                                            formatter={(value) => [
                                                typeof value === "number"
                                                    ? `${value >= 0 ? "+" : ""}${value.toFixed(0)} €`
                                                    : value,
                                                "Bilan cumulé",
                                            ]}
                                            labelFormatter={(label) =>
                                                `Année ${label}`
                                            }
                                            contentStyle={{
                                                fontSize: 11,
                                                borderRadius: 8,
                                            }}
                                        />
                                        <ReferenceLine
                                            y={0}
                                            stroke="#000"
                                            strokeOpacity={0.2}
                                            strokeDasharray="4 4"
                                            label={{
                                                value: "Seuil de rentabilité",
                                                fontSize: 9,
                                                fill: "#00000066",
                                                position: "insideTopLeft",
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="cumulative_eur"
                                            stroke="#22c55e"
                                            strokeWidth={2}
                                            fill="url(#paybackGradient)"
                                            dot={false}
                                            activeDot={{ r: 4 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {viabilityOpen &&
                            (() => {
                                const energyData = [
                                    {
                                        name: "Auto-consommé",
                                        value: viability.daily_self_consumption_kwh,
                                        color: "#22c55e",
                                    },
                                    {
                                        name: "Revendu",
                                        value: viability.daily_resell_kwh,
                                        color: "#3b82f6",
                                    },
                                    {
                                        name: "Acheté au réseau",
                                        value: viability.daily_deficit_kwh,
                                        color: "#ef4444",
                                    },
                                ].filter((d) => d.value > 0);
                                const coveragePercent =
                                    viability.daily_consumption_kwh > 0
                                        ? Math.min(
                                              100,
                                              Math.round(
                                                  (viability.daily_self_consumption_kwh /
                                                      viability.daily_consumption_kwh) *
                                                      100,
                                              ),
                                          )
                                        : 0;
                                return (
                                    <>
                                        <h3 className="text-sm font-semibold mb-2 text-black/70">
                                            Bilan énergétique quotidien
                                        </h3>
                                        <div className="bg-white/50 rounded-lg p-3 mb-2">
                                            <p className="text-xs text-black/60 mb-3">
                                                Ce graphique montre la
                                                répartition de votre
                                                consommation énergétique
                                                quotidienne entre ce que vous
                                                auto-consommez, revendez, et
                                                achetez au réseau.
                                            </p>
                                            <div className="flex items-center gap-4">
                                                <ResponsiveContainer
                                                    width={120}
                                                    height={120}
                                                >
                                                    <PieChart>
                                                        <Pie
                                                            data={energyData}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={36}
                                                            outerRadius={54}
                                                            dataKey="value"
                                                            strokeWidth={0}
                                                        >
                                                            {energyData.map(
                                                                (entry) => (
                                                                    <Cell
                                                                        key={
                                                                            entry.name
                                                                        }
                                                                        fill={
                                                                            entry.color
                                                                        }
                                                                    />
                                                                ),
                                                            )}
                                                        </Pie>
                                                        <Tooltip
                                                            formatter={(
                                                                value,
                                                            ) => [
                                                                typeof value ===
                                                                "number"
                                                                    ? `${value.toFixed(2)} kWh`
                                                                    : value,
                                                            ]}
                                                            contentStyle={{
                                                                fontSize: 11,
                                                                borderRadius: 8,
                                                            }}
                                                        />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                <div className="flex flex-col gap-2 flex-1">
                                                    <p className="text-xs font-semibold text-black/60">
                                                        Indépendance :{" "}
                                                        <span className="text-black">
                                                            {coveragePercent} %
                                                        </span>
                                                    </p>
                                                    {energyData.map((entry) => (
                                                        <div
                                                            key={entry.name}
                                                            className="flex items-center gap-2"
                                                        >
                                                            <span
                                                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                                                style={{
                                                                    backgroundColor:
                                                                        entry.color,
                                                                }}
                                                            />
                                                            <span className="text-xs text-black/70 leading-tight">
                                                                {entry.name}
                                                                <br />
                                                                <span className="font-medium text-black">
                                                                    {entry.value.toFixed(
                                                                        2,
                                                                    )}{" "}
                                                                    kWh/j
                                                                </span>
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}

                        {viabilityOpen &&
                            (() => {
                                const solarCost = Revenu.solar_panels.reduce(
                                    (s, p) => s + p.cost,
                                    0,
                                );
                                const windCost = Revenu.wind_turbines.reduce(
                                    (s, t) => s + t.cost,
                                    0,
                                );
                                const costData = [
                                    ...(solarCost > 0
                                        ? [
                                              {
                                                  name: "Solaire",
                                                  value: solarCost,
                                                  color: "#facc15",
                                              },
                                          ]
                                        : []),
                                    ...(windCost > 0
                                        ? [
                                              {
                                                  name: "Éolien",
                                                  value: windCost,
                                                  color: "#3b82f6",
                                              },
                                          ]
                                        : []),
                                ];

                                const solarKwh = Revenu.solar_panels.reduce(
                                    (s, p) => s + p.daily_kwh,
                                    0,
                                );
                                const windKwh = Revenu.wind_turbines.reduce(
                                    (s, t) => s + t.daily_kwh,
                                    0,
                                );
                                const kwhData = [
                                    ...(solarKwh > 0
                                        ? [
                                              {
                                                  name: "Solaire",
                                                  value: solarKwh,
                                                  color: "#facc15",
                                              },
                                          ]
                                        : []),
                                    ...(windKwh > 0
                                        ? [
                                              {
                                                  name: "Éolien",
                                                  value: windKwh,
                                                  color: "#3b82f6",
                                              },
                                          ]
                                        : []),
                                ];

                                if (costData.length === 0) return null;

                                const DonutCard = ({
                                    title,
                                    data,
                                    format,
                                    desc,
                                }: {
                                    title: string;
                                    data: {
                                        name: string;
                                        value: number;
                                        color: string;
                                    }[];
                                    format: (v: number) => string;
                                    desc?: string;
                                }) => (
                                    <>
                                        <h3 className="text-sm font-semibold mb-2 text-black/70">
                                            {title}
                                        </h3>
                                        <div className="bg-white/50 rounded-lg p-3 mb-2">
                                            <p className="text-xs text-black/60 mb-3">
                                                {desc}
                                            </p>
                                            <div className="flex items-center gap-4">
                                                <ResponsiveContainer
                                                    width={120}
                                                    height={120}
                                                >
                                                    <PieChart>
                                                        <Pie
                                                            data={data}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={36}
                                                            outerRadius={54}
                                                            dataKey="value"
                                                            strokeWidth={0}
                                                        >
                                                            {data.map(
                                                                (entry) => (
                                                                    <Cell
                                                                        key={
                                                                            entry.name
                                                                        }
                                                                        fill={
                                                                            entry.color
                                                                        }
                                                                    />
                                                                ),
                                                            )}
                                                        </Pie>
                                                        <Tooltip
                                                            formatter={(
                                                                value,
                                                            ) => [
                                                                typeof value ===
                                                                "number"
                                                                    ? format(
                                                                          value,
                                                                      )
                                                                    : value,
                                                            ]}
                                                            contentStyle={{
                                                                fontSize: 11,
                                                                borderRadius: 8,
                                                            }}
                                                        />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                <div className="flex flex-col gap-2 flex-1">
                                                    {data.map((entry) => (
                                                        <div
                                                            key={entry.name}
                                                            className="flex items-center gap-2"
                                                        >
                                                            <span
                                                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                                                style={{
                                                                    backgroundColor:
                                                                        entry.color,
                                                                }}
                                                            />
                                                            <span className="text-xs text-black/70 leading-tight">
                                                                {entry.name}
                                                                <br />
                                                                <span className="font-medium text-black">
                                                                    {format(
                                                                        entry.value,
                                                                    )}
                                                                </span>
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                );

                                return (
                                    <>
                                        <DonutCard
                                            title="Répartition des coûts"
                                            data={costData}
                                            format={(v) => `${v.toFixed(0)} €`}
                                            desc="Répartition du coût total estimé entre les différentes technologies installées"
                                        />
                                        <DonutCard
                                            title="Production par type d'énergie"
                                            data={kwhData}
                                            format={(v) =>
                                                `${v.toFixed(2)} kWh/j`
                                            }
                                            desc="Répartition de la production énergétique quotidienne estimée entre les différentes technologies installées"
                                        />
                                    </>
                                );
                            })()}
                    </>
                )}
            </aside>
            <aside
                className={clsx(
                    "grid grid-cols-2 transition-all absolute bottom-16 sm:bottom-12 right-6 gap-1 overflow-y-auto",
                )}
            >
                {/* Placement mode buttons */}
                <button
                    className={clsx(
                        "col-span-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:cursor-pointer",
                        placementMode === "solar"
                            ? "bg-yellow-400 text-black"
                            : "bg-white/40 backdrop-blur-xs text-black/70",
                    )}
                    onClick={() => togglePlacementMode("solar")}
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 256 256"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            fill="currentColor"
                            d="M32 104a8 8 0 0 1 8-8h16a8 8 0 0 1 0 16H40a8 8 0 0 1-8-8m39.43-45.25a8 8 0 0 0 11.32-11.32L71.43 36.12a8 8 0 0 0-11.31 11.31ZM128 40a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v16a8 8 0 0 0 8 8m50.91 21.09a8 8 0 0 0 5.66-2.34l11.31-11.32a8 8 0 0 0-11.31-11.31l-11.32 11.31a8 8 0 0 0 5.66 13.66M192 104a8 8 0 0 0 8 8h16a8 8 0 0 0 0-16h-16a8 8 0 0 0-8 8m-104 8a8 8 0 0 0 8-8a32 32 0 0 1 64 0a8 8 0 0 0 16 0a48 48 0 0 0-96 0a8 8 0 0 0 8 8m55.2 24h-30.4a4 4 0 0 0-3.91 3.15L102.62 168h50.76l-6.27-28.85a4 4 0 0 0-3.91-3.15M31.75 186L17 212.06a8 8 0 0 0 1.16 9.45a8.22 8.22 0 0 0 6 2.49h46.69a4 4 0 0 0 3.91-3.15l8-36.85H35.23a4 4 0 0 0-3.48 2m207.21 26l-14.71-26a4 4 0 0 0-3.48-2h-47.54l8 36.85a4 4 0 0 0 3.91 3.15h46.62a8.22 8.22 0 0 0 6-2.49a8 8 0 0 0 1.24-9.45Zm-28.27-50l-12.42-22a8 8 0 0 0-7-4.06h-23.51a4 4 0 0 0-3.91 4.85l5.9 27.15h37.45a4 4 0 0 0 3.49-5.94M88.24 136H64.7a8 8 0 0 0-7 4.06L45.31 162a4 4 0 0 0 3.49 6h37.45l5.9-27.15a4 4 0 0 0-3.91-4.85m68.62 48H99.14l-7.64 35.15a4 4 0 0 0 3.91 4.85h65.18a4 4 0 0 0 3.91-4.85Z"
                        />
                    </svg>
                    Panneau solaire
                </button>
                <button
                    className={clsx(
                        "col-span-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:cursor-pointer",
                        placementMode === "wind"
                            ? "bg-blue-300 text-black"
                            : "bg-white/40 backdrop-blur-xs text-black/70",
                    )}
                    onClick={() => togglePlacementMode("wind")}
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 48 48"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <defs>
                            <mask id="SVGwind-btn">
                                <g fill="none">
                                    <path
                                        stroke="#fff"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="4"
                                        d="M24 30v14"
                                    />
                                    <path
                                        fill="#fff"
                                        stroke="#fff"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="4"
                                        d="M29 23c11 5 16 14 16 14s-12 0-21-8c-9 8-21 8-21 8s5-10 16-14c0-13 5-19 5-19s5 6 5 19"
                                    />
                                    <circle cx="24" cy="24" r="2" fill="#000" />
                                </g>
                            </mask>
                        </defs>
                        <path
                            fill="currentColor"
                            d="M0 0h48v48H0z"
                            mask="url(#SVGwind-btn)"
                        />
                    </svg>
                    Éolienne
                </button>

                <div
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer flex items-center justify-center"
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
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer flex items-center justify-center"
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
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer flex items-center justify-center"
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
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer flex items-center justify-center"
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
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer flex items-center justify-center"
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
                    className="bg-white/40 p-2 rounded-lg backdrop-blur-xs hover:cursor-pointer flex items-center justify-center"
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

export default SimulatorEnergy;
