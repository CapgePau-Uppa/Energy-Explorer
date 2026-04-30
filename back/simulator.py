import numpy as np
from flask import Blueprint, request, jsonify, session, g
import math
from scipy.interpolate import CubicSpline
from scipy.integrate import quad
from scipy import stats
from dataset import data_solar, data_wind, dataset_solar, dataset_wind
import sqlite3
import os

simulator_bp = Blueprint('simulator', __name__)

solar = {
    "amerisolar": {
        "surface_area": 2.56, "yield": 22.64, "cost": 99.9, "icon": "/icons/amerisolar.png"
    },
}

wind_turbine = {
    "Rutland 1200": {
        "cost": 1716,
        "curve": {
            "speed": np.array([0,    1,    1.5,  2,    3,    4,    5,    6,    7,
                               8,    9,    10,   11,   12,   13,   14,   15,   20]),
            "power": np.array([0,    0,    2,    5,    12,   22,   40,   80,   130,
                               180,  230,  260,  290,  360,  420,  460,  483,  483])
        },
        "icon": "/icons/rutland1200.png"
    },

    "Aeolos-V 1 kW": {
        "cost": 2650,
        "curve": {
            "speed": np.array([0,  1,  2,   3,   4,   5,   6,   7,   8,
                               9,  10,  11,  12,  13,  14,  15,  16,  20]),
            "power": np.array([0,  0,  0,  50,  90, 150, 250, 370, 560,
                               780, 1080, 1340, 1480, 1500, 1400, 1210, 960,   0])
        },
        "icon": "/icons/aeolos-v-1-kw.png"
    },

    "Antaris 3.5 kW": {
        "cost": 14540,
        "curve": {
            "speed": np.array([0,    1,    2,    3,    4,    5,    6,    7,    8,
                               9,    10,   11,   12,   13,   14,   15,   20]),
            "power": np.array([0,    0,    0,    50,   150,  300,  600,  1000, 1500,
                               2100, 2900, 3700, 4700, 5000, 5000, 4900, 4900])
        },
        "icon": "/icons/antaris-3-5-kw.png"
    },

    "Antaris 7.5 kW": {
        "cost": 31323,
        "curve": {
            "speed": np.array([0,    1,    2,    3,    4,    5,    6,    7,    8,
                               9,    10,   11,   12,   13,   14,   15,   20]),
            "power": np.array([0,    0,    0,    150,   500,  1000,  1500,  2300, 3500,
                               5000, 6500, 7500, 8500, 8500, 8500, 8500, 8500])
        },
        "icon": "/icons/antaris-7-5-kw.png"
    },
}

DB_PATH = os.getenv("SIMULATOR_DB_PATH", "simulator.db")

ELEC_BUY_PRICE = 0.1940   # €/kWh
ELEC_SELL_PRICE = 0.04    # €/kWh

simulator_schema = """
CREATE TABLE IF NOT EXISTS project (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    daily_kwh_consumption REAL NOT NULL DEFAULT 16,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS solar_panel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    surface_area REAL NOT NULL,
    panel_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wind_turbine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    turbine_type TEXT NOT NULL
);
"""


def get_db():
    db = getattr(g, '_simulator_db', None)
    if db is None:
        db = g._simulator_db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(simulator_schema)
    try:
        conn.execute("ALTER TABLE project ADD COLUMN daily_kwh_consumption REAL NOT NULL DEFAULT 16")
    except sqlite3.OperationalError:
        pass  # column already exists
    conn.execute("UPDATE project SET daily_kwh_consumption = 16 WHERE daily_kwh_consumption = 0")
    conn.commit()
    conn.close()


def _wind_daily_kwh(v_mean: float, curve_v: np.ndarray, curve_p: np.ndarray) -> float:
    """Expected daily production (kWh/day) for a turbine given mean wind speed."""
    spline = CubicSpline(curve_v, curve_p, extrapolate=False)

    def power_w(v: float) -> float:
        if v < curve_v[0] or v > curve_v[-1]:
            return 0.0
        return max(0.0, float(spline(v)))

    sigma = v_mean / math.sqrt(math.pi / 2)
    mean_power_w, _ = quad(lambda v: power_w(
        v) * stats.rayleigh.pdf(v, scale=sigma), 0, 25)
    return mean_power_w * 24 / 1000

# --- Static infos ---


@simulator_bp.route("/solar-panels", methods=["GET"])
def list_solar_panels():
    panels = []
    for key, spec in solar.items():
        panel_info = {"type": key, "surface_area": spec["surface_area"], "yield": spec["yield"],
                      "cost": spec["cost"], "icon": spec["icon"]}
        panels.append(panel_info)
    return jsonify(panels)


@simulator_bp.route("/wind-turbines", methods=["GET"])
def list_wind_turbines():
    turbines = []
    for key, spec in wind_turbine.items():
        turbine_info = {"type": key, "cost": spec["cost"], "curve": {"speed": spec["curve"]["speed"].tolist(),
                                                                     "power": spec["curve"]["power"].tolist()},
                        "icon": spec["icon"]}
        turbines.append(turbine_info)
    return jsonify(turbines)


# --- Projects ---

@simulator_bp.route("/projects", methods=["GET"])
def list_projects():
    """ user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401 """
    user_id = "test-user"  # TODO: replace with auth later

    db = get_db()
    projects = db.execute(
        "SELECT id, name, daily_kwh_consumption, created_at FROM project WHERE user_id = ?", (user_id,)).fetchall()

    data = []
    for project in projects:
        data.append({
            "id": project["id"],
            "name": project["name"],
            "daily_kwh_consumption": project["daily_kwh_consumption"],
            "created_at": project["created_at"],
        })
    return jsonify(data)


@simulator_bp.route("/project", methods=["POST"])
def create_project():
    """ user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401 """
    user_id = "test-user"  # TODO: replace with auth later

    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    daily_kwh_consumption = float(data.get("daily_kwh_consumption", 16))

    db = get_db()
    cursor = db.execute(
        "INSERT INTO project (user_id, name, daily_kwh_consumption) VALUES (?, ?, ?)",
        (user_id, name, daily_kwh_consumption)
    )
    db.commit()

    return jsonify({"id": cursor.lastrowid, "name": name, "daily_kwh_consumption": daily_kwh_consumption}), 201


@simulator_bp.route("/project/<int:project_id>", methods=["GET"])
def get_project(project_id):
    db = get_db()
    project = db.execute(
        "SELECT * FROM project WHERE id = ?", (project_id,)).fetchone()
    if project is None:
        return jsonify({"error": "Project not found"}), 404

    panels = db.execute(
        "SELECT * FROM solar_panel WHERE project_id = ?", (project_id,)
    ).fetchall()
    turbines = db.execute(
        "SELECT * FROM wind_turbine WHERE project_id = ?", (project_id,)
    ).fetchall()

    return jsonify({
        "id": project["id"],
        "name": project["name"],
        "daily_kwh_consumption": project["daily_kwh_consumption"],
        "created_at": project["created_at"],
        "solar_panels": [dict(p) for p in panels],
        "wind_turbines": [dict(t) for t in turbines],
    })


@simulator_bp.route("/project/<int:project_id>", methods=["PATCH"])
def update_project(project_id):
    db = get_db()
    if db.execute("SELECT id FROM project WHERE id = ?", (project_id,)).fetchone() is None:
        return jsonify({"error": "Project not found"}), 404

    data = request.get_json(silent=True) or {}
    fields, values = [], []
    if "name" in data:
        name = data["name"].strip()
        if not name:
            return jsonify({"error": "name cannot be empty"}), 400
        fields.append("name = ?")
        values.append(name)
    if "daily_kwh_consumption" in data:
        fields.append("daily_kwh_consumption = ?")
        values.append(float(data["daily_kwh_consumption"]))

    if not fields:
        return jsonify({"error": "Nothing to update"}), 400

    values.append(project_id)
    db.execute(f"UPDATE project SET {', '.join(fields)} WHERE id = ?", values)
    db.commit()

    project = db.execute("SELECT * FROM project WHERE id = ?", (project_id,)).fetchone()
    return jsonify({
        "id": project["id"],
        "name": project["name"],
        "daily_kwh_consumption": project["daily_kwh_consumption"],
        "created_at": project["created_at"],
    })


@simulator_bp.route("/project/<int:project_id>", methods=["DELETE"])
def delete_project(project_id):
    db = get_db()
    result = db.execute("DELETE FROM project WHERE id = ?", (project_id,))
    db.commit()
    if result.rowcount == 0:
        return jsonify({"error": "Project not found"}), 404
    return "", 204


# --- Solar panels ---

@simulator_bp.route("/project/<int:project_id>/solar", methods=["POST"])
def add_solar_panel(project_id):
    db = get_db()
    if db.execute("SELECT id FROM project WHERE id = ?", (project_id,)).fetchone() is None:
        return jsonify({"error": "Project not found"}), 404

    data = request.get_json(silent=True) or {}
    lat = data.get("latitude")
    lon = data.get("longitude")
    surface_area = data.get("surface_area")
    panel_type = data.get("panel_type", "").strip()

    if None in (lat, lon, surface_area) or not panel_type:
        return jsonify({"error": "latitude, longitude, surface_area and panel_type are required"}), 400
    if panel_type not in solar:
        return jsonify({"error": f"Unknown panel_type '{panel_type}'"}), 400

    cursor = db.execute(
        "INSERT INTO solar_panel (project_id, latitude, longitude, surface_area, panel_type) VALUES (?, ?, ?, ?, ?)",
        (project_id, lat, lon, surface_area, panel_type)
    )
    db.commit()
    return jsonify({"id": cursor.lastrowid, "project_id": project_id, "latitude": lat, "longitude": lon,
                    "surface_area": surface_area, "panel_type": panel_type}), 201


@simulator_bp.route("/project/<int:project_id>/solar/<int:panel_id>", methods=["DELETE"])
def delete_solar_panel(project_id, panel_id):
    db = get_db()
    result = db.execute(
        "DELETE FROM solar_panel WHERE id = ? AND project_id = ?", (
            panel_id, project_id)
    )
    db.commit()
    if result.rowcount == 0:
        return jsonify({"error": "Panel not found"}), 404
    return "", 204


# --- Wind turbines ---

@simulator_bp.route("/project/<int:project_id>/wind", methods=["POST"])
def add_wind_turbine(project_id):
    db = get_db()
    if db.execute("SELECT id FROM project WHERE id = ?", (project_id,)).fetchone() is None:
        return jsonify({"error": "Project not found"}), 404

    data = request.get_json(silent=True) or {}
    lat = data.get("latitude")
    lon = data.get("longitude")
    turbine_type = data.get("turbine_type", "").strip()

    if None in (lat, lon) or not turbine_type:
        return jsonify({"error": "latitude, longitude and turbine_type are required"}), 400
    if turbine_type not in wind_turbine:
        return jsonify({"error": f"Unknown turbine_type '{turbine_type}'"}), 400

    cursor = db.execute(
        "INSERT INTO wind_turbine (project_id, latitude, longitude, turbine_type) VALUES (?, ?, ?, ?)",
        (project_id, lat, lon, turbine_type)
    )
    db.commit()
    return jsonify({"id": cursor.lastrowid, "project_id": project_id, "latitude": lat,
                    "longitude": lon, "turbine_type": turbine_type}), 201


@simulator_bp.route("/project/<int:project_id>/wind/<int:turbine_id>", methods=["DELETE"])
def delete_wind_turbine(project_id, turbine_id):
    db = get_db()
    result = db.execute(
        "DELETE FROM wind_turbine WHERE id = ? AND project_id = ?", (
            turbine_id, project_id)
    )
    db.commit()
    if result.rowcount == 0:
        return jsonify({"error": "Turbine not found"}), 404
    return "", 204


# --- Estimation ---

@simulator_bp.route("/project/<int:project_id>/estimate", methods=["GET"])
def estimate_project(project_id):
    db = get_db()
    project = db.execute(
        "SELECT * FROM project WHERE id = ?", (project_id,)).fetchone()
    if project is None:
        return jsonify({"error": "Project not found"}), 404

    panels = db.execute(
        "SELECT * FROM solar_panel WHERE project_id = ?", (project_id,)).fetchall()
    turbines = db.execute(
        "SELECT * FROM wind_turbine WHERE project_id = ?", (project_id,)).fetchall()

    total_cost = 0.0
    total_daily_kwh = 0.0
    total_annual_kwh = 0.0
    solar_details = []
    wind_details = []

    for panel in panels:
        spec = solar[panel["panel_type"]]
        row, col = dataset_solar.index(panel["longitude"], panel["latitude"])
        irradiance = float(data_solar[row, col])  # kWh/m²/day
        daily_kwh = panel["surface_area"] * (spec["yield"] / 100) * irradiance
        annual_kwh = daily_kwh * 365
        num_units = panel["surface_area"] / spec["surface_area"]
        cost = num_units * spec["cost"]
        total_daily_kwh += daily_kwh
        total_annual_kwh += annual_kwh
        total_cost += cost
        solar_details.append({
            "id": panel["id"],
            "panel_type": panel["panel_type"],
            "latitude": panel["latitude"],
            "longitude": panel["longitude"],
            "surface_area": panel["surface_area"],
            "irradiance": round(irradiance, 3),
            "daily_kwh": round(daily_kwh, 3),
            "annual_kwh": round(annual_kwh, 2),
            "cost": round(cost, 2),
        })

    for turbine in turbines:
        spec = wind_turbine[turbine["turbine_type"]]
        row, col = dataset_wind.index(
            turbine["longitude"], turbine["latitude"])
        v_mean = float(data_wind[row, col])  # m/s
        daily_kwh = _wind_daily_kwh(
            v_mean, spec["curve"]["speed"], spec["curve"]["power"])
        annual_kwh = daily_kwh * 365
        total_daily_kwh += daily_kwh
        total_annual_kwh += annual_kwh
        total_cost += spec["cost"]
        wind_details.append({
            "id": turbine["id"],
            "turbine_type": turbine["turbine_type"],
            "latitude": turbine["latitude"],
            "longitude": turbine["longitude"],
            "v_mean": round(v_mean, 3),
            "daily_kwh": round(daily_kwh, 3),
            "annual_kwh": round(annual_kwh, 2),
            "cost": spec["cost"],
        })

    return jsonify({
        "total_cost": round(total_cost, 2),
        "total_daily_kwh": round(total_daily_kwh, 3),
        "total_annual_kwh": round(total_annual_kwh, 2),
        "solar_panels": solar_details,
        "wind_turbines": wind_details,
    })


@simulator_bp.route("/project/<int:project_id>/viability", methods=["GET"])
def viability_project(project_id):
    db = get_db()
    project = db.execute(
        "SELECT * FROM project WHERE id = ?", (project_id,)).fetchone()
    if project is None:
        return jsonify({"error": "Project not found"}), 404

    panels = db.execute(
        "SELECT * FROM solar_panel WHERE project_id = ?", (project_id,)).fetchall()
    turbines = db.execute(
        "SELECT * FROM wind_turbine WHERE project_id = ?", (project_id,)).fetchall()

    total_cost = 0.0
    total_daily_kwh = 0.0

    for panel in panels:
        spec = solar[panel["panel_type"]]
        row, col = dataset_solar.index(panel["longitude"], panel["latitude"])
        irradiance = float(data_solar[row, col])
        daily_kwh = panel["surface_area"] * (spec["yield"] / 100) * irradiance
        num_units = panel["surface_area"] / spec["surface_area"]
        total_daily_kwh += daily_kwh
        total_cost += num_units * spec["cost"]

    for turbine in turbines:
        spec = wind_turbine[turbine["turbine_type"]]
        row, col = dataset_wind.index(turbine["longitude"], turbine["latitude"])
        v_mean = float(data_wind[row, col])
        total_daily_kwh += _wind_daily_kwh(v_mean, spec["curve"]["speed"], spec["curve"]["power"])
        total_cost += spec["cost"]

    daily_consumption = project["daily_kwh_consumption"]
    self_consumed = min(total_daily_kwh, daily_consumption)
    excess = max(0.0, total_daily_kwh - daily_consumption)
    deficit = max(0.0, daily_consumption - total_daily_kwh)

    daily_savings = self_consumed * ELEC_BUY_PRICE + excess * ELEC_SELL_PRICE
    annual_savings = daily_savings * 365
    annual_grid_cost = deficit * ELEC_BUY_PRICE * 365

    payback_years = round(total_cost / annual_savings, 1) if annual_savings > 0 else None

    yearly_cumulative = []
    for year in range(31):
        yearly_cumulative.append({
            "year": year,
            "cumulative_eur": round(annual_savings * year - total_cost, 2),
        })

    return jsonify({
        "total_cost": round(total_cost, 2),
        "daily_production_kwh": round(total_daily_kwh, 3),
        "daily_consumption_kwh": round(daily_consumption, 3),
        "daily_self_consumption_kwh": round(self_consumed, 3),
        "daily_resell_kwh": round(excess, 3),
        "daily_deficit_kwh": round(deficit, 3),
        "daily_savings_eur": round(daily_savings, 4),
        "annual_savings_eur": round(annual_savings, 2),
        "annual_grid_cost_eur": round(annual_grid_cost, 2),
        "payback_years": payback_years,
        "yearly_cumulative": yearly_cumulative,
    })
