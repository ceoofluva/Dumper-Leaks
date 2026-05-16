# cli.py

import argparse
from main import deobfuscate_moonsec


def main():
    parser = argparse.ArgumentParser(
        description="MoonSec V3 Deobfuscator CLI"
    )

    parser.add_argument(
        "input",
        help="Input Lua file"
    )

    parser.add_argument(
        "-o",
        "--output",
        default="output.lua",
        help="Output file"
    )

    args = parser.parse_args()

    try:
        result = deobfuscate_moonsec(args.input)

        with open(args.output, "w", encoding="utf-8") as f:
            f.write(result)

        print(f"[+] Saved deobfuscated script to {args.output}")

    except Exception as e:
        print(f"[-] Error: {e}")


if __name__ == "__main__":
    main()
