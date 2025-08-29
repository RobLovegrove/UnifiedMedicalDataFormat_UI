#!/usr/bin/env python3
"""
Debug script to test UMDF reader functionality
"""

import sys
import os

# Add the project root to Python path
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

try:
    from cpp_interface.umdf_interface import UMDFReader
    print("✓ Successfully imported UMDFReader")
    
    # Create a reader instance
    reader = UMDFReader()
    print("✓ Created UMDFReader instance")
    
    # Test the reader methods
    print(f"Reader type: {type(reader)}")
    print(f"Reader.reader type: {type(reader.reader)}")
    
    # Check available methods
    print(f"Available methods on reader.reader: {[method for method in dir(reader.reader) if not method.startswith('_')]}")
    
    # Test with a dummy file path
    test_path = "/tmp/test.umdf"
    print(f"\nTesting with dummy path: {test_path}")
    
    try:
        result = reader.reader.openFile(test_path, "")
        print(f"openFile result type: {type(result)}")
        print(f"openFile result: {result}")
        
        if hasattr(result, 'success'):
            print(f"result.success: {result.success}")
        if hasattr(result, 'message'):
            print(f"result.message: {result.message}")
        
        # Try to access all attributes
        for attr in dir(result):
            if not attr.startswith('_'):
                try:
                    value = getattr(result, attr)
                    print(f"result.{attr}: {value}")
                except Exception as e:
                    print(f"result.{attr}: Error accessing - {e}")
                    
    except Exception as e:
        print(f"Error testing openFile: {e}")
        import traceback
        traceback.print_exc()
    
except ImportError as e:
    print(f"✗ Failed to import: {e}")
    import traceback
    traceback.print_exc()
except Exception as e:
    print(f"✗ Unexpected error: {e}")
    import traceback
    traceback.print_exc()
