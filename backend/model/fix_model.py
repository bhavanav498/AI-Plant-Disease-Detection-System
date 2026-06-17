import tensorflow as tf
import numpy as np
import h5py
import json
import os

MODEL_PATH = r"C:\Users\bhava\OneDrive\Desktop\Plant detection\backend\model\plant_disease_model.h5"
CLASS_PATH = r"C:\Users\bhava\OneDrive\Desktop\Plant detection\backend\model\class_names.json"
SAVE_PATH  = r"C:\Users\bhava\OneDrive\Desktop\Plant detection\backend\model\plant_disease_model.keras"

with open(CLASS_PATH) as f:
    class_names = json.load(f)
num_classes = len(class_names)
print(f"✅ {num_classes} classes loaded")

# Rebuild exact same architecture used in Colab
base = tf.keras.applications.MobileNetV2(weights="imagenet", include_top=False, input_shape=(224,224,3))
base.trainable = False
x = tf.keras.layers.GlobalAveragePooling2D()(base.output)
x = tf.keras.layers.Dense(256, activation="relu")(x)
x = tf.keras.layers.Dropout(0.3)(x)
out = tf.keras.layers.Dense(num_classes, activation="softmax")(x)
model = tf.keras.Model(inputs=base.input, outputs=out)
model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
print("✅ Model architecture built")

# Load weights only from h5 file
model.load_weights(MODEL_PATH)
print("✅ Weights loaded from h5 file")

# Save in new format
model.save(SAVE_PATH)
print(f"✅ Saved successfully to {SAVE_PATH}")
print("🎉 Done! Now run python app.py")