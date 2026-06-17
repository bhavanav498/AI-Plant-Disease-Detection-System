from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
import numpy as np
import cv2
import json
import os
import sqlite3
import urllib.request
import urllib.parse
from datetime import datetime
from utils.gemini_helper import get_disease_advisory, translate_advisory
from utils.pdf_generator import generate_pdf
from utils.predictor import load_model, predict_disease

app = Flask(__name__)
CORS(app, origins="*")

BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER  = os.path.join(BASE_DIR, "static", "uploads")
REPORTS_FOLDER = os.path.join(BASE_DIR, "reports")
os.makedirs(UPLOAD_FOLDER,  exist_ok=True)
os.makedirs(REPORTS_FOLDER, exist_ok=True)


def init_db():
    conn = sqlite3.connect(os.path.join(BASE_DIR, "history.db"))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS detections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, plant TEXT, disease TEXT,
            confidence REAL, severity TEXT, report_path TEXT
        )
    """)
    conn.commit()
    conn.close()

def get_db():
    return sqlite3.connect(os.path.join(BASE_DIR, "history.db"))

init_db()
model, class_names = load_model()


# ── PREDICT ──────────────────────────────────────
@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file     = request.files["image"]
    filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    img_bytes = open(filepath, "rb").read()
    plant, disease, confidence = predict_disease(model, class_names, img_bytes)
    advisory  = get_disease_advisory(plant, disease)
    severity  = advisory.get("severity_level", "Moderate")

    conn = get_db()
    conn.execute(
        "INSERT INTO detections (date, plant, disease, confidence, severity) VALUES (?, ?, ?, ?, ?)",
        (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), plant, disease, round(confidence, 2), severity)
    )
    conn.commit()
    conn.close()

    return jsonify({
        "plant": plant, "disease": disease,
        "confidence": round(confidence, 2),
        "advisory": advisory
    })


# ── TRANSLATE ADVISORY ────────────────────────────
# Called when farmer selects a language — translates all advisory text
@app.route("/translate", methods=["POST"])
def translate():
    data     = request.json
    advisory = data.get("advisory", {})
    language = data.get("language", "en")  # e.g. "kn", "hi", "te"

    if language == "en":
        return jsonify({"translated": advisory})

    translated = translate_advisory(advisory, language)
    return jsonify({"translated": translated})


# ── TTS PROXY ────────────────────────────────────
@app.route("/tts", methods=["POST"])
def text_to_speech():
    data = request.json
    text = data.get("text", "")[:200]
    lang = data.get("lang", "en")

    if not text.strip():
        return jsonify({"error": "No text"}), 400

    try:
        encoded = urllib.parse.quote(text)
        url     = f"https://translate.google.com/translate_tts?ie=UTF-8&q={encoded}&tl={lang}&client=tw-ob"
        req     = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            audio = resp.read()
        return Response(audio, mimetype="audio/mpeg",
                        headers={"Cache-Control": "no-cache",
                                 "Access-Control-Allow-Origin": "*"})
    except Exception as e:
        print(f"TTS error: {e}")
        return jsonify({"error": str(e)}), 500


# ── PDF ───────────────────────────────────────────
@app.route("/generate-pdf", methods=["POST"])
def pdf():
    data = request.json
    path = generate_pdf(data, REPORTS_FOLDER)
    conn = get_db()
    conn.execute(
        "UPDATE detections SET report_path = ? WHERE plant = ? AND disease = ? ORDER BY id DESC LIMIT 1",
        (path, data.get("plant"), data.get("disease"))
    )
    conn.commit()
    conn.close()
    return jsonify({"pdf_path": path})


@app.route("/download-pdf/<filename>", methods=["GET"])
def download_pdf(filename):
    path = os.path.join(REPORTS_FOLDER, filename)
    if os.path.exists(path):
        return send_file(path, as_attachment=True)
    return jsonify({"error": "File not found"}), 404


# ── HISTORY ───────────────────────────────────────
@app.route("/history", methods=["GET"])
def history():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, date, plant, disease, confidence, severity, report_path FROM detections ORDER BY id DESC LIMIT 20"
    ).fetchall()
    conn.close()
    return jsonify([
        {"id": r[0], "date": r[1], "plant": r[2], "disease": r[3],
         "confidence": r[4], "severity": r[5], "report_path": r[6]}
        for r in rows
    ])


@app.route("/history/<int:record_id>", methods=["DELETE"])
def delete_history(record_id):
    conn = get_db()
    conn.execute("DELETE FROM detections WHERE id = ?", (record_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Deleted"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)