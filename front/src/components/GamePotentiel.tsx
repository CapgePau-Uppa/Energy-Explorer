import React, { useState, useRef, useEffect } from "react";
import confetti from "canvas-confetti";
import { GameToastStack, type Toast, type ToastKind } from "./GameToast";
import MapLibre, {
    Marker,
    Source,
    Layer,
    type MapLayerMouseEvent,
    type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import clsx from "clsx";
import { useWebHaptics } from "web-haptics/react";

export type GameStep =
    | { type: "welcome" }
    | { type: "start" }
    | { type: "round-select"; round: number }
    | { type: "end" }
    | { type: "error"; message: string };

type GameKind = "solar" | "wind";

type pinPosition = {
    lat: number;
    lon: number;
};

const solarBoundaries = {
    minLon: -180.0,
    maxLon: 180.0,
    minLat: -60.0,
    maxLat: 65.0,
};

const windBoundaries = {
    minLon: -180.00125,
    maxLon: 179.99875,
    minLat: -64.00125,
    maxLat: 79.99875,
};

function isInsideSolarBoundaries(position: pinPosition) {
    return (
        position.lon >= solarBoundaries.minLon &&
        position.lon <= solarBoundaries.maxLon &&
        position.lat >= solarBoundaries.minLat &&
        position.lat <= solarBoundaries.maxLat
    );
}

function isInsideWindBoundaries(position: pinPosition) {
    return (
        position.lon >= windBoundaries.minLon &&
        position.lon <= windBoundaries.maxLon &&
        position.lat >= windBoundaries.minLat &&
        position.lat <= windBoundaries.maxLat
    );
}

function Game({ children }: { children?: React.ReactNode }) {
    const mapRef = useRef<MapRef>(null);
    const [Score, setScore] = useState(0);
    const [LastScore, setLastScore] = useState(0);
    const [Step, setStep] = useState<GameStep>({ type: "welcome" });
    const [GameKind, setGameKind] = useState<GameKind>("solar");
    const [Loading, setLoading] = useState(false);
    const [CurrentPinPosition, setCurrentPinPosition] =
        useState<pinPosition | null>(null);
    const [LastValue, setLastValue] = useState(0);

    const toastIdRef = useRef(0);
    const [Toasts, setToasts] = useState<Toast[]>([]);

    const [DisplayedScore, setDisplayedScore] = useState(0);
    const displayedScoreRef = useRef(0);
    const animFrameRef = useRef<number>(0);

    const { trigger } = useWebHaptics();

    const successVibration = () => {
        trigger([{ duration: 30 }, { delay: 60, duration: 40, intensity: 1 }]);
    };

    const errorVibration = () => {
        trigger([
            { duration: 40, intensity: 0.7 },
            { delay: 40, duration: 40, intensity: 0.7 },
            { delay: 40, duration: 40, intensity: 0.9 },
            { delay: 40, duration: 50, intensity: 0.6 },
        ]);
    };

    const comboVibration = () => {
        trigger([{ duration: 1000 }], { intensity: 1 });
    };

    useEffect(() => {
        const start = displayedScoreRef.current;
        const end = Score;
        if (start === end) return;

        const duration = 800;
        const startTime = performance.now();
        cancelAnimationFrame(animFrameRef.current);

        const animate = (now: number) => {
            const t = Math.min((now - startTime) / duration, 1);
            const eased = 1 - (1 - t) ** 2;
            const current = Math.round(start + (end - start) * eased);
            displayedScoreRef.current = current;
            setDisplayedScore(current);
            if (t < 1) animFrameRef.current = requestAnimationFrame(animate);
        };

        animFrameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [Score]);

    const TOAST_EXIT_DURATION = 280; // matches toast-exit CSS animation duration

    const pushToast = (kind: ToastKind, message: string, duration = 2500) => {
        const id = ++toastIdRef.current;
        setToasts((prev) => [...prev, { id, kind, message, exiting: false }]);

        setTimeout(() => {
            setToasts((prev) =>
                prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
            );

            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, TOAST_EXIT_DURATION);
        }, duration);
    };

    const [PerfectPoint, setPerfectPoint] = useState<pinPosition | null>(null);
    const [PercentileRank, setPercentileRank] = useState(0);
    const [PerfectValue, setPerfectValue] = useState(0);
    const [FloatingScore, setFloatingScore] = useState<{
        x: number;
        y: number;
        score: number;
        fading: boolean;
    } | null>(null);

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

            map.dragPan.disable();
            map.scrollZoom.disable();
            map.doubleClickZoom.disable();
            map.touchZoomRotate.disable();
            map.dragRotate.disable();
        }
    };

    const welcomeClicked = () => {
        setStep({ type: "start" });
        setScore(0);
        setLastScore(0);
        setCurrentPinPosition(null);
        setLoading(false);
    };

    const startClickedSolar = async () => {
        setGameKind("solar");
        setStep({ type: "round-select", round: 0 });

        const urlToFetch = `${import.meta.env.PUBLIC_BACKEND_SERVER}/quiz/create_game?energy_type=solar`;
        setLoading(true);

        const createGameResponse = await fetch(urlToFetch, {
            credentials: "include",
        });
        const createGameData = await createGameResponse.json();
        console.log("Create game response:", createGameData);
        setLoading(false);

        await nextRoundClicked();
    };

    const startClickedWind = async () => {
        setGameKind("wind");
        setStep({ type: "round-select", round: 0 });

        const urlToFetch = `${import.meta.env.PUBLIC_BACKEND_SERVER}/quiz/create_game?energy_type=wind`;
        setLoading(true);

        const createGameResponse = await fetch(urlToFetch, {
            credentials: "include",
        });
        const createGameData = await createGameResponse.json();
        console.log("Create game response:", createGameData);
        setLoading(false);

        await nextRoundClicked();
    };

    const nextRoundClicked = async () => {
        setLoading(true);
        const urlToFetch = `${import.meta.env.PUBLIC_BACKEND_SERVER}/quiz/create_round`;

        const createRoundResponse = await fetch(urlToFetch, {
            credentials: "include",
        });
        if (!createRoundResponse.ok) {
            setLoading(false);
            setStep({
                type: "error",
                message:
                    "Erreur lors de la création de la partie. Reponse du serveur: " +
                    createRoundResponse.statusText,
            });
            return;
        }
        const createRoundData = await createRoundResponse.json();
        console.log("Create round response:", createRoundData);
        setLoading(false);

        mapRef.current?.flyTo({
            center: [createRoundData.lon, createRoundData.lat],
            zoom: 5.25,
            pitch: 0,
            bearing: 0,
            duration: 2200,
        });

        setCurrentPinPosition(null);
        setStep({ type: "round-select", round: createRoundData.round });
    };

    const clickMapRound = async (e: MapLayerMouseEvent) => {
        if (Step.type !== "round-select" || Loading) return;

        const clickedPosition = { lat: e.lngLat.lat, lon: e.lngLat.lng };

        if (GameKind === "solar" && !isInsideSolarBoundaries(clickedPosition)) {
            console.error("Clicked position is outside solar boundaries");
            pushToast(
                "bad-score",
                "Ce point est en dehors de la zone jouable pour le solaire.",
                3000,
            );
            errorVibration();
            return;
        }

        if (GameKind === "wind" && !isInsideWindBoundaries(clickedPosition)) {
            console.error("Clicked position is outside wind boundaries");
            pushToast(
                "bad-score",
                "Ce point est en dehors de la zone jouable pour l'éolien.",
                3000,
            );
            errorVibration();
            return;
        }

        setCurrentPinPosition(clickedPosition);
        setLoading(true);

        const urlToFetch = `${import.meta.env.PUBLIC_BACKEND_SERVER}/quiz/game_progress?lat=${encodeURIComponent(clickedPosition.lat)}&lon=${encodeURIComponent(clickedPosition.lon)}`;

        const validateRoundResponse = await fetch(urlToFetch, {
            credentials: "include",
        });
        if (!validateRoundResponse.ok) {
            setLoading(false);
            setStep({
                type: "error",
                message:
                    "Erreur lors de la validation du round. Reponse du serveur: " +
                    validateRoundResponse.statusText,
            });
            return;
        }
        const data = await validateRoundResponse.json();
        console.log("Validate round response:", data);
        setLoading(false);

        setLastValue(data.value);
        setPerfectPoint({ lat: data.best_lat, lon: data.best_lon });
        setPerfectValue(data.best_value);
        setPercentileRank(data.percentile_rank);

        const scoreGained: number = data.score_gained;

        setFloatingScore({
            x: e.point.x,
            y: e.point.y,
            score: scoreGained,
            fading: false,
        });
        setTimeout(
            () =>
                setFloatingScore((prev) =>
                    prev ? { ...prev, fading: true } : null,
                ),
            4000,
        );

        if (scoreGained === 200) {
            pushToast("combo", `Combo 2x! ${scoreGained} points obtenus! 🔥`);
            confetti({ particleCount: 380, spread: 80, origin: { y: 0.55 } });
            comboVibration();
        } else if (scoreGained > 50) {
            pushToast("success", `🎯 Score obtenu: ${scoreGained}`);
            confetti({ particleCount: 120, spread: 60, origin: { y: 0.55 } });
            successVibration();
        } else {
            pushToast("bad-score", `😬 Score obtenu: ${scoreGained}`);
            errorVibration();
        }
        if (!data.partie_ended) {
            setScore(data.current_score);
            setLastScore(scoreGained);
            pushToast("next-round", "Prochain round dans 3 secondes");
            setTimeout(() => {
                setFloatingScore(null);
                nextRoundClicked();
            }, 4000);
        } else {
            setScore(data.total_score);
            setLastScore(scoreGained);
            if (data.total_score > 250) {
                setTimeout(() => {
                    confetti({
                        particleCount: 180,
                        spread: 80,
                        origin: { y: 0.55 },
                    });
                }, 500);
            }
            setTimeout(() => {
                setFloatingScore(null);
                setStep({ type: "end" });
            }, 3000);
        }
    };

    return (
        <div className="h-full">
            <GameToastStack toasts={Toasts} />
            <MapLibre
                attributionControl={{
                    customAttribution:
                        " © Contributeurs d'OpenStreetMap  | Energy Explorer",
                    compact: true,
                }}
                ref={mapRef}
                onLoad={handleLoad}
                style={{ width: "100%", height: "100%" }}
                mapStyle="/map/style.json"
                initialViewState={{
                    latitude: 46.71,
                    longitude: 4,
                    zoom: 5.25,
                    pitch: 0,
                    bearing: 0,
                }}
                onClick={clickMapRound}
            >
                {(Step.type === "end" || FloatingScore !== null) &&
                    PerfectPoint && (
                        <Marker
                            latitude={PerfectPoint.lat}
                            longitude={PerfectPoint.lon}
                            anchor="bottom"
                        >
                            <div
                                key={`${PerfectPoint.lat},${PerfectPoint.lon}`}
                                className="flex flex-col items-center -mt-10 animate-pin-drop"
                            >
                                <p className="text-xs font-bold text-white">
                                    Meilleur choix
                                </p>
                                <svg
                                    className="w-12 h-12 text-blue-500"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fill="currentColor"
                                        fill-rule="evenodd"
                                        d="M12 2c-4.418 0-8 4.003-8 8.5c0 4.462 2.553 9.312 6.537 11.174a3.45 3.45 0 0 0 2.926 0C17.447 19.812 20 14.962 20 10.5C20 6.003 16.418 2 12 2m0 10a2 2 0 1 0 0-4a2 2 0 0 0 0 4"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                            </div>
                        </Marker>
                    )}

                {(Step.type === "end" ||
                    (FloatingScore !== null && !FloatingScore.fading)) &&
                    GameKind === "solar" && (
                        <Source
                            type="raster"
                            tiles={[
                                import.meta.env.PUBLIC_SOLAR_TILES ||
                                    "https://cdn.julienc.me/ter/globalwindsolar/{z}/{x}/{y}.png",
                            ]}
                        >
                            <Layer
                                id="raster-layer"
                                type="raster"
                                paint={{ "raster-opacity": 0.6 }}
                            />
                        </Source>
                    )}
                {(Step.type === "end" ||
                    (FloatingScore !== null && !FloatingScore.fading)) &&
                    GameKind === "wind" && (
                        <Source
                            type="raster"
                            tiles={[
                                import.meta.env.PUBLIC_WIND_TILES ||
                                    "https://cdn1.julienc.me/energy-explorer/wind-tiles2/{z}/{x}/{y}.png",
                            ]}
                        >
                            <Layer
                                id="raster-layer"
                                type="raster"
                                paint={{ "raster-opacity": 0.6 }}
                            />
                        </Source>
                    )}

                {children}
            </MapLibre>

            {FloatingScore && (
                <div
                    className={clsx(
                        "absolute pointer-events-none z-30 -translate-x-1/2 -translate-y-full",
                        "bg-white rounded-lg px-3 py-1 shadow-lg font-bold text-lg",
                        "transition-opacity duration-500",
                        {
                            "opacity-100": !FloatingScore.fading,
                            "opacity-0": FloatingScore.fading,
                            "text-green-600": FloatingScore.score > 0,
                            "text-red-600": FloatingScore.score <= 0,
                        },
                    )}
                    style={{ left: FloatingScore.x, top: FloatingScore.y }}
                >
                    {FloatingScore.score > 0 ? "+" : ""}
                    {FloatingScore.score} pts
                </div>
            )}

            <div
                id="overlay-container"
                className="absolute bottom-0 left-0 w-full h-full flex items-center justify-center z-20 transition-all duration-2000 pointer-events-none"
            >
                {Step.type === "round-select" && (
                    <div
                        id="score"
                        className="absolute bottom-4 left-4 bg-white/60 bg-background-blur rounded-lg p-6"
                    >
                        <p>Score:</p>
                        <p
                            className={clsx("text-lg font-semibold", {
                                "text-green-600": Score > 0,
                                "text-red-600": Score <= 0,
                            })}
                        >
                            {DisplayedScore} points
                        </p>
                    </div>
                )}
                <div
                    id="welcome-screen"
                    className={clsx(
                        "p-10 bg-white/60 backdrop-blur-xs rounded-lg transition-opacity duration-500 flex flex-col md:w-2xl mx-4 pointer-events-auto",
                        {
                            hidden: Step.type !== "welcome",
                            flex: Step.type === "welcome",
                        },
                    )}
                >
                    <a
                        href="/"
                        className="text-xs flex gap-2 items-center text-black/60 hover:underline mb-2"
                    >
                        <div className="p-2 bg-gray-200 rounded-full flex items-center justify-center">
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    fill="currentColor"
                                    d="m4 10l-.707.707L2.586 10l.707-.707zm17 8a1 1 0 1 1-2 0zM8.293 15.707l-5-5l1.414-1.414l5 5zm-5-6.414l5-5l1.414 1.414l-5 5zM4 9h10v2H4zm17 7v2h-2v-2zm-7-7a7 7 0 0 1 7 7h-2a5 5 0 0 0-5-5z"
                                />
                            </svg>
                        </div>
                        Retour à l'accueil
                    </a>
                    <h1 className="text-lg md:text-2xl">
                        Bienvenue dans le quiz ☺️
                    </h1>
                    <p className="text-sm md:text-base   text-black/60">
                        Nous allons tester ton instinct d'expert 🧠 en énergies
                        renouvelables !☀️
                    </p>

                    <button
                        className="mt-4 px-4 py-2 bg-game-button text-white rounded hover:bg-game-button-hover transition-colors cursor-pointer"
                        onClick={welcomeClicked}
                    >
                        Je suis prêt(e) 🏁
                    </button>
                </div>
                <div
                    id="rules-screen"
                    className={clsx(
                        "p-10 bg-white/60 backdrop-blur-xs rounded-lg transition-opacity duration-500 flex flex-col md:w-2xl mx-4 pointer-events-auto",
                        {
                            hidden: Step.type !== "start",
                            flex: Step.type === "start",
                        },
                    )}
                >
                    <a
                        href="/"
                        className="text-xs flex gap-2 items-center text-black/60 hover:underline mb-2"
                    >
                        <div className="p-2 bg-gray-200 rounded-full flex items-center justify-center">
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    fill="currentColor"
                                    d="m4 10l-.707.707L2.586 10l.707-.707zm17 8a1 1 0 1 1-2 0zM8.293 15.707l-5-5l1.414-1.414l5 5zm-5-6.414l5-5l1.414 1.414l-5 5zM4 9h10v2H4zm17 7v2h-2v-2zm-7-7a7 7 0 0 1 7 7h-2a5 5 0 0 0-5-5z"
                                />
                            </svg>
                        </div>
                        Retour à l'accueil
                    </a>
                    <h1 className="text-lg md:text-2xl">
                        Le principe du jeu 📋
                    </h1>
                    <p className="text-sm md:text-base   text-black/60">
                        À trois reprises, le jeu va te présenter un endroit sur
                        Terre 🌏. Ton but ? <br /> <br />
                        Deviner quel endroit est le plus intéressant pour
                        implanter un parc éolien ou installer des panneaux
                        solaires. 🫣 <br /> <br />
                        Plus ta position est optimale, plus tu gagnes de points
                        🤗. À la fin, sauvegarde ton score et compare le avec
                        tes ami(e)s.
                    </p>

                    <div className="flex sm:flex-row flex-col gap-4">
                        <button
                            className={clsx(
                                "mt-4 w-full py-2 bg-game-button disabled:bg-game-button/40 disabled:cursor-not-allowed text-white rounded hover:bg-game-button-hover transition-colors cursor-pointer",
                                {
                                    "animate-bounce": Loading,
                                },
                            )}
                            onClick={startClickedSolar}
                        >
                            Explorer le solaire 🌞
                        </button>
                        <button
                            className={clsx(
                                "mt-4 w-full py-2 bg-game-button disabled:bg-game-button/40 disabled:cursor-not-allowed text-white rounded hover:bg-game-button-hover transition-colors cursor-pointer",
                                {
                                    "animate-bounce": Loading,
                                },
                            )}
                            onClick={startClickedWind}
                        >
                            Explorer l'éolien' 🌬️
                        </button>
                    </div>
                </div>

                <div
                    id="end-screen"
                    className={clsx(
                        "p-10 bg-white/60 backdrop-blur-xs rounded-lg transition-opacity duration-500 flex flex-col md:w-2xl mx-4 pointer-events-auto",
                        {
                            hidden: Step.type !== "end",
                            flex: Step.type === "end",
                        },
                    )}
                >
                    <a
                        href="/"
                        className="text-xs flex gap-2 items-center text-black/60 hover:underline mb-2"
                    >
                        <div className="p-2 bg-white rounded-full flex items-center justify-center">
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    fill="currentColor"
                                    d="m4 10l-.707.707L2.586 10l.707-.707zm17 8a1 1 0 1 1-2 0zM8.293 15.707l-5-5l1.414-1.414l5 5zm-5-6.414l5-5l1.414 1.414l-5 5zM4 9h10v2H4zm17 7v2h-2v-2zm-7-7a7 7 0 0 1 7 7h-2a5 5 0 0 0-5-5z"
                                />
                            </svg>
                        </div>
                        Retour à l'accueil
                    </a>
                    <h1 className="text-lg md:text-2xl">
                        {Score > 150 && (
                            <>
                                T'es super doué(e)💪 <br /> Félicitations !
                            </>
                        )}
                        {Score <= 150 && (
                            <>
                                Pas mal du tout ! 👏 <br /> Mais je suis sûr que
                                tu feras mieux la prochaine fois
                            </>
                        )}
                    </h1>

                    <p className="text-xs text-black/80 mt-8">Score final:</p>
                    <p
                        className={clsx("text-lg font-semibold mb-1", {
                            "text-green-600": Score > 150,
                            "text-red-600": Score <= 150,
                        })}
                    >
                        {Score} points
                    </p>
                    <p className={clsx("text-xs text-black/50 mb-8")}>
                        {LastScore} points {LastScore < 0 ? "perdus" : "gagnés"}{" "}
                        au dernier round{" "}
                        {LastScore === 200 ? "🎉 Combo 2x!" : ""}
                    </p>

                    <p className="text-sm md:text-base   text-black/60">
                        Bravo d'être arrivé jusqu'ici ! N'hésite pas à refaire
                        le quiz pour améliorer ton score, et surtout à le
                        partager à tes ami(e)s pour les défier 🏆
                    </p>

                    <button
                        className={clsx(
                            "mt-4 w-full py-2 bg-game-button disabled:bg-game-button/40 disabled:cursor-not-allowed text-white rounded hover:bg-game-button-hover transition-colors cursor-pointer",
                            {
                                "animate-bounce": Loading,
                            },
                        )}
                        onClick={welcomeClicked}
                    >
                        Recommencer une partie
                    </button>
                </div>
                <div
                    id="error-screen"
                    className={clsx(
                        "p-10 bg-white/60 backdrop-blur-xs rounded-lg transition-opacity duration-500 flex flex-col md:w-2xl mx-4 pointer-events-auto",
                        {
                            hidden: Step.type !== "error",
                            flex: Step.type === "error",
                        },
                    )}
                >
                    <h1 className="text-lg md:text-2xl">
                        Une erreur est survenue 😢
                    </h1>

                    <p className="text-xs text-black/80">
                        {Step.type === "error"
                            ? Step.message
                            : "Une erreur inconnue est survenue."}
                    </p>

                    <button
                        className={clsx(
                            "mt-4 w-full py-2 bg-game-button disabled:bg-game-button/40 disabled:cursor-not-allowed text-white rounded hover:bg-game-button-hover transition-colors cursor-pointer",
                            {
                                "animate-bounce": Loading,
                            },
                        )}
                        onClick={welcomeClicked}
                    >
                        Recommencer une partie
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Game;
