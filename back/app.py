from flask import Flask, request, jsonify, session
from game import quiz_bp
from dataset import dataset_solar, data_solar, dataset_wind, data_wind
import sqlite3
from flask_cors import CORS

app = Flask(__name__)
CORS(app, supports_credentials=True)
app.secret_key = "your_secret_key"
app.register_blueprint(quiz_bp, url_prefix="/quiz")
# required for cross-origin fetch
app.config["SESSION_COOKIE_SAMESITE"] = "None"
# required with SameSite=None; works on 127.0.0.1 and HTTPS
app.config["SESSION_COOKIE_SECURE"] = True
app.config["SESSION_COOKIE_HTTPONLY"] = True


def get_value_solar(lat, lon):
    row, col = dataset_solar.index(lon, lat)
    return float(data_solar[row, col])


@app.route("/solar_value")
def solar_api():
    if (request.args.get("lat") is None) or (request.args.get("lon") is None):
        return jsonify({"error": "Missing lat or lon parameter"}), 400

    lat = float(request.args.get("lat"))
    lon = float(request.args.get("lon"))
    value = get_value_solar(lat, lon)
    return jsonify({"lat": lat, "lon": lon, "valeur": value})


def get_value_wind(lat, lon):
    row, col = dataset_wind.index(lon, lat)
    return float(data_wind[row, col])


@app.route("/wind_value")
def wind_api():
    if (request.args.get("lat") is None) or (request.args.get("lon") is None):
        return jsonify({"error": "Missing lat or lon parameter"}), 400

    lat = float(request.args.get("lat"))
    lon = float(request.args.get("lon"))
    value = get_value_wind(lat, lon)
    return jsonify({"lat": lat, "lon": lon, "valeur": value})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5051)
