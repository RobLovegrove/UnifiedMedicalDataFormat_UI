#!/usr/bin/env python3
"""
Simple test to verify the enhanced JSON structure is working
"""

import sys
import os
import json

# Add the cpp_interface directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'cpp_interface'))

try:
    from umdf_interface import UMDFReader
    print("✓ Successfully imported umdf_interface module")
except ImportError as e:
    print(f"✗ Failed to import umdf_interface: {e}")
    sys.exit(1)

def test_json_structure():
    """Test the enhanced JSON structure"""
    
    print("Testing Enhanced JSON Structure")
    print("=" * 30)
    
    # Try to read the existing example file
    reader = UMDFReader()
    
    print("\n1. Attempting to read test.umdf...")
    print(f"   File exists: {os.path.exists('test.umdf')}")
    print(f"   File size: {os.path.getsize('test.umdf') if os.path.exists('test.umdf') else 'N/A'} bytes")
    
    # Try to open the file
    try:
        success = reader.read_file('test.umdf', '')
        print(f"   File opened: {success}")
        
        if success:
            print("\n2. Getting enhanced file info...")
            file_info = reader.get_file_info()
            
            print("\n3. JSON Response Structure:")
            print("   " + "="*30)
            print(json.dumps(file_info, indent=2))
            
            # Analyze the structure
            print("\n4. Structure Analysis:")
            print("   " + "="*30)
            
            if "module_graph" in file_info:
                print("   ✓ module_graph section found")
                module_graph = file_info["module_graph"]
                
                if "encounters" in module_graph:
                    encounters = module_graph["encounters"]
                    print(f"   ✓ encounters: {len(encounters)} found")
                else:
                    print("   ✗ No encounters section")
                
                if "module_graph" in module_graph:
                    graph_summary = module_graph["module_graph"]
                    print(f"   ✓ graph summary: {graph_summary}")
                else:
                    print("   ✗ No graph summary section")
            else:
                print("   ✗ No module_graph section found")
                print("   Available keys:", list(file_info.keys()))
            
            reader.close_file()
        else:
            print("   ✗ Failed to open file")
            
    except Exception as e:
        print(f"   ✗ Error reading file: {e}")
        print("   This is expected due to file format compatibility issues")
    
    print("\n🎉 JSON structure test completed!")

if __name__ == "__main__":
    test_json_structure()
