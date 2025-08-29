#!/bin/bash
# Script to activate the Python virtual environment

# Activate Python virtual environment
echo "Activating Python virtual environment..."

# Check if .venv directory exists
if [ -d ".venv" ]; then
    source .venv/bin/activate
    echo "Virtual environment activated! You can now run: python3 run.py"
    echo ""
    echo "To deactivate later, simply run: deactivate"
else
    echo "Error: .venv directory not found!"
    echo "Please run: python3 -m venv .venv"
    exit 1
fi
