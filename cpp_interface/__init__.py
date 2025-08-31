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
    import umdf
    print("✓ Successfully imported umdf module")
except ImportError as e:
    print(f"✗ Failed to import umdf: {e}")
    raise

# Re-export the main classes
Reader = umdf.Reader
Writer = umdf.Writer
ModuleData = umdf.ModuleData
UUID = umdf.UUID
Result = umdf.Result

__all__ = ['Reader', 'Writer', 'ModuleData', 'UUID', 'Result']
