import os
from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import pandas as pd
import xgboost as xgb
import shap
import google.generativeai as genai

# =========================
# LOAD ENV VARIABLES
# =========================
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("❌ GEMINI_API_KEY not found in environment variables")

genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel('gemini-2.5-flash')

# =========================
# LOAD MODEL
# =========================
model = xgb.XGBClassifier(enable_categorical=True)
model.load_model("model/pathopreter_sota_xgboost.json")

with open("model/pathopreter_features.txt") as f:
    FEATURES = [line.strip() for line in f]

# ✅ SHAP EXPLAINER (load once, not per request)
explainer = shap.TreeExplainer(model, feature_perturbation="tree_path_dependent")

# =========================
# FASTAPI SETUP
# =========================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change later to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# INPUT SCHEMA
# =========================
class VariantInput(BaseModel):
    chrom: str
    pos: float
    ref: str
    alt: str
    gnomad_af: float
    GERP_91_mammals_rankscore: float
    phyloP100way_vertebrate_rankscore: float
    phyloP470way_mammalian_rankscore: float
    phastCons470way_mammalian_rankscore: float
    phastCons17way_primate_rankscore: float

# =========================
# API ENDPOINT
# =========================
@app.post("/predict")
async def predict(data: VariantInput):
    try:
        # Convert input to DataFrame
        df = pd.DataFrame([data.dict()])

        # Convert categorical columns
        for col in ["chrom", "ref", "alt"]:
            df[col] = df[col].astype("category")

        df = df[FEATURES]

        # Prediction
        prob = model.predict_proba(df)[0][1]

        # SHAP
        shap_vals = explainer.shap_values(df)[0]
        feature_impacts = [
            [feat, float(val)] for feat, val in zip(FEATURES, shap_vals)
        ]
        top_features = sorted(feature_impacts, key=lambda x: abs(x[1]), reverse=True)

        # Gemini Prompt
        top_features_text = "\n".join(
            [f"- {f}: {v:.4f}" for f, v in top_features[:5]]
        )

        prompt = f"""
You are a clinical AI assistant.

XGBoost predicted a {prob*100:.2f}% pathogenic probability.

Top SHAP Features:
{top_features_text}

Provide:
1. Verdict (Pathogenic or Benign)
2. Feature explanation
3. Biological context
4. 2 practical clinical tips

Use bold formatting for important terms.
"""

        # Gemini Response
        gemini_response = gemini_model.generate_content(prompt)
        clinical_note = gemini_response.text

        return {
            "pathogenic_probability": float(prob),
            "prediction": "Pathogenic" if prob >= 0.5 else "Benign",
            "top_features": top_features,
            "clinical_note": clinical_note
        }

    except Exception as e:
        return {"error": str(e)}