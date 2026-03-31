
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import xgboost as xgb
import shap
import google.generativeai as genai

# =========================
# CONFIGURATION
# =========================
# REPLACE WITH YOUR REAL KEY FROM AI STUDIO
genai.configure(api_key="AIzaSyDNkA3snwVipvEYs4R-Ay9zXK8eFyu5YRY")
gemini_model = genai.GenerativeModel('gemini-2.5-flash')

# LOAD XGBOOST MODEL
model = xgb.XGBClassifier(enable_categorical=True)
model.load_model("model/pathopreter_sota_xgboost.json")

with open("model/pathopreter_features.txt") as f:
    FEATURES = [line.strip() for line in f]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.post("/predict")
async def predict(data: VariantInput):
    try:
        df = pd.DataFrame([data.dict()])
        for col in ["chrom", "ref", "alt"]:
            df[col] = df[col].astype("category")
        
        df = df[FEATURES]
        prob = model.predict_proba(df)[0][1]

        # SHAP Analysis
        explainer = shap.TreeExplainer(model)
        shap_vals = explainer.shap_values(df)[0]
        feature_impacts = [[feat, float(val)] for feat, val in zip(FEATURES, shap_vals)]
        top_features = sorted(feature_impacts, key=lambda x: abs(x[1]), reverse=True)

        # Generate Gemini Clinical Note
        top_features_text = "\n".join([f"- {f}: {v:.4f}" for f, v in top_features[:5]])
        prompt = f"""You are a clinical AI assistant. XGBoost predicted a {prob*100:.2f}% pathogenic probability.
        Top SHAP Features:
        {top_features_text}
        Provide a verdict, feature breakdown, biological context, and 2 practical tips. Use bolding for feature names."""
        
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