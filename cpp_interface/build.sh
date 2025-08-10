#!/bin/bash

# Build script for UMDF Python interface

set -e

echo "Building UMDF Python interface..."

# Create build directory
mkdir -p build
cd build

# Configure with CMake
cmake ..

# Build the library
make -j$(nproc)

echo "Build completed!"
echo "Library should be available at: build/libumdf_python.dylib"

# Copy the library to the parent directory for Python to find
cp libumdf_python.dylib ../umdf_python.dylib 2>/dev/null || cp libumdf_python.so ../umdf_python.so 2>/dev/null || cp umdf_python.dll ../umdf_python.dll 2>/dev/null || echo "Library not found"

echo "Library copied to cpp_interface directory" 