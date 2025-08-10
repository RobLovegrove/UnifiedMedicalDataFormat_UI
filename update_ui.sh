#!/bin/bash

# Update UI script - Automates rebuilding and copying the latest C++ module to the UI project
# Usage: ./update_ui.sh

set -e  # Exit on any error

echo "🔄 Updating UI with latest C++ changes..."
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
UMDF_PROJECT="/Users/rob/Documents/CS/Dissertation/UMDF"
UI_PROJECT="/Users/rob/Documents/CS/Dissertation/UMDF_UI"
PYBIND_DIR="$UMDF_PROJECT/pybind"
CPP_INTERFACE_DIR="$UI_PROJECT/cpp_interface"

echo -e "${BLUE}📁 Paths:${NC}"
echo "  C++ Project: $UMDF_PROJECT"
echo "  UI Project: $UI_PROJECT"
echo "  Pybind Directory: $PYBIND_DIR"
echo "  CPP Interface Directory: $CPP_INTERFACE_DIR"
echo ""

# Check if directories exist
if [ ! -d "$UMDF_PROJECT" ]; then
    echo -e "${RED}❌ C++ project directory not found: $UMDF_PROJECT${NC}"
    exit 1
fi

if [ ! -d "$UI_PROJECT" ]; then
    echo -e "${RED}❌ UI project directory not found: $UI_PROJECT${NC}"
    exit 1
fi

if [ ! -d "$PYBIND_DIR" ]; then
    echo -e "${RED}❌ Pybind directory not found: $PYBIND_DIR${NC}"
    exit 1
fi

# Create cpp_interface directory if it doesn't exist
if [ ! -d "$CPP_INTERFACE_DIR" ]; then
    echo -e "${YELLOW}📁 Creating cpp_interface directory...${NC}"
    mkdir -p "$CPP_INTERFACE_DIR"
fi

echo -e "${BLUE}🔨 Step 1: Building latest C++ module...${NC}"
cd "$PYBIND_DIR"

# Check if build.py exists
if [ ! -f "build.py" ]; then
    echo -e "${RED}❌ build.py not found in pybind directory${NC}"
    exit 1
fi

# Build the module
echo "Running build script..."
python3 build.py

# Check if build was successful
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful!${NC}"

# Find the compiled .so file
SO_FILE=$(find "$UMDF_PROJECT" -name "umdf_reader.cpython-*.so" -type f | head -1)

if [ -z "$SO_FILE" ]; then
    echo -e "${RED}❌ No compiled .so file found!${NC}"
    exit 1
fi

echo -e "${BLUE}📁 Found compiled module: $SO_FILE${NC}"

echo -e "${BLUE}📋 Step 2: Linking module to UI project...${NC}"

# Remove existing module if it exists
if [ -f "$CPP_INTERFACE_DIR/$(basename "$SO_FILE")" ]; then
    rm "$CPP_INTERFACE_DIR/$(basename "$SO_FILE")"
fi

# Create symbolic link instead of copying to preserve code signature
ln -sf "$SO_FILE" "$CPP_INTERFACE_DIR/"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Module linked successfully!${NC}"
else
    echo -e "${RED}❌ Failed to link module${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Step 3: Copying schemas (if needed)...${NC}"

# Copy schemas if they don't exist in UI project
if [ -d "$UMDF_PROJECT/schemas" ] && [ ! -d "$UI_PROJECT/schemas" ]; then
    echo "Copying schemas directory..."
    cp -r "$UMDF_PROJECT/schemas" "$UI_PROJECT/"
    echo -e "${GREEN}✅ Schemas copied!${NC}"
else
    echo -e "${YELLOW}⚠️  Schemas already exist or not found${NC}"
fi

echo -e "${BLUE}🧪 Step 4: Testing the updated module...${NC}"

# Test the module
cd "$UI_PROJECT"

if [ -f "test_pybind11.py" ]; then
    echo "Running pybind11 test..."
    python3 test_pybind11.py
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Test passed!${NC}"
    else
        echo -e "${YELLOW}⚠️  Test had issues (check output above)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No test_pybind11.py found - skipping test${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Update complete!${NC}"
echo ""
echo -e "${BLUE}📝 Summary:${NC}"
echo "  ✅ C++ module rebuilt"
echo "  ✅ Module linked to UI project"
echo "  ✅ Schemas updated (if needed)"
echo "  ✅ Basic test completed"
echo ""
echo -e "${YELLOW}💡 Next steps:${NC}"
echo "  - Test your UI application"
echo "  - Run your UI tests"
echo "  - Deploy if everything looks good"
echo ""
echo -e "${BLUE}📁 Updated files:${NC}"
echo "  $CPP_INTERFACE_DIR/$(basename "$SO_FILE")"
if [ -d "$UI_PROJECT/schemas" ]; then
    echo "  $UI_PROJECT/schemas/"
fi 