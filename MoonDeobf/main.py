# main.py

import requests

API_URL = "https://leakd-detector.up.railway.app/moonsec"


def deobfuscate_moonsec(file_path: str) -> str:
    with open(file_path, "rb") as f:
        response = requests.post(
            API_URL,
            files={"file": f}
        )

    response.raise_for_status()

    data = response.json()

    if not data.get("success"):
        raise Exception("Failed to deobfuscate script")

    code = data.get("deobfuscated_code", "")
  
    code = code.replace("-- Deobfuscated by LeakD | discord.gg/qteAQmfJmP", "").strip()

    return code
