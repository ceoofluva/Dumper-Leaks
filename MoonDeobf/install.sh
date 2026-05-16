#!/usr/bin/env bash

if command -v termux-info >/dev/null 2>&1; then
    pkg update -y && pkg install -y python git curl wget

elif [ -f /etc/debian_version ]; then
    sudo apt update && sudo apt install -y python3 python3-pip git curl wget

elif [ -f /etc/arch-release ]; then
    sudo pacman -Sy --noconfirm python python-pip git curl wget

elif [ -f /etc/fedora-release ]; then
    sudo dnf install -y python3 python3-pip git curl wget

elif [ -f /etc/alpine-release ]; then
    sudo apk add python3 py3-pip git curl wget

elif [[ "$OSTYPE" == "darwin"* ]]; then
    command -v brew >/dev/null 2>&1 || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    brew install python git curl wget

else
    echo "Unsupported OS"
    exit 1
fi

python --version 2>/dev/null || python3 --version
