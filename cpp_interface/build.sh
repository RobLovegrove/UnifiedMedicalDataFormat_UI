#!/bin/bash

# Build script for UMDF Python bindings in UMDF_UI
# This script builds the Python extension using the main UMDF project's bindings

set -e

echo "Building UMDF Python bindings for UMDF_UI..."

# Check if we're in the right directory
if [ ! -f "setup.py" ]; then
    echo "Error: setup.py not found. Please run this script from the cpp_interface directory."
    exit 1
fi

# Check if UMDF project exists
if [ ! -d "../../UMDF" ]; then
    echo "Error: UMDF project directory not found. Please ensure the UMDF project is in the parent directory of UMDF_UI."
    echo "Expected path: ../../UMDF"
    exit 1
fi

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf build/ dist/ *.egg-info/

# Install in development mode
echo "Installing in development mode..."
pip install -e .

echo "✓ Build completed successfully!"
echo ""
echo "You can now test the bindings by running:"
echo "  cd .."
echo "  python test_pybind11.py"
echo ""
echo "Or import in Python:"
echo "  from cpp_interface.umdf_interface import UMDFReader, UMDFWriter" 