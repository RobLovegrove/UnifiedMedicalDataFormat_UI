#!/usr/bin/env python3
"""
Debug script to test Writer functionality step by step
"""

import sys
import os
import time

# Add the cpp_interface directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'cpp_interface'))

try:
    from umdf_interface import UMDFWriter
    print("✓ Successfully imported umdf_interface module")
except ImportError as e:
    print(f"✗ Failed to import umdf_interface: {e}")
    sys.exit(1)

def debug_writer():
    """Debug the Writer functionality step by step"""
    
    print("Debugging Writer Functionality")
    print("=" * 30)
    
    writer = UMDFWriter()
    test_filename = f"debug_test_{int(time.time())}.umdf"
    
    print(f"\n1. Creating file: {test_filename}")
    print(f"   Current directory: {os.getcwd()}")
    
    success = writer.create_new_file(test_filename, "test_user", "test_password")
    print(f"   create_new_file result: {success}")
    
    if success:
        print(f"\n2. File created successfully")
        print(f"   Checking if file exists: {os.path.exists(test_filename)}")
        print(f"   File size: {os.path.getsize(test_filename) if os.path.exists(test_filename) else 'N/A'}")
        
        print(f"\n3. Creating encounter...")
        encounter_id = writer.create_new_encounter()
        print(f"   Encounter ID: {encounter_id}")
        
        if encounter_id:
            print(f"\n4. Encounter created successfully")
            print(f"   Closing file...")
            
            close_success = writer.close_file()
            print(f"   close_file result: {close_success}")
            
            if close_success:
                print(f"\n5. File closed successfully")
                print(f"   Final file exists: {os.path.exists(test_filename)}")
                print(f"   Final file size: {os.path.getsize(test_filename) if os.path.exists(test_filename) else 'N/A'}")
                
                # List all files in current directory
                print(f"\n6. All files in current directory:")
                for file in os.listdir('.'):
                    if file.endswith('.umdf'):
                        size = os.path.getsize(file)
                        print(f"   {file}: {size} bytes")
            else:
                print(f"   ✗ Failed to close file")
        else:
            print(f"   ✗ Failed to create encounter")
    else:
        print(f"   ✗ Failed to create file")
    
    print(f"\n🎉 Debug completed!")

if __name__ == "__main__":
    debug_writer()
