cmake_minimum_required(VERSION 3.10)
project(UMDF_Python_Interface)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Set output directory
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR})

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/../../UMDF/include
    ${CMAKE_CURRENT_SOURCE_DIR}/../../UMDF/src
    ${CMAKE_CURRENT_SOURCE_DIR}/../../UMDF/src/Header
    ${CMAKE_CURRENT_SOURCE_DIR}/../../UMDF/src/Xref
    ${CMAKE_CURRENT_SOURCE_DIR}/../../UMDF/src/DataModule
    ${CMAKE_CURRENT_SOURCE_DIR}/../../UMDF/src/DataModule/Tabular
    ${CMAKE_CURRENT_SOURCE_DIR}/../../UMDF/src/DataModule/Image
    ${CMAKE_CURRENT_SOURCE_DIR}/../../UMDF/src/Utility
)

# Source files from the main UMDF project
set(UMDF_SOURCES
    ../../UMDF/src/writer.cpp
    ../../UMDF/src/reader.cpp
    ../../UMDF/src/Header/header.cpp
    ../../UMDF/src/Xref/xref.cpp
    ../../UMDF/src/DataModule/Tabular/tabularData.cpp
    ../../UMDF/src/DataModule/Image/imageData.cpp
    ../../UMDF/src/DataModule/Header/dataHeader.cpp
    ../../UMDF/src/Utility/utils.cpp
    ../../UMDF/src/Utility/uuid.cpp
)

# Create shared library
add_library(umdf SHARED ${UMDF_SOURCES})

# Set library name based on platform
if(APPLE)
    set_target_properties(umdf PROPERTIES OUTPUT_NAME "umdf")
    set_target_properties(umdf PROPERTIES PREFIX "lib")
    set_target_properties(umdf PROPERTIES SUFFIX ".dylib")
elseif(UNIX)
    set_target_properties(umdf PROPERTIES OUTPUT_NAME "umdf")
    set_target_properties(umdf PROPERTIES PREFIX "lib")
    set_target_properties(umdf PROPERTIES SUFFIX ".so")
elseif(WIN32)
    set_target_properties(umdf PROPERTIES OUTPUT_NAME "umdf")
    set_target_properties(umdf PROPERTIES SUFFIX ".dll")
endif()

# Copy schemas to build directory
file(COPY ../../UMDF/schemas DESTINATION ${CMAKE_CURRENT_BINARY_DIR})

# Create a simple C interface for Python
add_library(umdf_python SHARED
    umdf_python_interface.cpp
    ${UMDF_SOURCES}
)

# Set library name for Python interface
if(APPLE)
    set_target_properties(umdf_python PROPERTIES OUTPUT_NAME "umdf_python")
    set_target_properties(umdf_python PROPERTIES PREFIX "lib")
    set_target_properties(umdf_python PROPERTIES SUFFIX ".dylib")
elseif(UNIX)
    set_target_properties(umdf_python PROPERTIES OUTPUT_NAME "umdf_python")
    set_target_properties(umdf_python PROPERTIES PREFIX "lib")
    set_target_properties(umdf_python PROPERTIES SUFFIX ".so")
elseif(WIN32)
    set_target_properties(umdf_python PROPERTIES OUTPUT_NAME "umdf_python")
    set_target_properties(umdf_python PROPERTIES SUFFIX ".dll")
endif() 