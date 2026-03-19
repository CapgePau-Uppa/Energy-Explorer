import React, { useState, useEffect, useRef } from "react";
import MapLibre, {
    Marker,
    Source,
    Layer,
    type MapLayerMouseEvent,
    type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import clsx from "clsx";

export type GameStep =
    | { type: "welcome" }
    | { type: "start" }
    | { type: "round-select"; round: number }
    | { type: "round-validation"; round: number }
    | { type: "round-score"; round: number }
    | { type: "end" }
    | { type: "error"; message: string };

type GameKind = "solar" | "wind";

type pinPosition = {
    lat: number;
    lon: number;
};

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

    let valueClicked = 0;

    console.log(Score);
    console.log(Step);
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

        setStep({ type: "round-select", round: createRoundData.round });
    };

    const clickMapRound = (e: MapLayerMouseEvent) => {
        console.log("Map clicked at: ", e.lngLat);
        if (Step.type === "round-select" || Step.type === "round-validation") {
            setCurrentPinPosition({
                lat: e.lngLat.lat,
                lon: e.lngLat.lng,
            });
        }

        if (Step.type === "round-select") {
            setStep({ type: "round-validation", round: Step.round });
        }
    };

    const validateRoundClicked = async () => {
        if (Step.type !== "round-validation" || !CurrentPinPosition) return;

        setLoading(true);
        const urlToFetch = `${import.meta.env.PUBLIC_BACKEND_SERVER}/quiz/game_progress?lat=${encodeURIComponent(CurrentPinPosition.lat)}&lon=${encodeURIComponent(CurrentPinPosition.lon)}`;

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
        const validateRoundData = await validateRoundResponse.json();
        console.log("Validate round response:", validateRoundData);
        setLoading(false);

        setLastValue(validateRoundData.value);

        if (!validateRoundData.partie_ended) {
            setScore(validateRoundData.current_score);
            setLastScore(validateRoundData.score_gained);
            setStep({ type: "round-score", round: Step.round });
        } else {
            setScore(validateRoundData.total_score);
            setLastScore(validateRoundData.score_gained);
            setStep({ type: "end" });
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
                style={{ width: "100%", height: "100%" }}
                mapStyle="/map/style.json" // Set directly, not conditionally
                initialViewState={{
                    latitude: 46.71,
                    longitude: 4,
                    zoom: 5.25,
                    pitch: 0,
                    bearing: 0,
                }}
                onClick={clickMapRound}

                //mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
            >
                {(Step.type === "round-validation" || Step.type === "end") &&
                    CurrentPinPosition && (
                        <Marker
                            latitude={CurrentPinPosition.lat}
                            longitude={CurrentPinPosition.lon}
                            anchor="bottom"
                        >
                            <div className="w-6 h-6 bg-red-500 rounded-full border-2 border-white" />
                        </Marker>
                    )}
                {(Step.type === "round-score" || Step.type === "end") &&
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
                                paint={{
                                    "raster-opacity": 0.6,
                                }}
                            />
                        </Source>
                    )}
                {(Step.type === "round-score" || Step.type === "end") &&
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
                                paint={{
                                    "raster-opacity": 0.6,
                                }}
                            />
                        </Source>
                    )}
                {children}
            </MapLibre>
            <div
                id="overlay-container"
                className="absolute bottom-0 left-0 w-full h-full flex items-center justify-center z-20 transition-all duration-2000 pointer-events-none"
            >
                {Step.type.startsWith("round-") && (
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
                            {Score} points
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
                        Nous allons tester tes connaissances 🧠 en géographie 🗺️
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
                        Deviner quel endroit est le plus intéressant pour poser
                        une éolienne ou des panneaux solaires. 🫣 <br /> <br />
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
                            Commencer avec le soleil 🌞
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
                            Commencer avec le vent 🌬️
                        </button>
                    </div>
                </div>
                <div
                    id="set-pin-screen"
                    className={clsx(
                        "p-10 bg-white/60 backdrop-blur-xs rounded-lg transition-opacity duration-500 flex flex-col md:w-2xl mx-4 self-start justify-self-start ml-12 mt-12 pointer-events-auto",
                        {
                            hidden:
                                Step.type !== "round-select" &&
                                Step.type !== "round-validation",
                            flex:
                                Step.type === "round-select" ||
                                Step.type === "round-validation",
                        },
                    )}
                >
                    <h1 className="text-lg md:text-2xl">
                        {GameKind === "solar"
                            ? "Place un panneau solaire 📌"
                            : "Place une éolienne 📌"}
                    </h1>
                    <p className="text-sm md:text-base   text-black/60">
                        {/* Sur cette zone, où penses-tu qu’il serait le plus
                        judicieux de placer des panneaux solaires ? 🤔 */}
                        {GameKind === "solar"
                            ? "Sur cette zone, où penses-tu qu’il serait le plus judicieux de placer des panneaux solaires ? 🤔"
                            : "Sur cette zone, où penses-tu qu’il serait le plus judicieux de placer une éolienne ? 🤔"}
                    </p>

                    <button
                        className={clsx(
                            "mt-4 w-full py-2 bg-game-button disabled:bg-game-button/40 disabled:cursor-not-allowed text-white rounded hover:bg-game-button-hover transition-colors cursor-pointer",
                            {
                                "animate-bounce": Loading,
                            },
                        )}
                        onClick={validateRoundClicked}
                        disabled={Step.type === "round-select" || Loading}
                    >
                        Valider mon choix ✅
                    </button>
                </div>
                <div
                    id="score-screen"
                    className={clsx(
                        "p-10 bg-white/60 backdrop-blur-xs rounded-lg transition-opacity duration-500 flex flex-col md:w-2xl mx-4 pointer-events-auto",
                        {
                            hidden: Step.type !== "round-score",
                            flex: Step.type === "round-score",
                        },
                    )}
                >
                    <h1 className="text-lg md:text-2xl pt-8">
                        {LastScore > 20
                            ? "T'as réussi 👏"
                            : "Presque, tu feras mieux la prochaine fois 😬"}
                    </h1>
                    <p className="text-sm md:text-base   text-black/60 mb-8">
                        {LastScore > 20
                            ? "Ta position était très bonne, tu as gagné pas mal de points !"
                            : "Ta position n'était pas optimale, tu n'as pas gagné beaucoup de points cette fois-ci."}
                    </p>

                    <p
                        className={clsx("text-lg font-semibold", {
                            "text-green-600": LastScore > 20,
                            "text-red-600": LastScore <= 20,
                        })}
                    >
                        {LastScore} points {LastScore < 0 ? "perdus" : "gagnés"}{" "}
                        {LastScore === 200 ? "🎉 Combo 2x!" : ""}
                    </p>

                    <button
                        className={clsx(
                            "mt-4 w-full py-2 bg-game-button disabled:bg-game-button/40 disabled:cursor-not-allowed text-white rounded hover:bg-game-button-hover transition-colors cursor-pointer",
                            {
                                "animate-bounce": Loading,
                            },
                        )}
                        onClick={nextRoundClicked}
                        disabled={Loading}
                    >
                        Suivant
                    </button>
                    <p className="text-sm text-black/60 mt-4">
                        À l'endroit où tu as cliqué, le potentiel énergétique
                        est de {LastValue.toFixed(2)}{" "}
                        {GameKind === "solar" ? "kWh/m²/jour. " : "m/s. "}.{" "}
                        <br />
                        {GameKind === "solar" // Panneau solaire 1.6M2, rendement de 16%, ampoule 7W
                            ? `Ça fait ${(LastValue * 1.6 * 0.16).toFixed(2)} kWh par jour, soit de quoi faire fonctionner une ampoule de 7W pendant ${(
                                  (LastValue * 1.6 * 0.16) /
                                  0.007
                              ).toFixed(2)} heures !`
                            : `C'est plutôt ${
                                  LastValue > 4
                                      ? "élevé, un bon emplacement pour une éolienne !"
                                      : "faible, une éolienne fonctionne à partir de 3-4 m/s, donc ce n'est pas un emplacement idéal."
                              }`}
                    </p>
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
                        T'es super doué(e)💪 <br /> Félicitations !
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
                    <p className={clsx("text-xs text-black/50 mb-8", {})}>
                        {LastScore} points {LastScore < 0 ? "perdus" : "gagnés"}{" "}
                        au dernier round{" "}
                        {LastScore === 200 ? "🎉 Combo 2x!" : ""}
                    </p>

                    <p className="text-sm md:text-base   text-black/60">
                        Bravo d’être arrivé jusqu’ici ! N’hésite pas à refaire
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
