import httpx
import json
import os
from typing import Optional

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "60"))
OLLAMA_THINK = os.getenv("OLLAMA_THINK", "false").lower() == "true"

_PROMPT = """\
Sei un assistente culinario. Restituisci SOLO un oggetto JSON valido — nessun markdown, nessuna prosa, nessun testo extra.

Compila i dettagli per questo piatto: "{name}"

Struttura JSON richiesta:
{{
  "carbohydrate": "<main carb, e.g. pasta/riso/patate — null if unknown>",
  "protein": "<main protein, e.g. pollo/manzo/salmone — null if unknown>",
  "vegetable": "<main vegetable or fibre, e.g. spinaci/pomodoro — null if unknown>",
  "ingredients": {{"<ingredient name>": <grams as integer>, ...}},
  "instructions": "<step-by-step cooking instructions in Italian as a single string — null if unsure>"
}}

Rules:
- Quantities are conservative estimates for 2 servings.
- At most 12 ingredients.
- Unknown or uncertain values must be null, not guessed.
- No nutritional, medical, or legal claims.
- Output valid JSON only — nothing else.
"""


def _sanitize_ingredients(raw: object) -> dict[str, int]:
    if not isinstance(raw, dict):
        return {}
    result: dict[str, int] = {}
    for k, v in raw.items():
        if isinstance(k, str) and k.strip():
            try:
                result[k.strip()] = int(v)
            except (ValueError, TypeError):
                pass
    return result


async def autofill_meal(name: str) -> dict:
    prompt = _PROMPT.format(name=name.strip())
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "think": OLLAMA_THINK,
    }

    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
        try:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload)
        except httpx.ConnectError:
            raise RuntimeError(
                f"Impossibile connettersi a Ollama ({OLLAMA_BASE_URL}). "
                "Assicurati che il container 'ollama' sia avviato."
            )
        except httpx.TimeoutException:
            raise RuntimeError(
                f"Ollama ha impiegato più di {OLLAMA_TIMEOUT}s per rispondere. "
                "Il modello è in esecuzione su CPU: considera un modello più piccolo "
                f"(es. llama3.2:1b) oppure aumenta OLLAMA_TIMEOUT."
            )
        if resp.status_code == 404:
            raise RuntimeError(
                f"Modello '{OLLAMA_MODEL}' non trovato. "
                f"Esegui: docker exec mealplan-pro_ollama ollama pull {OLLAMA_MODEL}"
            )
        if resp.status_code == 500:
            raise RuntimeError(
                f"Ollama ha restituito un errore interno. "
                "Controlla i log del container ollama per maggiori dettagli."
            )
        resp.raise_for_status()
        raw_text = resp.json().get("response", "{}")

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        parsed = {}

    return {
        "carbohydrate": parsed.get("carbohydrate") or None,
        "protein": parsed.get("protein") or None,
        "vegetable": parsed.get("vegetable") or None,
        "ingredients": _sanitize_ingredients(parsed.get("ingredients")),
        "instructions": parsed.get("instructions") or None,
    }
