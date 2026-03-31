import pandas as pd

def preprocess_input(data, features):
    df = pd.DataFrame([data])

    for col in ["chrom", "ref", "alt"]:
        df[col] = df[col].astype("category")

    for col in df.columns:
        if col not in ["chrom", "ref", "alt"]:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    return df[features]