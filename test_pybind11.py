#!/usr/bin/env python3
"""
Test script for the updated UMDF Python bindings
"""

import sys
import os
import json

# Add the cpp_interface directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'cpp_interface'))

try:
    from umdf_interface import UMDFReader, UMDFWriter, read_umdf_file, get_module_data
    print("✓ Successfully imported umdf_interface module")
except ImportError as e:
    print(f"✗ Failed to import umdf_interface: {e}")
    sys.exit(1)

def test_basic_functionality():
    """Test basic functionality of the UMDF reader"""
    
    # Test file info
    print("\n=== Testing File Info ===")
    try:
        file_info = read_umdf_file('example.umdf')
        print(f"File info: {json.dumps(file_info, indent=2)}")
    except Exception as e:
        print(f"Error getting file info: {e}")
    
    # Test module data
    print("\n=== Testing Module Data ===")
    try:
        # Get the image module data (you'll need to replace this with an actual module ID)
        # First, let's get file info to see what modules are available
        reader = UMDFReader()
        if reader.read_file('example.umdf'):
            file_info = reader.get_file_info()
            print(f"File info: {json.dumps(file_info, indent=2)}")
            
            # Try to get module data if we can identify a module ID
            # This is a placeholder - you'll need to extract actual module IDs from file_info
            print("Note: Module data testing requires actual module IDs from the file")
            
            reader.close_file()
    except Exception as e:
        print(f"Error getting module data: {e}")

def test_reader_class():
    """Test the Reader class directly"""
    
    print("\n=== Testing Reader Class ===")
    try:
        reader = UMDFReader()
        success = reader.read_file('example.umdf')
        print(f"File read successfully: {success}")
        
        if success:
            file_info = reader.get_file_info()
            print(f"File info: {json.dumps(file_info, indent=2)}")
            
            # Close the file
            reader.close_file()
    except Exception as e:
        print(f"Error testing Reader class: {e}")

def test_writer_class():
    """Test the Writer class functionality"""
    
    print("\n=== Testing Writer Class ===")
    try:
        writer = UMDFWriter()
        
        # Create a new file
        test_filename = f"test_output_{int(time.time())}.umdf"
        success = writer.create_new_file(test_filename, "test_user", "test_password")
        print(f"File created successfully: {success}")
        
        if success:
            # Create a new encounter
            encounter_id = writer.create_new_encounter()
            print(f"Encounter created with ID: {encounter_id}")
            
            if encounter_id:
                # Close the file
                close_success = writer.close_file()
                print(f"File closed successfully: {close_success}")
                
                # Clean up test file
                if os.path.exists(test_filename):
                    os.remove(test_filename)
                    print(f"Test file {test_filename} cleaned up")
        
    except Exception as e:
        print(f"Error testing Writer class: {e}")

if __name__ == "__main__":
    import time
    
    print("Testing Updated UMDF Python Bindings")
    print("=" * 40)
    
    test_basic_functionality()
    test_reader_class()
    test_writer_class()
    
    print("\n✓ All tests completed!")
