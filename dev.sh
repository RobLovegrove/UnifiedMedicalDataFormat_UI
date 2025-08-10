#!/bin/bash

# Development script for UMDF UI
# This script starts both the FastAPI backend and React frontend

echo "🚀 Starting UMDF UI Development Environment..."

# Function to cleanup background processes
cleanup() {
    echo "🛑 Shutting down development environment..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start FastAPI backend
echo "🔧 Starting FastAPI backend on port 8000..."
python run.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Check if backend is running
if ! curl -s http://localhost:8000/api/cpp/schemas > /dev/null; then
    echo "❌ Failed to start FastAPI backend"
    exit 1
fi

echo "✅ FastAPI backend is running on http://localhost:8000"

# Start React frontend
echo "⚛️  Starting React frontend on port 3000..."
cd frontend
npm run dev &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 5

# Check if frontend is running
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "❌ Failed to start React frontend"
    exit 1
fi

echo "✅ React frontend is running on http://localhost:3000"
echo ""
echo "🌐 Access your application at:"
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for both processes
wait 