#!/usr/bin/env python3
"""
Simple setup script that copies the built UMDF module from the main project
"""

import os
import shutil
import subprocess
import sys

def main():
    # Get the current directory (cpp_interface)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up two levels to find the UMDF project
    umdf_project_root = os.path.join(current_dir, "..", "..", "UMDF")
    
    print(f"Looking for UMDF project at: {umdf_project_root}")
    
    if not os.path.exists(umdf_project_root):
        print(f"Error: UMDF project not found at {umdf_project_root}")
        sys.exit(1)
    
    # Check if the main UMDF project has been built
    pybind_dir = os.path.join(umdf_project_root, "pybind")
    if not os.path.exists(pybind_dir):
        print(f"Error: pybind directory not found at {pybind_dir}")
        sys.exit(1)
    
    # Try to build the main UMDF project first
    print("Building main UMDF project...")
    try:
        subprocess.run(["make", "pybind"], cwd=umdf_project_root, check=True)
        print("✓ Main UMDF project built successfully")
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to build main UMDF project: {e}")
        sys.exit(1)
    
    # Look for the built module in the root of the UMDF project
    module_name = "umdf_reader"
    possible_extensions = [".so", ".dylib", ".pyd"]
    source_module = None
    
    for ext in possible_extensions:
        test_path = os.path.join(umdf_project_root, f"{module_name}{ext}")
        if os.path.exists(test_path):
            source_module = test_path
            break
    
    if not source_module:
        print("Error: Built module not found. Expected one of:")
        for ext in possible_extensions:
            print(f"  {os.path.join(umdf_project_root, f'{module_name}{ext}')}")
        sys.exit(1)
    
    print(f"Found built module: {source_module}")
    
    # Copy to current directory
    target_module = os.path.join(current_dir, f"{module_name}{os.path.splitext(source_module)[1]}")
    print(f"Copying to: {target_module}")
    
    try:
        shutil.copy2(source_module, target_module)
        print("✓ Module copied successfully")
    except Exception as e:
        print(f"✗ Failed to copy module: {e}")
        sys.exit(1)
    
    # Create a simple __init__.py for the module
    init_content = f'''"""
UMDF Reader Module - copied from main project
"""

import os
import sys

# Add the current directory to the path so Python can find the module
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

try:
    import {module_name}
    print("✓ Successfully imported {module_name} module")
except ImportError as e:
    print(f"✗ Failed to import {module_name}: {{e}}")
    raise

# Re-export the main classes
Reader = {module_name}.Reader
Writer = {module_name}.Writer
ModuleData = {module_name}.ModuleData
UUID = {module_name}.UUID
Result = {module_name}.Result

__all__ = ['Reader', 'Writer', 'ModuleData', 'UUID', 'Result']
'''
    
    init_file = os.path.join(current_dir, "__init__.py")
    with open(init_file, "w") as f:
        f.write(init_content)
    
    print("✓ Created __init__.py")
    print("\n🎉 Setup completed successfully!")
    print(f"You can now import the module from: {current_dir}")
    print("Or test it by running: python test_pybind11.py")

if __name__ == "__main__":
    main()
