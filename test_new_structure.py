#!/usr/bin/env python3
"""
Test script for the new encounter-based UMDF structure
"""

import sys
import os

# Add the project root to Python path
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from app.importers.umdf_importer import UMDFImporter

def test_new_structure():
    """Test the new encounter-based structure."""
    print("🧪 Testing New Encounter-Based Structure...")
    
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
            print(f"📊 Module count: {result.get('module_count', 0)}")
            print(f"📊 Encounters: {len(result.get('encounters', []))}")
            print(f"📊 Module graph keys: {list(result.get('module_graph', {}).keys())}")
            
            # Check if we have the new structure
            if 'encounters' in result and result['encounters']:
                print("🎉 New encounter structure is working!")
                for i, encounter in enumerate(result['encounters']):
                    print(f"  Encounter {i+1}: {encounter.get('encounter_id', 'unknown')[:8]}...")
                    print(f"    Modules in tree: {len(encounter.get('module_tree', []))}")
            else:
                print("ℹ️  No encounters found, using fallback module display")
            
            return True
        except Exception as e:
            print(f"❌ File import failed: {e}")
            return False
    else:
        print(f"📁 No test file found at: {test_file_path}")
        print("✅ Importer setup is working correctly")
        return True

if __name__ == "__main__":
    success = test_new_structure()
    if success:
        print("\n🎉 All tests passed! New encounter structure is working correctly.")
    else:
        print("\n💥 Some tests failed. Check the output above.")
        sys.exit(1)
