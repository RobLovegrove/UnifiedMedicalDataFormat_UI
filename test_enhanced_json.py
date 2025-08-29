#!/usr/bin/env python3
"""
Test script to demonstrate the enhanced getFileInfo JSON structure
"""

import sys
import os
import json
import time

# Add the cpp_interface directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'cpp_interface'))

try:
    from umdf_interface import UMDFWriter, UMDFReader
    print("✓ Successfully imported umdf_interface module")
except ImportError as e:
    print(f"✗ Failed to import umdf_interface: {e}")
    sys.exit(1)

def test_enhanced_json():
    """Test the enhanced getFileInfo JSON structure"""
    
    print("Testing Enhanced getFileInfo JSON Structure")
    print("=" * 50)
    
    # Create a new file with some structure
    writer = UMDFWriter()
    test_filename = f"test_enhanced_json_{int(time.time())}.umdf"
    
    print(f"\n1. Creating new file: {test_filename}")
    success = writer.create_new_file(test_filename, "test_user", "test_password")
    print(f"   File created: {success}")
    
    if success:
        # Create an encounter
        print("\n2. Creating encounter...")
        encounter_id = writer.create_new_encounter()
        print(f"   Encounter ID: {encounter_id}")
        
        if encounter_id:
            # Close the file to finalize it
            print("\n3. Closing file...")
            close_success = writer.close_file()
            print(f"   File closed: {close_success}")
            
            if close_success:
                # Now read the file back and test the enhanced JSON
                print("\n4. Reading file back with enhanced getFileInfo...")
                reader = UMDFReader()
                
                if reader.read_file(test_filename, "test_password"):
                    print("   File opened successfully")
                    
                    # Get the enhanced file info
                    file_info = reader.get_file_info()
                    
                    print("\n5. Enhanced JSON Structure:")
                    print("   " + "="*40)
                    print(json.dumps(file_info, indent=2))
                    
                    # Analyze the structure
                    print("\n6. JSON Structure Analysis:")
                    print("   " + "="*40)
                    
                    if "module_graph" in file_info:
                        module_graph = file_info["module_graph"]
                        print(f"   ✓ Module graph found")
                        
                        if "encounters" in module_graph:
                            encounters = module_graph["encounters"]
                            print(f"   ✓ Encounters: {len(encounters)} found")
                            
                            for i, encounter in enumerate(encounters):
                                print(f"     Encounter {i+1}: {encounter.get('id', 'N/A')}")
                                if "module_tree" in encounter:
                                    print(f"       ✓ Module tree structure present")
                                else:
                                    print(f"       ✗ No module tree structure")
                        
                        if "module_graph" in module_graph:
                            graph_summary = module_graph["module_graph"]
                            print(f"   ✓ Graph summary: {graph_summary}")
                    else:
                        print("   ✗ No module_graph in response")
                    
                    # Close the reader
                    reader.close_file()
                else:
                    print("   ✗ Failed to open file for reading")
            else:
                print("   ✗ Failed to close file")
        else:
            print("   ✗ Failed to create encounter")
    else:
        print("   ✗ Failed to create file")
    
    # Clean up test file
    if os.path.exists(test_filename):
        os.remove(test_filename)
        print(f"\n✓ Test file {test_filename} cleaned up")
    
    print("\n🎉 Enhanced JSON test completed!")

if __name__ == "__main__":
    test_enhanced_json()
