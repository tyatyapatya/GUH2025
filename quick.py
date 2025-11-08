import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)
print("List of models that support generateContent:\n")
for m in genai.list_models():
    if "generateContent" in m.supported_generation_methods:
        print(m.name)

print("\nList of models that support embedContent:\n")
for m in genai.list_models():
    if "embedContent" in m.supported_generation_methods:
        print(m.name)