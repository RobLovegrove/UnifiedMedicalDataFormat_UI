#!/usr/bin/env python3
"""
Test script for the pybind11 UMDF reader module
"""

import sys
import os
import json

# Add the cpp_interface directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'cpp_interface'))

try:
    import umdf_reader
    print("✓ Successfully imported umdf_reader module")
except ImportError as e:
    print(f"✗ Failed to import umdf_reader: {e}")
    sys.exit(1)

def test_basic_functionality():
    """Test basic functionality of the UMDF reader"""
    
    # Test file info
    print("\n=== Testing File Info ===")
    try:
        file_info = umdf_reader.read_umdf_file('example.umdf')
        print(f"File info: {json.dumps(file_info, indent=2)}")
    except Exception as e:
        print(f"Error getting file info: {e}")
    
    # Test module data
    print("\n=== Testing Module Data ===")
    try:
        # Get the image module data
        module_data = umdf_reader.get_module_data('example.umdf', '1506fa44-59f3-4787-aedf-6189f48b45dd')
        print(f"Module data keys: {list(module_data.keys())}")
        print(f"Number of frames: {len(module_data['data'])}")
        
        # Show first frame info
        if module_data['data']:
            first_frame = module_data['data'][0]
            print(f"First frame metadata: {json.dumps(first_frame['metadata'], indent=2)}")
            print(f"First frame data size: {len(first_frame['data'])} bytes")
    except Exception as e:
        print(f"Error getting module data: {e}")

def test_reader_class():
    """Test the Reader class directly"""
    
    print("\n=== Testing Reader Class ===")
    try:
        reader = umdf_reader.Reader()
        success = reader.readFile('example.umdf')
        print(f"File read successfully: {success}")
        
        if success:
            module_ids = reader.getModuleIds()
            print(f"Module IDs: {module_ids}")
            
            # Get module list
            module_list = reader.getModuleList()
            print(f"Module list: {json.dumps(module_list, indent=2)}")
    except Exception as e:
        print(f"Error testing Reader class: {e}")

if __name__ == "__main__":
    print("Testing UMDF Reader Python Module")
    print("=" * 40)
    
    test_basic_functionality()
    test_reader_class()
    
    print("\n✓ All tests completed!")
