from google import genai
import json
import os

GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"
client = genai.Client(api_key=GEMINI_API_KEY)


def get_disease_advisory(plant: str, disease: str) -> dict:
    is_healthy = "healthy" in disease.lower()

    if is_healthy:
        prompt = f"""
        The plant "{plant}" is detected as healthy.
        Return a JSON object with these exact keys:
        - description: brief note in very simple language that the plant is healthy
        - symptoms: []
        - causes: []
        - severity_level: "None"
        - traditional_remedies: []
        - organic_remedies: []
        - modern_treatments: []
        - recommended_medicines: []
        - prevention_methods: list of 3-4 simple care tips in easy farmer language
        - precautions: []
        Return ONLY valid JSON. No markdown, no explanation.
        """
    else:
        prompt = f"""
        Plant: {plant}
        Disease: {disease}

        You are an agricultural expert explaining to an UNEDUCATED FARMER.
        Use VERY SIMPLE English words only. No scientific terms.
        Write like you are talking to a village farmer who never went to school.

        Return a JSON object with these exact keys:
        - description: 2-3 simple sentences about what this disease is
        - symptoms: list of 4-5 simple visible symptoms (e.g. "Brown spots on leaves", "Leaves turning yellow")
        - causes: list of 3-4 simple causes (e.g. "Too much rain", "Bad seeds")
        - severity_level: one of "Low", "Moderate", or "High"
        - traditional_remedies: list of 3-4 home remedies farmers can make at home
        - organic_remedies: list of 3-4 natural treatments available in local market
        - modern_treatments: list of 3-4 chemical treatments with simple instructions
        - recommended_medicines: list of objects with keys "name" and "active_ingredient"
        - prevention_methods: list of 4-5 simple prevention steps any farmer can follow
        - precautions: list of 3-4 simple safety tips

        Return ONLY valid JSON. No markdown, no code fences.
        """

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt
        )
        raw = response.text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception as e:
        print(f"Gemini advisory error: {e}")
        return _fallback_advisory(plant, disease, is_healthy)


def translate_advisory(advisory: dict, language: str) -> dict:
    """Translate the entire advisory into the target language.
    Tries Gemini first, falls back to free Google Translate API if Gemini fails."""

    if language == "en":
        return advisory  # No translation needed for English

    language_names = {
        "hi": "Hindi", "kn": "Kannada", "ta": "Tamil",
        "te": "Telugu", "mr": "Marathi", "bn": "Bengali"
    }
    lang_name = language_names.get(language, "Hindi")

    content = {
        "description":          advisory.get("description", ""),
        "symptoms":             advisory.get("symptoms", []),
        "causes":               advisory.get("causes", []),
        "severity_level":       advisory.get("severity_level", "Moderate"),
        "traditional_remedies": advisory.get("traditional_remedies", []),
        "organic_remedies":     advisory.get("organic_remedies", []),
        "modern_treatments":    advisory.get("modern_treatments", []),
        "prevention_methods":   advisory.get("prevention_methods", []),
        "precautions":          advisory.get("precautions", []),
    }

    # ── Try Gemini first ──
    prompt = f"""
    Translate the following agricultural disease advisory JSON into {lang_name} language.
    The audience is UNEDUCATED FARMERS who speak only {lang_name}.
    Use simple, clear {lang_name} words that a village farmer can understand.
    Keep the exact same JSON structure and keys in English.
    Only translate the VALUES (text content), not the keys.

    Input JSON:
    {json.dumps(content, ensure_ascii=False, indent=2)}

    Return ONLY the translated JSON with same structure. No markdown, no explanation.
    """
    try:
        response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        raw = response.text.strip().replace("```json", "").replace("```", "").strip()
        translated = json.loads(raw)
        translated["recommended_medicines"] = advisory.get("recommended_medicines", [])
        print(f"✅ Translated via Gemini to {lang_name}")
        return translated
    except Exception as e:
        print(f"⚠️ Gemini translation failed ({e}), using free Google Translate fallback...")
        return _translate_via_google_free(content, advisory, language)


def _translate_via_google_free(content: dict, original_advisory: dict, language: str) -> dict:
    """Free Google Translate API (no key required) - translates field by field."""
    import urllib.request
    import urllib.parse

    def translate_text(text):
        if not text or not text.strip():
            return text
        try:
            url = (
                "https://translate.googleapis.com/translate_a/single"
                f"?client=gtx&sl=en&tl={language}&dt=t&q={urllib.parse.quote(text)}"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            # Google returns nested list structure: [[["translated","original",...]],...]
            translated_parts = [seg[0] for seg in result[0] if seg[0]]
            return "".join(translated_parts)
        except Exception as ex:
            print(f"Translate fallback error for '{text[:30]}...': {ex}")
            return text  # Return original if translation fails

    translated = {}
    translated["description"]    = translate_text(content.get("description", ""))
    translated["severity_level"] = content.get("severity_level", "Moderate")

    list_fields = ["symptoms", "causes", "traditional_remedies",
                    "organic_remedies", "modern_treatments",
                    "prevention_methods", "precautions"]

    for field in list_fields:
        items = content.get(field, [])
        translated[field] = [translate_text(item) for item in items]

    # Keep medicine names in English
    translated["recommended_medicines"] = original_advisory.get("recommended_medicines", [])

    print(f"✅ Translated via free Google Translate to {language}")
    return translated


def _fallback_advisory(plant: str, disease: str, is_healthy: bool) -> dict:
    if is_healthy:
        return {
            "description": f"Good news! Your {plant} plant looks healthy. Keep taking care of it the same way.",
            "symptoms": [], "causes": [], "severity_level": "None",
            "traditional_remedies": [], "organic_remedies": [],
            "modern_treatments": [], "recommended_medicines": [],
            "prevention_methods": [
                "Water the plant regularly but do not overwater",
                "Make sure the plant gets enough sunlight",
                "Add compost to keep soil healthy",
                "Check leaves every week for any spots or changes"
            ],
            "precautions": []
        }
    return {
        "description": f"Your {plant} plant has a disease called {disease}. This disease can damage your crop. Act fast to save your plants.",
        "symptoms": ["Brown or yellow spots on leaves", "Leaves falling off early", "Dark patches on stem", "Plant looks weak"],
        "causes": ["Fungal infection from moisture", "Too much rain", "Poor air between plants", "Infected seeds"],
        "severity_level": "Moderate",
        "traditional_remedies": ["Spray wood ash mixed with water", "Apply neem leaf water on leaves", "Remove all bad leaves and burn them", "Mix turmeric in water and spray"],
        "organic_remedies": ["Spray neem oil mixed with water every 7 days", "Use cow urine mixed with water", "Apply compost tea to roots", "Spray baking soda in water on leaves"],
        "modern_treatments": ["Spray Mancozeb fungicide every 7-10 days", "Apply Copper Oxychloride on leaves", "Use Chlorothalonil fungicide spray", "Ask your local agriculture officer for help"],
        "recommended_medicines": [
            {"name": "Mancozeb", "active_ingredient": "Mancozeb 75% WP"},
            {"name": "Blitox",   "active_ingredient": "Copper Oxychloride 50% WP"},
            {"name": "Kavach",   "active_ingredient": "Chlorothalonil 75% WP"}
        ],
        "prevention_methods": ["Do not plant same crop in same field every year", "Water plants at the base not on leaves", "Keep space between plants for air", "Remove bad leaves immediately", "Buy good quality seeds from trusted shops"],
        "precautions": ["Wear gloves when spraying chemicals", "Spray early morning not in hot sun", "Keep children away from sprayed plants for 2 days", "Wash hands after touching sick plants"]
    }