#!/usr/bin/env bash
# Start ReconAI development server
set -e

cd "$(dirname "$0")"

# Load .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Create required directories
mkdir -p output tools wordlists

# Install/update Python deps
if ! python3 -c "import fastapi" 2>/dev/null; then
  echo "Installing Python dependencies..."
  pip3 install -r backend/requirements.txt
fi

export PYTHONPATH="$(pwd)"

echo "Starting ReconAI on http://localhost:8000"
python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
