from setuptools import setup, Extension
from pybind11.setup_helpers import Pybind11Extension
import os

# Get the current directory (cpp_interface)
current_dir = os.path.dirname(os.path.abspath(__file__))
# Go up two levels to find the UMDF project
umdf_project_root = os.path.join(current_dir, "..", "..", "UMDF")

ext_modules = [
    Pybind11Extension(
        "umdf_reader",  # Match the module name from main UMDF project
        [
            os.path.join(umdf_project_root, "pybind/pybind11_bridge.cpp"),
            os.path.join(umdf_project_root, "pybind/common_bindings.cpp"),
            os.path.join(umdf_project_root, "pybind/reader_bindings.cpp"),
            os.path.join(umdf_project_root, "pybind/writer_bindings.cpp")
        ],
        include_dirs=[
            os.path.join(umdf_project_root, "include"),
            os.path.join(umdf_project_root, "src"),
            "/opt/homebrew/include",  # macOS Homebrew
            "/opt/homebrew/include/openjpeg-2.5",
            "/opt/homebrew/opt/zstd/include",
            "/opt/homebrew/opt/libsodium/include"
        ],
        libraries=["openjp2", "png", "zstd", "sodium"],
        library_dirs=[
            "/opt/homebrew/lib",  # macOS Homebrew
            "/opt/homebrew/opt/zstd/lib",
            "/opt/homebrew/opt/libsodium/lib"
        ],
        extra_compile_args=[
            "-std=c++23", 
            "-Wall", 
            "-Wextra",
        ],
        extra_link_args=["-std=c++23"]
    )
]

setup(
    name="umdf_reader",
    version="1.0.0",
    description="UMDF Python bindings for UMDF_UI - using main project bindings",
    author="Your Name",
    author_email="your.email@example.com",
    ext_modules=ext_modules,
    install_requires=["pybind11>=2.10.0"],
    python_requires=">=3.8",
    zip_safe=False,
)
