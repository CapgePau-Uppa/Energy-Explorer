from flask import Flask, request, jsonify
import rasterio

app = Flask(__name__)
print("Chargement du dataset...")
dataset = rasterio.open('../temp/solar.tif')
data = dataset.read(1)

def get_valeur(lat, lon):
    row, col = dataset.index(lon, lat)
    return float(dataset.read(1)[row, col])

@app.route("/valeur")
def api():
    lat = float(request.args.get("lat"))
    lon = float(request.args.get("lon"))
    value = get_valeur(lat, lon)
    return jsonify({"lat": lat, "lon": lon, "valeur": value})

if __name__ == '__main__':
    app.run(debug=True)
