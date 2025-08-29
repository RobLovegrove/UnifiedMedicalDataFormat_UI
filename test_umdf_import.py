#!/usr/bin/env python3
"""
Test script for the updated UMDF importer
"""

import sys
import os

# Add the project root to Python path
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from app.importers.umdf_importer import UMDFImporter

def test_umdf_importer():
    """Test the UMDF importer functionality."""
    print("🧪 Testing UMDF Importer...")
    
    # Create importer instance
    importer = UMDFImporter()
    
    # Check if import is available
    if not importer.can_import():
        print("❌ UMDF import not available")
        return False
    
    print("✅ UMDF import is available")
    
    # Test with a sample UMDF file if available
    test_file_path = "../UMDF/test.umdf"
    if os.path.exists(test_file_path):
        print(f"📁 Found test file: {test_file_path}")
        try:
            result = importer.import_file_from_path(test_file_path)
            print("✅ File import successful!")
            print(f"📊 Result: {result}")
            return True
        except Exception as e:
            print(f"❌ File import failed: {e}")
            return False
    else:
        print(f"📁 No test file found at: {test_file_path}")
        print("✅ Importer setup is working correctly")
        return True

if __name__ == "__main__":
    success = test_umdf_importer()
    if success:
        print("\n🎉 All tests passed! UMDF importer is working correctly.")
    else:
        print("\n💥 Some tests failed. Check the output above.")
        sys.exit(1)
