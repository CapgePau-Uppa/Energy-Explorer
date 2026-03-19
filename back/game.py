import numpy as np
from flask import Blueprint, request, jsonify, session, g
from dataset import dataset_solar, dataset_wind, data_solar, data_wind, valid_indices_solar, valid_indices_wind
import sqlite3

quiz_bp = Blueprint('quiz', __name__)

nb_rounds = 3


def init_db():
    conn = sqlite3.connect('parties.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS parties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            energy_type TEXT
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS rounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            partie_id INTEGER,
            round INTEGER,
            lat REAL,
            lon REAL,
            fort_potentiel BOOLEAN,
            score INTEGER,
            FOREIGN KEY(partie_id) REFERENCES parties(id)
        )
    ''')
    conn.commit()
    conn.close()


init_db()


def get_db():
    if "conn" not in g:
        g.conn = sqlite3.connect("parties.db")
    return g.conn


def solar_quiz(lat, lon):
    row, col = dataset_solar.index(lon, lat)
    return float(data_solar[row, col])


def wind_quiz(lat, lon):
    row, col = dataset_wind.index(lon, lat)
    return float(data_wind[row, col])


@quiz_bp.route("/create_game")
def create_game():
    energy_type = request.args.get("energy_type", "solar")
    if energy_type not in ["solar", "wind"]:
        return jsonify({"error": "Invalid energy type"}), 400

    # Create a game in the database and return the game ID
    cursor = get_db().cursor()
    cursor.execute(
        "INSERT INTO parties (energy_type) VALUES (?)", (energy_type,))
    partie_id = cursor.lastrowid
    get_db().commit()

    session["partie_id"] = partie_id
    session["round"] = 0
    session["score"] = 0
    session["energy_type"] = energy_type
    session["consecutive_wins"] = 0

    return jsonify({"partie_id": partie_id, "energy_type": energy_type, "rounds_total": nb_rounds})


@quiz_bp.route("/create_round")
def create_round():
    partie_id = session.get("partie_id")
    if not partie_id:
        return jsonify({"error": "No active game"}), 400

    round_num = session.get("round", 0)
    if round_num >= nb_rounds:
        return jsonify({"error": "Game is already over"}), 400

    # Pick a random energy type
    energy_type = session.get("energy_type")
    if energy_type not in ["solar", "wind"]:
        return jsonify({"error": "Invalid energy type in session"}), 400
    dataset = dataset_solar if energy_type == "solar" else dataset_wind
    valid_indices = valid_indices_solar if energy_type == "solar" else valid_indices_wind

    # Find a random valid pixel (non-masked)
    row, col = valid_indices[np.random.randint(len(valid_indices))]
    lon, lat = dataset.xy(int(row), int(col))

    # Store the round
    cursor = get_db().cursor()
    cursor.execute(
        "INSERT INTO rounds (partie_id, round, lat, lon) VALUES (?, ?, ?, ?)",
        (partie_id, round_num, lat, lon)
    )
    get_db().commit()

    # Update session
    session["lat"] = lat
    session["lon"] = lon
    session["energy_type"] = energy_type
    session["round"] = round_num

    return jsonify({
        "round": round_num,
        "lat": lat,
        "lon": lon,
        "energy_type": energy_type,
    })


@quiz_bp.route("/game_progress")
def game_progress():
    lat = session.get("lat")
    lon = session.get("lon")
    energy_type = session.get("energy_type")
    round_num = session.get("round")

    if lat is None or lon is None or energy_type is None or round_num is None:
        return jsonify({"error": "No active round"}), 400

    if (request.args.get("lat") is None) or (request.args.get("lon") is None):
        return jsonify({"error": "Missing lat or lon in request"}), 400

    lat_guess = float(request.args.get("lat"))
    lon_guess = float(request.args.get("lon"))

    score_gained, value = check_potentiel(
        lat, lon, lat_guess, lon_guess, energy_type)

    if score_gained == 100:
        session["consecutive_wins"] += 1
    else:
        session["consecutive_wins"] = 0

    if session["consecutive_wins"] == 3 and score_gained == 100:
        score_gained *= 2

    session["score"] += score_gained
    session["round"] += 1

    # Save the score for this round in the database
    partie_id = session.get("partie_id")
    cursor = get_db().cursor()
    cursor.execute(
        "UPDATE rounds SET fort_potentiel = ?, score = ? WHERE partie_id = ? AND round = ?",
        (score_gained > 0, score_gained, partie_id, round_num))
    get_db().commit()

    if session["round"] >= nb_rounds:
        cursor = get_db().cursor()
        # Calculate total score for the game
        cursor.execute(
            "SELECT SUM(score) FROM rounds WHERE partie_id = ?", (partie_id,))
        total_score = cursor.fetchone()[0] or 0

        result = {
            "partie_ended": True,
            "partie_id": partie_id,
            "total_score": total_score,
            "score_gained": score_gained,
            "value": value,
            "energy_type": energy_type,
            "rounds_played": nb_rounds
        }

        # Reset session for new game
        session.pop("partie_id", None)
        session.pop("round", None)
        session.pop("lat", None)
        session.pop("lon", None)
        session.pop("score", None)
        session.pop("energy_type", None)
    else:
        result = {
            "partie_ended": False,
            "current_score": session["score"],
            "rounds_played": session["round"],
            "energy_type": energy_type,
            "score_gained": score_gained,
            "value": value
        }

        # Update round info for the next round
        session["lat"] = None
        session["lon"] = None

    return jsonify(result)


def check_potentiel(lat, lon, lat_guess, lon_guess, energy_type) -> (int, float):

    if energy_type == "solar":
        value = solar_quiz(lat, lon)
        if value > 1.6:
            return 100, value
        else:
            return -20, value
    elif energy_type == "wind":
        value = wind_quiz(lat, lon)
        if value > 6:
            return 100, value
        else:
            return -20, value
    else:
        raise ValueError("Invalid energy type")
