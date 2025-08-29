"""
UMDF Reader Module - copied from main project
"""

import os
import sys

# Add the current directory to the path so Python can find the module
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

try:
    import umdf_reader
    print("✓ Successfully imported umdf_reader module")
except ImportError as e:
    print(f"✗ Failed to import umdf_reader: {e}")
    raise

# Re-export the main classes
Reader = umdf_reader.Reader
Writer = umdf_reader.Writer
ModuleData = umdf_reader.ModuleData
UUID = umdf_reader.UUID
Result = umdf_reader.Result

__all__ = ['Reader', 'Writer', 'ModuleData', 'UUID', 'Result']
