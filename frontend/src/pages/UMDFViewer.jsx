import React, { useState, useEffect } from 'react';
import ProcessingModal from '../components/ProcessingModal';
import CustomSlider from '../components/CustomSlider';
import './UMDFViewer.css';

const UMDFViewer = () => {
  const [modules, setModules] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [moduleGraph, setModuleGraph] = useState({});
  const [showSuccessBar, setShowSuccessBar] = useState(false);
  const [showErrorBar, setShowErrorBar] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [sliderValues, setSliderValues] = useState({}); // Track slider values for each module
  const [currentImageModuleId, setCurrentImageModuleId] = useState(null);
  const [fileInputRef] = useState(React.createRef()); // Track which image module is currently displayed
  const [isEditMode, setIsEditMode] = useState(false); // Track whether we're in edit mode
  const [encounterCollapsed, setEncounterCollapsed] = useState({}); // Track which encounters are collapsed

  // Set up global function for slider updates
  useEffect(() => {
    window.updateSliderValueGlobal = updateSliderValue;
    
    return () => {
      delete window.updateSliderValueGlobal;
    };
  }, []);
  
  // Load module data when encounters are available (but not in edit mode)
  useEffect(() => {
    if (encounters.length > 0 && !isEditMode) {
      console.log(`🔄 Loading data for ${encounters.length} encounters (not in edit mode)`);
      console.log('📋 Encounters:', encounters);
      
      encounters.forEach((encounter, encounterIndex) => {
        const { module_tree } = encounter;
        
        if (module_tree && module_tree.length > 0) {
          console.log(`📦 Loading data for ${module_tree.length} modules in encounter ${encounter.encounter_id}`);
          console.log('🔍 Module tree:', module_tree);
          
          // Load modules sequentially with a delay to avoid overwhelming the server
          module_tree.forEach((moduleNode, moduleIndex) => {
            const totalDelay = (encounterIndex * 1000) + (moduleIndex * 300); // 1s between encounters, 300ms between modules
            console.log(`⏰ Scheduling module ${moduleNode.id} to load in ${totalDelay}ms`);
            setTimeout(() => {
              loadModule(moduleNode.id);
            }, totalDelay);
          });
        }
      });
    } else if (encounters.length > 0 && isEditMode) {
      console.log(`🔄 Encounters changed but in edit mode - skipping module reload to avoid decryption errors`);
    }
  }, [encounters, isEditMode]);

  // Initialize current image module when modules are loaded
  useEffect(() => {
    if (modules.length > 0 && !currentImageModuleId) {
      // Find the first image module and set it as current
      const firstImageModule = modules.find(m => m.type === 'image');
      if (firstImageModule) {
        setCurrentImageModuleId(firstImageModule.id);
      }
    }
  }, [modules, currentImageModuleId]);
  
  // Extract file processing logic into a reusable function
  const processFileData = async (file, password = null) => {
    // Clear any old module metadata when processing a new file
    sessionStorage.removeItem('umdf_modules_metadata');
    
    setIsProcessing(true);
    setProcessingMessage('Processing UMDF file...');
    
    try {
      // Create FormData for upload
      const formData = new FormData();
      formData.append('file', file, file.name || 'uploaded_file');
      
      // Add password if provided
      if (password) {
        formData.append('password', password);
      }
      
      // Send to backend for C++ processing
      const response = await fetch('/api/upload/umdf', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Debug: Log what we received from the backend
      console.log('🔍 DEBUG: Backend response:', result);
      console.log('🔍 DEBUG: Modules received:', result.modules);
      if (result.modules && result.modules.length > 0) {
        console.log('🔍 DEBUG: First module schema_path:', result.modules[0].schema_path);
      }
      
      if (result.success) {
        // Update file information in sessionStorage for the new file
        sessionStorage.setItem('umdf_file_name', file.name);
        sessionStorage.setItem('umdf_file_size', file.size.toString());
        sessionStorage.setItem('umdf_file_last_modified', file.lastModified.toString());
        
        // Store file path if available (from File System Access API)
        const filePath = sessionStorage.getItem('umdf_file_path');
        if (filePath) {
          sessionStorage.setItem('umdf_file_path', filePath);
          console.log('📁 Stored file path for editing:', filePath);
        }
        
        // Store only essential module metadata in sessionStorage (not full image data)
        const modulesForStorage = result.modules.map(module => ({
          id: module.id,
          name: module.name,
          schema_id: module.schema_id,
          schema_path: module.schema_path,
          type: module.type,
          schema_url: module.schema_url,
          metadata: module.metadata,
          version: module.version,
          created: module.created,
          dimensions: module.dimensions,
          has_data: !!module.data,
          data_summary: module.data ? `Data with ${Object.keys(module.data).length} fields` : 'No data',
          has_pixel_data: !!module.pixel_data,
          pixel_data_summary: module.pixel_data ? `Pixel data available (${module.dimensions?.join('x') || 'unknown dimensions'})` : 'No pixel data'
        }));
        
        try {
          sessionStorage.setItem('umdf_modules_metadata', JSON.stringify(modulesForStorage));
          console.log('Stored module metadata in sessionStorage');
        } catch (storageError) {
          console.warn('Could not store module metadata in sessionStorage:', storageError);
        }
        
        // Debug: Log what modules we're setting in state
        console.log('🔍 DEBUG: Setting modules in state:', result.modules);
        result.modules.forEach((module, index) => {
          console.log(`  Module ${index}: id=${module.id}, name="${module.name}", type=${module.type}`);
        });
        
        // Set full modules, encounters, and module graph in component state
        setModules(result.modules);
        setEncounters(result.encounters || []);
        setModuleGraph(result.module_graph || {});
        setShowSuccessBar(true);
        
        // Clear processing state
        setIsProcessing(false);
        setProcessingMessage('');
        
        // Auto-hide success bar after 3 seconds
        setTimeout(() => setShowSuccessBar(false), 3000);
      } else {
        throw new Error(result.error || 'Failed to process file');
      }
    } catch (error) {
      console.error('Error processing file:', error);
      setProcessingMessage('Error processing file. Please try again.');
      setIsProcessing(false);
    }
  };
  
  // Check if File System Access API is available
  const isFileSystemAccessSupported = 'showOpenFilePicker' in window;

  // Get file path using File System Access API if available
  const getFileWithPath = async () => {
    if (!isFileSystemAccessSupported) {
      return null; // Fall back to regular file input
    }

    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'UMDF Files',
            accept: {
              'application/octet-stream': ['.umdf'],
              'application/x-umdf': ['.umdf']
            }
          }
        ],
        multiple: false
      });

      const file = await fileHandle.getFile();
      const filePath = fileHandle.name; // This gives us the actual file path
      
      console.log('📁 File selected with path:', filePath);
      
      return { file, filePath };
    } catch (error) {
      console.log('File System Access API not available or user cancelled:', error);
      return null;
    }
  };

  // Process file and load modules on component mount
  useEffect(() => {
    const processFile = async () => {
      const fileReady = sessionStorage.getItem('umdf_file_ready');
      const fileData = sessionStorage.getItem('umdf_file_data');
      
      if (fileReady === 'true' && fileData) {
        // Clear any old module metadata when processing a new file
        sessionStorage.removeItem('umdf_modules_metadata');
        
        setIsProcessing(true);
        setProcessingMessage('Processing UMDF file...');
        
        try {
          // Convert base64 data back to file object
          const base64Response = await fetch(fileData);
          const fileBlob = await base64Response.blob();
          
          // Create FormData for upload
          const formData = new FormData();
          formData.append('file', fileBlob, sessionStorage.getItem('umdf_file_name'));
          
          // Add password from session storage
          const storedPassword = sessionStorage.getItem('umdf_password');
          if (storedPassword) {
            formData.append('password', storedPassword);
          }
          
          // Send to backend for C++ processing
          const response = await fetch('/api/upload/umdf', {
            method: 'POST',
            body: formData
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const result = await response.json();
          
          // Debug: Log what we received from the backend
          console.log('🔍 DEBUG: Backend response:', result);
          console.log('🔍 DEBUG: Modules received:', result.modules);
          if (result.modules && result.modules.length > 0) {
            console.log('🔍 DEBUG: First module schema_path:', result.modules[0].schema_path);
          }
          
          if (result.success) {
            // Store only essential module metadata in sessionStorage (not full image data)
            const modulesForStorage = result.modules.map(module => ({
              id: module.id,
              name: module.name,
              schema_id: module.schema_id,
              schema_path: module.schema_path,  // Add schema_path to stored metadata
              type: module.type,
              schema_url: module.schema_url,
              metadata: module.metadata,
              version: module.version,
              created: module.created,
              dimensions: module.dimensions,
              // Don't store pixel_data or large data arrays in sessionStorage
              has_data: !!module.data,
              data_summary: module.data ? `Data with ${Object.keys(module.data).length} fields` : 'No data',
              has_pixel_data: !!module.pixel_data,
              pixel_data_summary: module.pixel_data ? `Pixel data available (${module.dimensions?.join('x') || 'unknown dimensions'})` : 'No pixel data'
            }));
            
            try {
              sessionStorage.setItem('umdf_modules_metadata', JSON.stringify(modulesForStorage));
              console.log('Stored module metadata in sessionStorage');
            } catch (storageError) {
              console.warn('Could not store module metadata in sessionStorage:', storageError);
              // Continue without storing in sessionStorage
            }
            
            // Debug: Log what modules we're setting in state
            console.log('🔍 DEBUG: Setting modules in state:', result.modules);
            result.modules.forEach((module, index) => {
              console.log(`  Module ${index}: id=${module.id}, name="${module.name}", type=${module.type}`);
            });
            
            // Set full modules, encounters, and module graph in component state
            setModules(result.modules);
            setEncounters(result.encounters || []);
            setModuleGraph(result.module_graph || {});
            setShowSuccessBar(true);
            
            // Clear processing state
            setIsProcessing(false);
            setProcessingMessage('');
            
            // Clear file data from sessionStorage (keep module metadata)
            sessionStorage.removeItem('umdf_file_ready');
            sessionStorage.removeItem('umdf_file_data');
            
            // Auto-hide success bar after 3 seconds
            setTimeout(() => setShowSuccessBar(false), 3000);
          } else {
            throw new Error(result.error || 'Failed to process file');
          }
        } catch (error) {
          console.error('Error processing file:', error);
          setErrorMessage(`Error processing file: ${error.message}`);
          setShowErrorBar(true);
          setIsProcessing(false);
          setProcessingMessage('');
        }
      } else {
        // Check if we have existing module metadata from previous session
        const storedModulesMetadata = sessionStorage.getItem('umdf_modules_metadata');
        if (storedModulesMetadata) {
          try {
            const parsedMetadata = JSON.parse(storedModulesMetadata);
            console.log('Loaded module metadata from sessionStorage:', parsedMetadata);
            
            // Show a message that this is metadata only (no full data)
            setShowErrorBar(true);
            setErrorMessage('Module metadata loaded from previous session. Full data not available - please re-upload the file to view complete information.');
            
            // Set empty modules since we only have metadata
            setModules([]);
          } catch (error) {
            console.error('Error parsing stored module metadata:', error);
            setErrorMessage('Error loading stored file metadata');
            setShowErrorBar(true);
          }
        } else {
          setErrorMessage('No file to process');
          setShowErrorBar(true);
        }
      }
    };

    processFile();
  }, []);

  // Clear cache function
  const clearCache = () => {
    sessionStorage.removeItem('umdf_modules_metadata');
    sessionStorage.removeItem('umdf_file_name');
    sessionStorage.removeItem('umdf_file_size');
    sessionStorage.removeItem('umdf_file_last_modified');
    sessionStorage.removeItem('umdf_file_data');
    sessionStorage.removeItem('umdf_file_ready');
    setModules([]);
    setEncounters([]);
    setModuleGraph({});
    setShowErrorBar(true);
    setErrorMessage('Cache cleared - ready for new file');
    setShowSuccessBar(false);
    
    // Auto-hide the clear message after 2 seconds
    setTimeout(() => setShowErrorBar(false), 2000);
  };

  // Format file size to human-readable format
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === '0') return '0 Bytes';
    const size = parseInt(bytes);
    if (size === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get file info from sessionStorage
  const getFileInfo = () => {
    const fileName = sessionStorage.getItem('umdf_file_name') || 'Unknown file';
    const fileSize = sessionStorage.getItem('umdf_file_size') || '0';
    return { fileName, fileSize: formatFileSize(fileSize) };
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  };

  // Function to update slider values and trigger re-render
  const updateSliderValue = (moduleId, dimension, value) => {
    setSliderValues(prev => ({
      ...prev,
      [`${moduleId}_${dimension}`]: value
    }));
  };

  // Capitalize first letter
  const capitalizeFirst = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Render module data based on type
  const renderModuleData = (module) => {
    // Check for both 'image' and 'imaging' types for compatibility
    if (module.type === 'image' || module.type === 'imaging') {
      // Only render imaging module if we have metadata loaded
      if (module.metadata && Object.keys(module.metadata).length > 0) {
        return renderImagingModule(module);
      } else {
        // Show loading state for image modules
        return (
          <div className="text-center p-4">
            <i className="fas fa-spinner fa-spin fa-2x text-primary mb-3"></i>
            <p className="text-muted">Loading image module data...</p>
          </div>
        );
      }
    }
    
    return (
      <div className="module-data">
        <h6 className="text-muted mb-2">Module Data:</h6>
        <pre className="bg-light p-3 rounded" style={{fontSize: '0.875rem', maxHeight: '300px', overflow: 'auto'}}>
          {JSON.stringify(module.data || {}, null, 2)}
        </pre>
      </div>
    );
  };

  // Render imaging module with image viewer and sliders
  const renderImagingModule = (module, moduleNode = null) => {
    // Use the current image module if set, otherwise use the passed module
    const currentModule = currentImageModuleId ? modules.find(m => m.id === currentImageModuleId) : module;
    if (!currentModule) {
      console.log('No current module found, currentImageModuleId:', currentImageModuleId);
      return null;
    }
    
    console.log('Rendering image module:', currentModule.id, 'Type:', currentModule.type, 'Has data:', !!currentModule.data);
    
    // Access dimensions from the new metadata structure
    let dimensions = [];
    let dimensionNames = [];
    
    // Check if metadata is a single object with image_structure (new format)
    if (currentModule.metadata && typeof currentModule.metadata === 'object' && !Array.isArray(currentModule.metadata)) {
      // Check if metadata has a content array (wrapped format from backend)
              if (currentModule.metadata.content && Array.isArray(currentModule.metadata.content) && currentModule.metadata.content.length > 0) {
          const contentItem = currentModule.metadata.content[0];
          if (contentItem.image_structure && contentItem.image_structure.dimensions) {
            dimensions = contentItem.image_structure.dimensions;
            dimensionNames = contentItem.image_structure.dimension_names || [];
            console.log('Found dimensions in metadata.content[0].image_structure:', dimensions);
            console.log('Found dimension names in metadata.content[0].image_structure:', dimensionNames);
          } else if (contentItem.dimensions) {
            // Fallback: check if dimensions are directly in content item
            dimensions = contentItem.dimensions;
            dimensionNames = contentItem.dimension_names || [];
            console.log('Found dimensions directly in metadata.content[0]:', dimensions);
            console.log('Found dimension names directly in metadata.content[0]:', dimensionNames);
          }
        } else if (currentModule.metadata.image_structure && currentModule.metadata.image_structure.dimensions) {
          // Direct image_structure in metadata
          dimensions = currentModule.metadata.image_structure.dimensions;
          dimensionNames = currentModule.metadata.image_structure.dimension_names || [];
          console.log('Found dimensions in metadata.image_structure:', dimensions);
          console.log('Found dimension names in metadata.image_structure:', dimensions);
        } else if (currentModule.metadata.dimensions) {
          // Fallback: check if dimensions are directly in metadata
          dimensions = currentModule.metadata.dimensions;
          dimensionNames = currentModule.metadata.dimension_names || [];
          console.log('Found dimensions directly in metadata:', dimensions);
          console.log('Found dimension names directly in metadata:', dimensionNames);
        }
    }
    // Legacy: check if metadata is an array (old format)
    else if (Array.isArray(currentModule.metadata) && currentModule.metadata.length > 0) {
      const metadataObj = currentModule.metadata[0];
      dimensions = metadataObj.dimensions || [];
      dimensionNames = metadataObj.dimension_names || [];
      console.log('Found dimensions in metadata[0] (legacy):', dimensions);
      console.log('Found dimension names in metadata[0] (legacy):', dimensions);
    }
    // Fallback: check if dimensions are directly in module
    else if (currentModule.dimensions && Array.isArray(currentModule.dimensions)) {
      dimensions = currentModule.dimensions;
      dimensionNames = currentModule.dimension_names || [];
      console.log('Found dimensions directly in module:', dimensions);
    }
    
    // Extract width and height from first two dimension values
    const width = dimensions[0] || 0;
    const height = dimensions[1] || 0;
    
    // Calculate total pixels for this image
    const totalPixels = width * height;
    
    const numDimensions = dimensions.length;
    // Calculate number of frames: if only 2 dimensions (width, height), then 1 frame
    // Otherwise, multiply all dimensions after the first 2 (width, height)
    const numFrames = numDimensions > 2 ? dimensions.slice(2).reduce((acc, dim) => acc * dim, 1) : 1;
    
    console.log('=== IMAGE MODULE DEBUG ===');
    console.log('Metadata structure:', currentModule.metadata);
    console.log('Metadata type:', typeof currentModule.metadata);
    console.log('Metadata keys:', Object.keys(currentModule.metadata || {}));
    console.log('Has image_structure:', currentModule.metadata?.image_structure ? 'Yes' : 'No');
    if (currentModule.metadata?.image_structure) {
      console.log('Image structure keys:', Object.keys(currentModule.metadata.image_structure));
      console.log('Image structure dimensions:', currentModule.metadata.image_structure.dimensions);
      console.log('Image structure dimension_names:', currentModule.metadata.image_structure.dimension_names);
    }
    console.log('Has direct dimensions:', currentModule.metadata?.dimensions ? 'Yes' : 'No');
    if (currentModule.metadata?.dimensions) {
      console.log('Direct dimensions:', currentModule.metadata.dimensions);
      console.log('Direct dimension_names:', currentModule.metadata.dimension_names);
    }
    console.log('Extracted dimensions array:', dimensions);
    console.log('Extracted dimension names:', dimensionNames);
    console.log('Number of dimensions:', numDimensions);
    console.log('Width:', width, 'Height:', height);
    console.log('Calculated frames:', numFrames);
    console.log('Expected total pixels per frame:', totalPixels);
    console.log('Final dimensions array:', dimensions);
    console.log('Width:', width, 'Height:', height, 'Total pixels:', totalPixels);
    console.log('==========================');
    
    // Debug: Check for image data in various possible locations
    console.log('currentModule.imageData:', currentModule.imageData);
    console.log('currentModule.data:', currentModule.data);
    console.log('currentModule.pixelData:', currentModule.pixelData);
    if (currentModule.data) {
      console.log('currentModule.data keys:', Object.keys(currentModule.data));
      if (currentModule.data.imageData) {
        console.log('currentModule.data.imageData:', currentModule.data.imageData);
      }
      if (currentModule.data.pixelData) {
        console.log('currentModule.data.pixelData:', currentModule.data.pixelData);
      }
    }
    
    return (
      <div className="imaging-module">
        <div className="bg-white p-3 rounded mt-3">
        <div className="row">
          {/* Derived Image Module Buttons */}
          {moduleNode && moduleNode.derives && moduleNode.derives.length > 0 && (() => {
            const derivedImageModules = moduleNode.derives
              .map(derived => modules.find(m => m.id === derived.id))
              .filter(derivedModule => derivedModule && derivedModule.type === 'image');
            
            if (derivedImageModules.length === 0) return null;
            
            return (
              <div className="col-md-3">
                <div className="derived-modules-sidebar" style={{
                  backgroundColor: 'white',
                  padding: '15px',
                  paddingBottom: '25px',
                  borderRadius: '8px',
                  height: '100%',
                  minHeight: '400px',
                  width: '100%'
                }}>
                  <h6 className="mb-3" style={{color: '#667eea'}}>
                    <i className="fas fa-images me-2"></i>
                    Image Series
                  </h6>
                  <div className="d-grid gap-2">
                    {/* Original/First Image Module Button */}
                    <button
                      className="btn btn-sm w-100"
                      onClick={async () => {
                        try {
                          // Switch back to the original image module
                          setCurrentImageModuleId(module.id);
                          console.log('Switched to original image module:', module.id);
                        } catch (error) {
                          console.error('Error switching to original module:', error);
                        }
                      }}
                      title={`Switch to ${module.name || module.type} Module`}
                      style={{
                        fontSize: '0.8rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        width: '100%',
                        height: '38px',
                        backgroundColor: module.id === (currentImageModuleId || module.id) ? '#667eea' : 'transparent',
                        color: module.id === (currentImageModuleId || module.id) ? 'white' : '#667eea',
                        border: '1px solid #667eea'
                      }}
                    >
                      <i className="fas fa-image me-1"></i>
                      {module.name || module.type} (Original)
                    </button>
                    
                    {/* Derived Image Module Buttons */}
                    {derivedImageModules.map((derivedModule, idx) => (
                      <button
                        key={idx}
                        className="btn btn-sm w-100"
                        onClick={async () => {
                          try {
                            // Load the derived module's data first if it hasn't been loaded
                            if (!derivedModule.data || Object.keys(derivedModule.data).length === 0) {
                              console.log('Loading data for derived module:', derivedModule.id);
                              await loadModule(derivedModule.id);
                            }
                            
                            // Switch to the derived image module
                            setCurrentImageModuleId(derivedModule.id);
                            console.log('Switched to derived image module:', derivedModule.id);
                          } catch (error) {
                            console.error('Error switching to derived module:', error);
                          }
                        }}
                        title={`Switch to ${derivedModule.name || derivedModule.type} Module`}
                        style={{
                          fontSize: '0.8rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          height: '38px',
                          backgroundColor: derivedModule.id === (currentImageModuleId || module.id) ? '#667eea' : 'transparent',
                          color: derivedModule.id === (currentImageModuleId || module.id) ? 'white' : '#667eea',
                          border: '1px solid #667eea'
                        }}
                      >
                        <i className="fas fa-image me-1"></i>
                        {derivedModule.name || derivedModule.type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
          
          <div className="col-md-6">
            <div className="image-viewer-container" style={{width: '100%'}}>
              {(() => {
                // Function to render the first frame
                // Check multiple possible locations for image data
                let imageData = currentModule.imageData;
                let pixelData = null;
                
                if (!imageData && currentModule.data) {
                  // Check if currentModule.data has frame_data (new backend structure)
                  if (currentModule.data.frame_data && Array.isArray(currentModule.data.frame_data) && currentModule.data.frame_data.length > 0) {
                    // New structure: currentModule.data.frame_data contains array of frames
                    imageData = currentModule.data.frame_data;
                    console.log('Found frame_data in currentModule.data, length:', imageData.length);
                  } else if (Array.isArray(currentModule.data) && currentModule.data.length > 0) {
                    // Legacy structure: currentModule.data is directly an array of frames
                    imageData = currentModule.data;
                    console.log('Found frame array in currentModule.data, length:', imageData.length);
                  } else if (currentModule.data.imageData) {
                    imageData = currentModule.data.imageData;
                  } else if (currentModule.data.pixelData) {
                    // If pixelData is directly in data, create a single frame structure
                    imageData = [{ pixelData: currentModule.data.pixelData }];
                  }
                }
                
                // Error handling is now done at the module level, so we can proceed with normal image rendering
                
                if (!imageData || !Array.isArray(imageData) || imageData.length === 0) {
                  console.log('No image data available for module:', currentModule.id);
                  console.log('imageData:', imageData);
                  console.log('currentModule.data:', currentModule.data);
                  console.log('currentModule.data.frame_data:', currentModule.data?.frame_data);
                  return (
                    <div className="text-center p-4">
                      <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                      <p className="text-muted">No image data available</p>
                      <small className="text-muted">
                        Checked: currentModule.imageData, currentModule.data (array of {currentModule.data?.length || 0} frames)
                      </small>
                    </div>
                  );
                }
                
                // Calculate which frame to display based on current slider values
                let currentFrameIndex = 0;
                
                if (numDimensions > 2) {
                  // Get current slider values for dimensions beyond width/height from state
                  const currentSliderValues = [];
                  for (let i = 2; i < numDimensions; i++) {
                    const key = `${currentModule.id || 'unknown'}_${i}`;
                    const value = sliderValues[key] || 1; // Default to 1 for 1-indexed
                    currentSliderValues.push(value);
                  }
                  
                  // Calculate frame index using the slider values
                  // Dynamic calculation: first slider increases by 1, others by their multipliers
                  let frameIndex = 0;
                  
                  if (currentSliderValues.length === 1) {
                    // Single slider - just subtract 1 for 0-indexed
                    frameIndex = currentSliderValues[0] - 1;
                  } else {
                    // Multiple sliders - use dynamic calculation
                    // First slider (index 0) increases by 1
                    // Other sliders increase by the product of all previous dimensions
                    frameIndex = currentSliderValues[0] - 1; // First slider contribution
                    
                    for (let i = 1; i < currentSliderValues.length; i++) {
                      // Calculate multiplier for this dimension
                      // Multiplier = product of all previous extra dimensions
                      let multiplier = 1;
                      for (let j = 0; j < i; j++) {
                        multiplier *= dimensions[j + 2]; // +2 because we skip width and height
                      }
                      
                      const contribution = (currentSliderValues[i] - 1) * multiplier;
                      frameIndex += contribution;
                    }
                  }
                  
                  currentFrameIndex = Math.min(frameIndex, imageData.length - 1);
                  
                  // Get dimension names for logging
                  const dimNames = [];
                  for (let i = 2; i < numDimensions; i++) {
                    let dimName = `Dimension ${i}`;
                    if (currentModule.metadata && typeof currentModule.metadata === 'object' && !Array.isArray(currentModule.metadata)) {
                      // Check if metadata has a content array (wrapped format from backend)
                      if (currentModule.metadata.content && Array.isArray(currentModule.metadata.content) && currentModule.metadata.content.length > 0) {
                        const contentItem = currentModule.metadata.content[0];
                        if (contentItem.image_structure && contentItem.image_structure.dimension_names && 
                            Array.isArray(contentItem.image_structure.dimension_names) && 
                            contentItem.image_structure.dimension_names[i]) {
                          dimName = contentItem.image_structure.dimension_names[i];
                        } else if (contentItem.dimension_names && Array.isArray(contentItem.dimension_names) && 
                                  contentItem.dimension_names[i]) {
                          dimName = contentItem.dimension_names[i];
                        }
                      } else if (currentModule.metadata.image_structure && currentModule.metadata.image_structure.dimension_names && 
                                Array.isArray(currentModule.metadata.image_structure.dimension_names) && 
                                currentModule.metadata.image_structure.dimension_names[i]) {
                        // Direct image_structure in metadata
                        dimName = currentModule.metadata.image_structure.dimension_names[i];
                      } else if (currentModule.metadata.dimension_names && Array.isArray(currentModule.metadata.dimension_names) && 
                                currentModule.metadata.dimension_names[i]) {
                        // Fallback: check if dimension_names are directly in metadata
                        dimName = currentModule.metadata.dimension_names[i];
                      }
                    } else if (currentModule.metadata && Array.isArray(currentModule.metadata) && currentModule.metadata.length > 0) {
                      // Legacy format: check metadata array
                      const metadata = currentModule.metadata[0];
                      if (metadata.dimension_names && metadata.dimension_names[i]) {
                        dimName = metadata.dimension_names[i];
                      }
                    }
                    dimNames.push(dimName);
                  }
                  
                  console.log('Current slider values (1-indexed):', currentSliderValues);
                  console.log('Dimension names:', dimNames);
                  console.log('Dimensions beyond 2D:', dimensions.slice(2));
                  console.log('Calculated frame number (1-indexed):', frameIndex);
                  console.log('Converted to 0-indexed array index:', currentFrameIndex);
                }
                
                const currentFrame = imageData[currentFrameIndex];
                console.log('Current frame data:', currentFrame);
                
                // Check for pixel data in the current frame
                if (currentFrame.pixelData && Array.isArray(currentFrame.pixelData)) {
                  pixelData = currentFrame.pixelData;
                } else if (currentFrame.data) {
                  // Handle different data types from backend
                  if (Array.isArray(currentFrame.data)) {
                    // If data is already an array, use it directly
                    pixelData = currentFrame.data;
                    console.log('Found pixel data in currentFrame.data (array), length:', pixelData.length);
                  } else if (currentFrame.data instanceof Uint8Array) {
                    // If data is already a Uint8Array, use it directly
                    pixelData = currentFrame.data;
                    console.log('Found pixel data as Uint8Array, length:', pixelData.length);
                  } else if (typeof currentFrame.data === 'string' && currentFrame.data.length > 0) {
                    // If data is a hex string from backend, convert it to Uint8Array
                    try {
                      // Convert hex string to Uint8Array
                      const hexString = currentFrame.data;
                      const bytes = new Uint8Array(hexString.length / 2);
                      for (let i = 0; i < hexString.length; i += 2) {
                        bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
                      }
                      pixelData = bytes;
                      console.log('Converted hex string to pixel data, length:', pixelData.length);
                    } catch (error) {
                      console.error('Error converting hex string to pixel data:', error);
                      pixelData = null;
                    }
                  } else {
                    console.log('Unknown data type:', typeof currentFrame.data, currentFrame.data);
                    pixelData = null;
                  }
                } else if (Array.isArray(currentFrame)) {
                  // If currentFrame is directly an array, treat it as pixel data
                  pixelData = currentFrame;
                }
                
                // Get channel information from metadata
                let numChannels = 1; // Default to grayscale
                let channelNames = [];
                
                // Check module-level metadata for channel info (this has the image_structure)
                if (currentModule.metadata && typeof currentModule.metadata === 'object' && !Array.isArray(currentModule.metadata)) {
                  console.log('🔍 Channel detection - currentModule.metadata:', currentModule.metadata);
                  console.log('🔍 Channel detection - currentModule.metadata.content:', currentModule.metadata.content);
                  
                  if (currentModule.metadata.content && Array.isArray(currentModule.metadata.content) && currentModule.metadata.content.length > 0) {
                    const moduleMetadata = currentModule.metadata.content[0];
                    console.log('🔍 Channel detection - moduleMetadata:', moduleMetadata);
                    console.log('🔍 Channel detection - moduleMetadata.image_structure:', moduleMetadata.image_structure);
                    
                    if (moduleMetadata.image_structure && moduleMetadata.image_structure.channels) {
                      console.log('🔍 Channel detection - BEFORE update, numChannels:', numChannels);
                      numChannels = moduleMetadata.image_structure.channels;
                      console.log('🔍 Channel detection - AFTER update, numChannels:', numChannels);
                      console.log('Found channels in module metadata (from content):', numChannels);
                    } else {
                      console.log('🔍 Channel detection - No image_structure.channels found in moduleMetadata');
                    }
                    
                    if (moduleMetadata.image_structure && moduleMetadata.image_structure.channel_names) {
                      channelNames = moduleMetadata.image_structure.channel_names;
                      console.log('🔍 Channel detection - channelNames updated:', channelNames);
                    }
                  } else {
                    console.log('🔍 Channel detection - No content array or empty content in currentModule.metadata');
                  }
                  
                  if (currentModule.metadata.image_structure && currentModule.metadata.image_structure.channels) {
                    console.log('🔍 Channel detection - Found direct image_structure.channels:', currentModule.metadata.image_structure.channels);
                    numChannels = currentModule.metadata.image_structure.channels;
                    console.log('Found channels in module metadata (direct):', numChannels);
                  }
                } else {
                  console.log('🔍 Channel detection - currentModule.metadata is not an object or is an array:', currentModule.metadata);
                }
                
                // Also check frame metadata as fallback
                if (numChannels === 1 && currentFrame.metadata && Array.isArray(currentFrame.metadata) && currentFrame.metadata.length > 0) {
                  const frameMetadata = currentFrame.metadata[0];
                  if (frameMetadata.channels) {
                    numChannels = frameMetadata.channels;
                    console.log('Found channels in frame metadata:', numChannels);
                  } else if (frameMetadata.channel_count) {
                    numChannels = frameMetadata.channel_count;
                  }
                  if (frameMetadata.channel_names) {
                    channelNames = frameMetadata.channel_names;
                  }
                }
                
                console.log('Channel information:', { numChannels, channelNames });
                console.log('Final numChannels value:', numChannels);
                console.log('Final channelNames value:', channelNames);
                console.log('=== PIXEL DATA DEBUG ===');
                console.log('pixelData:', pixelData);
                console.log('pixelData type:', typeof pixelData);
                console.log('pixelData isArray:', Array.isArray(pixelData));
                console.log('pixelData length:', pixelData ? pixelData.length : 'null');
                console.log('pixelData first 10 values:', pixelData ? Array.from(pixelData.slice(0, 10)) : 'null');
                console.log('Expected pixels per frame:', totalPixels);
                console.log('Expected total values per frame:', totalPixels * numChannels);
                console.log('Width:', width, 'Height:', height);
                console.log('Canvas data length needed:', width * height * 4);
                console.log('========================');
                
                if (!pixelData || (!Array.isArray(pixelData) && !(pixelData instanceof Uint8Array))) {
                  return (
                    <div className="text-center p-4">
                      <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                      <p className="text-muted">No pixel data in current frame</p>
                      <small className="text-muted">
                        Current frame keys: {currentFrame ? Object.keys(currentFrame).join(', ') : 'null'}
                      </small>
                    </div>
                  );
                }
                
                try {
                  console.log('=== CANVAS CREATION DEBUG ===');
                  console.log('About to create canvas with dimensions:', width, 'x', height);
                  console.log('pixelData at canvas creation:', pixelData);
                  console.log('pixelData length at canvas creation:', pixelData ? pixelData.length : 'null');
                  
                  // Create a canvas to display the image
                  const canvas = document.createElement('canvas');
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  
                  // Get the image data
                  const imageData = ctx.createImageData(width, height);
                  const data = imageData.data;
                  
                  // Convert pixel data to RGBA values based on channel count
                  console.log('=== PIXEL CONVERSION DEBUG ===');
                  console.log('Converting pixel data with numChannels:', numChannels);
                  console.log('Canvas data length:', data.length);
                  console.log('Expected pixels to process:', Math.min(pixelData.length / numChannels, data.length / 4));
                  
                  if (numChannels === 1) {
                    // Grayscale: single value per pixel
                    console.log('Processing as grayscale (1 channel)');
                    for (let i = 0; i < pixelData.length && i < data.length / 4; i++) {
                      const pixelValue = pixelData[i];
                      const dataIndex = i * 4;
                      
                      // Convert to grayscale (same value for R, G, B)
                      data[dataIndex] = pixelValue;     // Red
                      data[dataIndex + 1] = pixelValue; // Green
                      data[dataIndex + 2] = pixelValue; // Blue
                      data[dataIndex + 3] = 255;        // Alpha (fully opaque)
                    }
                    console.log('Processed grayscale pixels:', Math.min(pixelData.length, data.length / 4));
                  } else if (numChannels === 3) {
                    // RGB: three values per pixel
                    console.log('Processing as RGB (3 channels)');
                    for (let i = 0; i < pixelData.length / 3 && i < data.length / 4; i++) {
                      const dataIndex = i * 4;
                      const pixelIndex = i * 3;
                      
                      data[dataIndex] = pixelData[pixelIndex];     // Red
                      data[dataIndex + 1] = pixelData[pixelIndex + 1]; // Green
                      data[dataIndex + 2] = pixelData[pixelIndex + 2]; // Blue
                      data[dataIndex + 3] = 255;                    // Alpha (fully opaque)
                    }
                    console.log('Processed RGB pixels:', Math.min(pixelData.length / 3, data.length / 4));
                  } else if (numChannels === 4) {
                    // RGBA: four values per pixel
                    console.log('Processing as RGBA (4 channels)');
                    for (let i = 0; i < pixelData.length / 4 && i < data.length / 4; i++) {
                      const dataIndex = i * 4;
                      const pixelIndex = i * 4;
                      
                      data[dataIndex] = pixelData[pixelIndex];     // Red
                      data[dataIndex + 1] = pixelData[pixelIndex + 1]; // Green
                      data[dataIndex + 2] = pixelData[pixelIndex + 2]; // Blue
                      data[dataIndex + 3] = pixelData[pixelIndex + 3]; // Alpha
                    }
                    console.log('Processed RGBA pixels:', Math.min(pixelData.length / 4, data.length / 4));
                  } else {
                    // Other channel counts: treat as grayscale for now
                    console.warn(`Unsupported channel count: ${numChannels}, treating as grayscale`);
                    console.log('Processing as fallback grayscale');
                    for (let i = 0; i < pixelData.length && i < data.length / 4; i++) {
                      const pixelValue = pixelData[i];
                      const dataIndex = i * 4;
                      
                      data[dataIndex] = pixelValue;     // Red
                      data[dataIndex + 1] = pixelValue; // Green
                      data[dataIndex + 2] = pixelValue; // Blue
                      data[dataIndex + 3] = 255;        // Alpha (fully opaque)
                    }
                    console.log('Processed fallback pixels:', Math.min(pixelData.length, data.length / 4));
                  }
                  
                  // Put the image data on the canvas
                  ctx.putImageData(imageData, 0, 0);
                  
                  // Convert canvas to data URL for display
                  const imageUrl = canvas.toDataURL();
                  
                  return (
                    <div className="text-center">
                      <img 
                        src={imageUrl} 
                        alt={`Frame 0 (${width}×${height})`}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '400px',
                          border: '1px solid #dee2e6',
                          borderRadius: '8px'
                        }}
                      />
                      <div className="mt-2">
                        <small className="text-muted">
                          Frame {currentFrameIndex + 1} • {width} × {height} pixels
                          {numFrames > 1 && ` • ${numFrames} total frames`}
                        </small>
                      </div>
                      <div className="mt-1">
                        <small className="text-muted">
                          Channels: {numChannels} {channelNames.length > 0 && `(${channelNames.join(', ')})`} • 
                          Pixels per frame: {Math.floor(pixelData.length / numChannels)} • 
                          Expected: {totalPixels}
                        </small>
                      </div>
                      {numDimensions > 2 && (
                        <div className="mt-1 mb-3">
                          <small className="text-muted">
                                                    Current slider positions: {(() => {
                          const positions = [];
                          for (let i = 2; i < numDimensions; i++) {
                            const key = `${currentModule.id || 'unknown'}_${i}`;
                            const value = sliderValues[key] || 1; // Default to 1 for 1-indexed
                            positions.push(`${dimensionNames[i] || `Dim ${i}`}: ${value}`);
                          }
                          return positions.join(', ');
                        })()}
                          </small>
                        </div>
                      )}
                    </div>
                  );
                } catch (error) {
                  console.error('Error rendering image:', error);
                  return (
                    <div className="text-center p-4">
                      <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                      <p className="text-muted">Error rendering image</p>
                      <small className="text-danger">{error.message}</small>
                    </div>
                  );
                }
              })()}
            </div>
          </div>
          
          {numDimensions > 2 && (
            <div className="col-md-3">
              <div className="dimension-controls" style={{width: '100%'}}>
                {dimensions.slice(2).map((dim, index) => {
                  const dimIndex = index + 2;
                  // Get dimension name from metadata if available
                  let dimName = `Dimension ${dimIndex}`;
                  if (currentModule.metadata && Array.isArray(currentModule.metadata) && currentModule.metadata.length > 0) {
                    const metadata = currentModule.metadata[0];
                    if (metadata.dimension_names && Array.isArray(metadata.dimension_names) && metadata.dimension_names[dimIndex]) {
                      dimName = metadata.dimension_names[dimIndex];
                    }
                  }
                  return (
                    <div key={dimIndex} className="dimension-control mb-3" style={{width: '100%'}}>
                      <label className="form-label text-muted mb-2">
                        {dimName}: <span className="text-primary">1-{dim}</span>
                      </label>
                      <CustomSlider
                        value={sliderValues[`${currentModule.id || 'unknown'}_${index + 2}`] || 1}
                        min={1}
                        max={dim}
                        onChange={(newValue) => updateSliderValue(currentModule.id || 'unknown', index + 2, newValue)}
                        moduleId={currentModule.id || 'unknown'}
                        dimension={index + 2}
                        className="w-100"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        
        {/* Frame Metadata Display */}
        {(() => {
          console.log('🔍 DEBUG: Checking frame metadata display for module:', currentModule.id);
          console.log('🔍 DEBUG: currentModule.data:', currentModule.data);
          console.log('🔍 DEBUG: currentModule.data.frame_data:', currentModule.data?.frame_data);
          console.log('🔍 DEBUG: Should show frame metadata:', !!(currentModule.data && currentModule.data.frame_data));
          
          // Check for error states first
          if (currentModule.data && currentModule.data.error) {
            return true; // Show error display
          }
          
          return currentModule.data && currentModule.data.frame_data;
        })() && (
          // Check if we should show error or actual frame metadata
          currentModule.data && currentModule.data.error ? (
            <div className="mt-3">
              <h6 className="text-danger">
                <i className="fas fa-exclamation-triangle me-2"></i>
                Frame Metadata Error
              </h6>
              <div className="bg-danger bg-opacity-10 border border-danger p-3 rounded">
                <div className="text-danger">
                  <strong>Error Type:</strong> {currentModule.data.error}
                </div>
                <div className="text-danger mt-1">
                  <strong>Message:</strong> {currentModule.data.message}
                </div>
                {currentModule.data.error === 'decryption_failed' && (
                  <div className="mt-2">
                    <i className="fas fa-lock me-1"></i>
                    <small>This usually means the password is incorrect. Please check your login credentials.</small>
                  </div>
                )}
              </div>
            </div>
          ) : (
          <div className="mt-3">
            <h6 className="text-purple-600">
              <i className="fas fa-layer-group me-2"></i>
              Frame Metadata
            </h6>
            <div className="bg-light p-3 rounded">
              {(() => {
                // Get current frame index based on slider values
                let currentFrameIndex = 0;
                
                if (currentModule.metadata && typeof currentModule.metadata === 'object' && !Array.isArray(currentModule.metadata)) {
                  if (currentModule.metadata.content && Array.isArray(currentModule.metadata.content) && currentModule.metadata.content.length > 0) {
                    const contentItem = currentModule.metadata.content[0];
                    if (contentItem.image_structure && contentItem.image_structure.dimensions) {
                      const dimensions = contentItem.image_structure.dimensions;
                      const numDimensions = dimensions.length;
                      
                      if (numDimensions > 2) {
                        // Get current slider values for dimensions beyond width/height
                        const currentSliderValues = [];
                        for (let i = 2; i < numDimensions; i++) {
                          const key = `${currentModule.id || 'unknown'}_${i}`;
                          const value = sliderValues[key] || 1; // Default to 1 for 1-indexed
                          currentSliderValues.push(value);
                        }
                        
                        // Calculate frame index using the same logic as the image viewer
                        let frameIndex = 0;
                        
                        if (currentSliderValues.length === 1) {
                          // Single slider - just subtract 1 for 0-indexed
                          frameIndex = currentSliderValues[0] - 1;
                        } else {
                          // Multiple sliders - use dynamic calculation
                          frameIndex = currentSliderValues[0] - 1; // First slider contribution
                          
                          for (let i = 1; i < currentSliderValues.length; i++) {
                            // Calculate multiplier for this dimension
                            let multiplier = 1;
                            for (let j = 0; j < i; j++) {
                              multiplier *= dimensions[j + 2]; // +2 because we skip width and height
                            }
                            
                            const contribution = (currentSliderValues[i] - 1) * multiplier;
                            frameIndex += contribution;
                          }
                        }
                        
                        currentFrameIndex = Math.min(frameIndex, currentModule.data.frame_data.length - 1);
                      }
                    }
                  }
                }
                
                const currentFrame = currentModule.data.frame_data[currentFrameIndex];
                return currentFrame && currentFrame.metadata ? (
                  <div>
                    <div className="mb-2">
                      <strong>Frame {currentFrameIndex + 1}:</strong>
                      <span className="text-muted ml-2">
                        (Slider position: {(() => {
                          if (currentModule.metadata && typeof currentModule.metadata === 'object' && !Array.isArray(currentModule.metadata)) {
                            if (currentModule.metadata.content && Array.isArray(currentModule.metadata.content) && currentModule.metadata.content.length > 0) {
                              const contentItem = currentModule.metadata.content[0];
                              if (contentItem.image_structure && contentItem.image_structure.dimensions) {
                                const dimensions = contentItem.image_structure.dimensions;
                                const numDimensions = dimensions.length;
                                if (numDimensions > 2) {
                                  const sliderInfo = [];
                                  for (let i = 2; i < numDimensions; i++) {
                                    const key = `${currentModule.id || 'unknown'}_${i}`;
                                    const value = sliderValues[key] || 1;
                                    const dimName = contentItem.image_structure.dimension_names && 
                                                 contentItem.image_structure.dimension_names[i] ? 
                                                 contentItem.image_structure.dimension_names[i] : 
                                                 `Dim ${i}`;
                                    sliderInfo.push(`${dimName}: ${value}`);
                                  }
                                  return sliderInfo.join(', ');
                                }
                              }
                            }
                          }
                          return 'N/A';
                        })()})
                      </span>
                    </div>
                    <pre className="mt-1 mb-0" style={{fontSize: '0.875rem', maxHeight: '150px', overflow: 'auto'}}>
                      {JSON.stringify(currentFrame.metadata, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <span className="text-muted">No frame metadata available</span>
                );
              })()}
            </div>
          </div>
        )
        )}
        </div>
      </div>
    );
  };

  // Render encounter with its module tree
  const renderEncounter = (encounter, index) => {
    const { encounter_id, module_tree } = encounter;
    
    return (
        <div className="py-4" style={{width: '100%'}}>
          <div className="d-flex justify-content-between align-items-center mb-4" style={{paddingLeft: '20px', paddingRight: '20px'}}>
            <div className="d-flex align-items-center">
              <button
                className="btn btn-link p-0 me-3"
                onClick={() => toggleEncounterCollapse(encounter_id)}
                title={encounterCollapsed[encounter_id] ? "Expand encounter modules" : "Collapse encounter modules"}
                style={{
                  color: '#667eea',
                  textDecoration: 'none',
                  fontSize: '1.2rem',
                  minWidth: '24px'
                }}
              >
                <i className={`fas ${encounterCollapsed[encounter_id] ? 'fa-plus' : 'fa-minus'}`}></i>
              </button>
              <h4 className="card-title mb-0" style={{color: '#667eea'}}>
                <i className="fas fa-hospital me-2"></i>
                Encounter {index + 1}
              </h4>
            </div>
            {isEditMode && (
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => handleAddModuleToEncounter(encounter_id)}
                title="Add a new module to this encounter"
                style={{
                  border: '2px solid #667eea',
                  backgroundColor: 'transparent',
                  color: '#667eea',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#667eea';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.color = '#667eea';
                }}
              >
                <i className="fas fa-plus me-1"></i>
                Add Module
              </button>
            )}
          </div>
          
          {!encounterCollapsed[encounter_id] && (
            <div className="module-tree">
              {module_tree.map((moduleNode, index) => {
                const module = modules.find(m => m.id === moduleNode.id);
                if (!module) return null;
              
              return (
                <div key={index} className="module-node mb-4">
                  <div className="card border-primary" style={{width: '100% !important', maxWidth: 'none !important', margin: '0 !important', minWidth: '100% !important'}}>
                    <div className="card-header bg-primary text-white">
                      <h5 className="mb-0">
                        <i className="fas fa-cube me-2"></i>
                        {module.name || `${capitalizeFirst(module.type)} Module`}
                      </h5>
                    </div>
                    <div className="card-body py-4">
                      <div className="module-info-container mb-4">
                        <div className="row justify-content-center">
                          <div className="col-md-4">
                            <div className="module-info-section text-center">
                              <p className="mb-3">
                                <strong>Module ID:</strong> <br/>
                                <span className="text-muted">{module.id || 'N/A'}</span>
                              </p>
                              <p className="mb-3">
                                <strong>Type:</strong> <br/>
                                <span className="text-muted">{capitalizeFirst(module.type)}</span>
                              </p>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div className="module-info-section text-center">
                              <p className="mb-3">
                                <strong>Schema Path:</strong> <br/>
                                <span className="text-muted">{module.schema_path || 'N/A'}</span>
                              </p>
                              <p className="mb-3">
                                <strong>Source File:</strong> <br/>
                                <span className="text-muted">{module.source_file || 'N/A'}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Derived Modules */}
                      {moduleNode.derives && moduleNode.derives.length > 0 && (
                        <div className="mb-4 text-center">
                          <h6 className="text-success mb-3">
                            <i className="fas fa-arrow-down me-2"></i>
                            Derived Modules:
                          </h6>
                          <div className="list-group" style={{maxWidth: '80%', margin: '0 auto'}}>
                            {moduleNode.derives.map((derived, idx) => {
                              const derivedModule = modules.find(m => m.id === derived.id);
                              return (
                                <div key={idx} className="list-group-item list-group-item-success text-center">
                                  <strong>{derivedModule?.type || 'Unknown'}</strong> - {derived.id}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Annotating Modules */}
                      {moduleNode.annotated_by && moduleNode.annotated_by.length > 0 && (
                        <div className="mb-4 text-center">
                          <h6 className="text-info mb-3">
                            <i className="fas fa-comment me-2"></i>
                            Annotated By:
                          </h6>
                          <div className="list-group" style={{maxWidth: '80%', margin: '0 auto'}}>
                            {moduleNode.annotated_by.map((annotator, idx) => {
                              const annotatorModule = modules.find(m => m.id === annotator.id);
                              return (
                                <div key={idx} className="list-group-item list-group-item-info text-center">
                                  <strong>{annotatorModule?.type || 'Unknown'}</strong> - {annotator.id}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {(() => {
                        // For image modules, check metadata of the currently selected image module
                        // For other modules, check the original module metadata
                        const metadataToShow = module.type === 'image' && currentImageModuleId ? 
                          modules.find(m => m.id === currentImageModuleId)?.metadata : 
                          module.metadata;
                        
                        const hasMetadataError = metadataToShow && metadataToShow.error;
                        const hasDataError = module.data && module.data.error;
                        
                        // If there are any errors, show unified error block and skip all other displays
                        if (hasMetadataError || hasDataError) {
                          return (
                            <div className="mt-3">
                              <h6 className="text-danger">
                                <i className="fas fa-exclamation-triangle me-2"></i>
                                Module Error
                              </h6>
                              <div className="bg-danger bg-opacity-10 border border-danger p-3 rounded">
                                {(() => {
                                  if (hasMetadataError) {
                                    return (
                                      <div>
                                        <div className="text-danger">
                                          <strong>Error Type:</strong> {metadataToShow.error}
                                        </div>
                                        <div className="text-danger mt-1">
                                          <strong>Message:</strong> {metadataToShow.message || 'No message available'}
                                        </div>
                                        {metadataToShow.error === 'decryption_failed' && (
                                          <div className="mt-2">
                                            <i className="fas fa-lock me-1"></i>
                                            <small>This usually means the password is incorrect. Please check your login credentials.</small>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  } else if (hasDataError) {
                                    return (
                                      <div>
                                        <div className="text-danger">
                                          <strong>Error Type:</strong> {module.data.error}
                                        </div>
                                        <div className="text-danger mt-1">
                                          <strong>Message:</strong> {module.data.message || 'No message available'}
                                        </div>
                                        {module.data.error === 'decryption_failed' && (
                                          <div className="mt-2">
                                            <i className="fas fa-lock me-1"></i>
                                            <small>This usually means the password is incorrect. Please check your login credentials.</small>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          );
                        }
                        
                        // If no errors, show normal module content
                        return (
                          <>
                            {/* Module Metadata Display */}
                            {(() => {
                              if (!metadataToShow) return null;
                              
                              return (
                                <div className="mt-3">
                                  <h6 className="text-primary">
                                    <i className="fas fa-info-circle me-2"></i>
                                    Module Metadata
                                    {module.type === 'image' && currentImageModuleId && currentImageModuleId !== module.id && (
                                      <span className="text-muted ms-2">
                                        (Showing: {modules.find(m => m.id === currentImageModuleId)?.name || currentImageModuleId})
                                      </span>
                                    )}
                                  </h6>
                                  <div className="bg-light p-3 rounded">
                                    {Array.isArray(metadataToShow) ? (
                                      // If metadata is directly an array, display each record
                                      metadataToShow.map((meta, index) => (
                                        <div key={index} className="mb-2">
                                          <strong>Record {index + 1}:</strong>
                                          <pre className="mt-1 mb-0" style={{fontSize: '0.875rem', maxHeight: '150px', overflow: 'auto'}}>
                                            {JSON.stringify(meta, null, 2)}
                                          </pre>
                                        </div>
                                      ))
                                    ) : metadataToShow.content && Array.isArray(metadataToShow.content) ? (
                                      // If metadata has a content array, display just the content
                                      metadataToShow.content.map((meta, index) => (
                                        <div key={index} className="mb-2">
                                          <strong>Record {index + 1}:</strong>
                                          <pre className="mt-1 mb-0" style={{fontSize: '0.875rem', maxHeight: '150px', overflow: 'auto'}}>
                                            {JSON.stringify(meta, null, 2)}
                                          </pre>
                                        </div>
                                      ))
                                    ) : metadataToShow && typeof metadataToShow === 'object' && !Array.isArray(metadataToShow) ? (
                                      // If metadata is a single object (like image metadata), display it directly
                                      <pre className="mt-1 mb-0" style={{fontSize: '0.875rem', maxHeight: '150px', overflowY: 'auto'}}>
                                        {JSON.stringify(metadataToShow, null, 2)}
                                      </pre>
                                    ) : (
                                      // Fallback: display the metadata object
                                      <pre className="mt-1 mb-0" style={{fontSize: '0.875rem', maxHeight: '150px', overflowY: 'auto'}}>
                                        {JSON.stringify(metadataToShow, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Module Data Display */}
                            {module.type === 'image' && renderImagingModule(module, moduleNode)}
                            
                            {/* Show actual data if no errors */}
                            {module.type !== 'image' && module.data && !module.data.error && Object.keys(module.data).length > 0 && (
                              <div className="mt-3">
                                <h6 className="text-success">
                                  <i className="fas fa-database me-2"></i>
                                  Module Data
                                </h6>
                                <div className="bg-light p-3 rounded">
                                  {module.data.type === 'tabular' && module.data.data ? (
                                    // For tabular data, show just the actual records
                                    module.data.data.map((record, index) => (
                                      <div key={index} className="mb-3">
                                        <strong className="text-primary">Record {index + 1}:</strong>
                                        <pre className="mt-1 mb-0" style={{fontSize: '0.875rem', maxHeight: '150px', overflow: 'auto'}}>
                                          {JSON.stringify(record, null, 2)}
                                        </pre>
                                      </div>
                                    ))
                                  ) : (
                                    // For other data types, show the full data object
                                    <pre className="mt-1 mb-0" style={{fontSize: '0.875rem', maxHeight: '200px', overflowY: 'auto'}}>
                                      {JSON.stringify(module.data, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Show message if no data available and no errors */}
                            {module.type !== 'image' && (!module.data || Object.keys(module.data).length === 0) && !module.data?.error && (
                              <div className="mt-3 text-center">
                                <div className="text-muted">
                                  <i className="fas fa-info-circle me-2"></i>
                                  Module data not yet loaded from file
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
    );
  };

  // Handle file selection with path (using File System Access API)
  const handleFileSelectWithPath = async () => {
    const result = await getFileWithPath();
    if (!result) {
      // Fall back to regular file input
      fileInputRef.current.click();
      return;
    }

    const { file, filePath } = result;
    
    console.log('📁 File selected with path:', filePath);
    
    // Check if file has .umdf extension
    if (!file.name.toLowerCase().endsWith('.umdf')) {
      setErrorMessage('Please select a .umdf file');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
      return;
    }
    
    // Store the file path for later use in edit mode
    sessionStorage.setItem('umdf_file_path', filePath);
    
    // Process the file using the change file logic
    await handleChangeFileWithFile(file);
  };

  // Handle changing to a new file
  const handleChangeFile = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    await handleChangeFileWithFile(file);
    
    // Clear the file input
    event.target.value = '';
  };

  // Handle changing to a new file with a File object
  const handleChangeFileWithFile = async (file) => {
    console.log('🔄 Change File: Starting file change process');
    console.log('🔄 Change File: Selected file:', file.name, file.size, file.type);
    
    try {
      setProcessingMessage('Closing current file and loading new file...');
      
      // First, close the current file in the backend
      console.log('🔄 Change File: Closing current file in backend...');
      const closeResponse = await fetch('/api/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!closeResponse.ok) {
        console.warn('Warning: Could not close previous file:', closeResponse.status);
      } else {
        console.log('🔄 Change File: Successfully closed current file');
      }
      
      // Reset state for new file
      console.log('🔄 Change File: Resetting frontend state...');
      setModules([]);
      setEncounters([]);
      setCurrentImageModuleId(null);
      setSliderValues({});
      setModuleGraph({});
      setIsEditMode(false); // Reset edit mode when changing files
      
      // Get password from session storage (same one used from home page)
      const storedPassword = sessionStorage.getItem('umdf_password');
      console.log('🔄 Change File: Retrieved password from sessionStorage:', storedPassword ? 'Password found' : 'No password');
      
      // Now process the new file using the reusable function
      console.log('🔄 Change File: Calling processFileData with file:', file.name);
      await processFileData(file, storedPassword);
      console.log('🔄 Change File: processFileData completed successfully');
      
    } catch (error) {
      console.error('❌ Change File: Error changing file:', error);
      setProcessingMessage('Error changing file. Please try again.');
    }
  };

  // Handle switching to edit mode
  const handleEditFile = async () => {
    console.log('✏️ Edit File: Button clicked!');
    console.log('✏️ Edit File: Starting edit mode switch');
    
    try {
      setProcessingMessage('Switching to edit mode...');
      
      // Get the current file path and password
      const fileName = sessionStorage.getItem('umdf_file_name');
      const filePath = sessionStorage.getItem('umdf_file_path'); // Get actual file path if available
      const storedPassword = sessionStorage.getItem('umdf_password');
      
      console.log('🔍 Edit File Debug - fileName from sessionStorage:', fileName);
      console.log('🔍 Edit File Debug - filePath from sessionStorage:', filePath);
      console.log('🔍 Edit File Debug - storedPassword from sessionStorage:', storedPassword);
      
      if (!fileName) {
        throw new Error('No file currently open');
      }
      
      // Use actual file path if available, otherwise fall back to filename
      const pathToSend = filePath || fileName;
      console.log('✏️ Edit File: Switching to edit mode for file:', pathToSend);
      console.log('🔍 Edit File Debug - Final pathToSend:', pathToSend);
      
      // Create form data for the edit request
      const formData = new FormData();
      formData.append('file_path', pathToSend);
      if (storedPassword) {
        formData.append('password', storedPassword);
      }
      
      // Call the edit endpoint to switch to writer mode
      console.log('✏️ Edit File: Sending request to /api/edit...');
      const editResponse = await fetch('/api/edit', {
        method: 'POST',
        body: formData
      });
      
      console.log('✏️ Edit File: Response status:', editResponse.status);
      console.log('✏️ Edit File: Response ok:', editResponse.ok);
      
      if (!editResponse.ok) {
        throw new Error(`HTTP error! status: ${editResponse.status}`);
      }
      
      const result = await editResponse.json();
      console.log('✏️ Edit File: Response data:', result);
      
      if (result.success) {
        console.log('✏️ Edit File: Successfully switched to edit mode');
        setProcessingMessage('File opened in edit mode');
        
        // Set edit mode state
        setIsEditMode(true);
        
        // Show success message
        setShowSuccessBar(true);
        setTimeout(() => setShowSuccessBar(false), 3000);
        
        // TODO: Update UI to show edit mode indicators
        // For now, just show the success message
        
      } else {
        throw new Error(result.message || 'Failed to switch to edit mode');
      }
      
    } catch (error) {
      console.error('❌ Edit File: Error switching to edit mode:', error);
      setProcessingMessage('Error switching to edit mode. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle saving changes to the file
  const handleSaveFile = async () => {
    try {
      console.log('💾 Save File: Starting save process');
      setProcessingMessage('Saving changes...');
      
      // TODO: Implement actual save functionality
      // For now, just show a success message
      setProcessingMessage('Changes saved successfully');
      setShowSuccessBar(true);
      setTimeout(() => setShowSuccessBar(false), 3000);
      
      console.log('💾 Save File: Save completed');
    } catch (error) {
      console.error('❌ Save File: Error saving file:', error);
      setProcessingMessage('Error saving changes. Please try again.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle canceling edit mode
  const handleCancelEdit = async () => {
    try {
      console.log('❌ Cancel Edit: Starting cancel process');
      setProcessingMessage('Canceling edit mode...');
      
      // Get the stored password
      const storedPassword = sessionStorage.getItem('umdf_password');
      
      // Create form data for the cancel request
      const formData = new FormData();
      if (storedPassword) {
        formData.append('password', storedPassword);
      }
      
      // Call the backend to cancel edit mode and close writer
      const response = await fetch('/api/cancel-edit', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('❌ Cancel Edit: Successfully canceled edit mode');
        setIsEditMode(false);
        setProcessingMessage('Edit mode canceled');
        setShowSuccessBar(true);
        setTimeout(() => setShowSuccessBar(false), 3000);
      } else {
        throw new Error(result.message || 'Failed to cancel edit mode');
      }
      
      console.log('❌ Cancel Edit: Cancel completed');
    } catch (error) {
      console.error('❌ Cancel Edit: Error canceling edit:', error);
      setProcessingMessage('Error canceling edit mode. Please try again.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle adding a new encounter
  const handleAddNewEncounter = async () => {
    try {
      console.log('➕ Add Encounter: Starting add encounter process');
      setProcessingMessage('Adding new encounter...');
      
      // Call the backend to create a new encounter
      const response = await fetch('/api/add-encounter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('➕ Add Encounter: Successfully created encounter:', result.encounter_id);
        
        // Add the new encounter to the encounters state
        const newEncounter = {
          encounter_id: result.encounter_id,
          module_tree: [] // Start with empty module tree
        };
        
        setEncounters(prevEncounters => [...prevEncounters, newEncounter]);
        
        setProcessingMessage('New encounter added successfully');
        setShowSuccessBar(true);
        setTimeout(() => setShowSuccessBar(false), 3000);
        
        console.log('➕ Add Encounter: Encounter added to state');
      } else {
        throw new Error(result.message || 'Failed to create encounter');
      }
      
      console.log('➕ Add Encounter: Add completed');
    } catch (error) {
      console.error('❌ Add Encounter: Error adding encounter:', error);
      setProcessingMessage('Error adding encounter. Please try again.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle adding a new module to a specific encounter
  const handleAddModuleToEncounter = async (encounterId) => {
    try {
      console.log('➕ Add Module: Starting add module process for encounter:', encounterId);
      setProcessingMessage('Adding new module to encounter...');
      
      // TODO: Implement actual add module functionality
      // For now, just show a success message
      setProcessingMessage('New module added to encounter successfully');
      setShowSuccessBar(true);
      setTimeout(() => setShowSuccessBar(false), 3000);
      
      console.log('➕ Add Module: Add completed');
    } catch (error) {
      console.error('❌ Add Module: Error adding module:', error);
      setProcessingMessage('Error adding module. Please try again.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  // Toggle encounter collapse state
  const toggleEncounterCollapse = (encounterId) => {
    setEncounterCollapsed(prev => ({
      ...prev,
      [encounterId]: !prev[encounterId]
    }));
  };

  // Handle page unload/refresh when in edit mode
  useEffect(() => {
    const handleBeforeUnload = async (event) => {
      if (isEditMode) {
        console.log('⚠️ Page unload detected while in edit mode - attempting to cancel edit');
        
        // Try to cancel edit mode before page unloads
        try {
          // Use sendBeacon for more reliable delivery during page unload
          const data = new FormData();
          navigator.sendBeacon('/api/cancel-edit', data);
        } catch (error) {
          console.error('❌ Error sending cancel request during page unload:', error);
        }
        
        // Show warning to user
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return event.returnValue;
      }
    };

    // Add event listener for page unload only
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup function
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isEditMode]);

  // Load module data from the C++ reader
  const loadModule = async (moduleId) => {
    try {
      console.log(`🚀 Loading data for module: ${moduleId}`);
      
      // Call the C++ reader to get module data
      console.log(`📡 Making request to: /api/module/${moduleId}/data`);
      const response = await fetch(`/api/module/${moduleId}/data`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      console.log(`📥 Response status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`📋 Response data:`, result);
      
      if (result.success) {
        // Update the module with the loaded data and metadata
        console.log(`✅ Updating module ${moduleId} with data:`, result.data);
        console.log(`✅ Updating module ${moduleId} with metadata:`, result.metadata);
        setModules(prevModules => 
          prevModules.map(module => 
            module.id === moduleId 
              ? { ...module, data: result.data, metadata: result.metadata }
              : module
          )
        );
        console.log(`🎉 Successfully loaded data for module: ${moduleId}`);
      } else {
        // Handle different types of errors from the backend
        console.error(`❌ Failed to load module data:`, result);
        
        if (result.error === 'decryption_failed') {
          // This is a password issue - show a user-friendly error
          console.error(`🔐 Decryption failed - password may be incorrect`);
          
          // Update the module with error information
          setModules(prevModules => 
            prevModules.map(module => 
              module.id === moduleId 
                ? { 
                    ...module, 
                    data: { error: 'decryption_failed', message: result.message },
                    metadata: { error: 'decryption_failed', message: result.message }
                  }
                : module
            )
          );
          
          // Show error message to user
          setErrorMessage('Module decryption failed. The password may be incorrect. Please check your login credentials.');
          setShowErrorBar(true);
          
        } else if (result.error === 'module_access_failed') {
          // Other module access error
          console.error(`🚫 Module access failed: ${result.message}`);
          
          setModules(prevModules => 
            prevModules.map(module => 
              module.id === moduleId 
                ? { 
                    ...module, 
                    data: { error: 'module_access_failed', message: result.message },
                    metadata: { error: 'module_access_failed', message: result.message }
                  }
                : module
            )
          );
          
          setErrorMessage(`Failed to access module: ${result.message}`);
          setShowErrorBar(true);
          
        } else {
          // Generic error
          console.error(`❓ Unknown error type: ${result.error}`);
          
          setModules(prevModules => 
            prevModules.map(module => 
              module.id === moduleId 
                ? { 
                    ...module, 
                    data: { error: 'unknown', message: result.message || 'Unknown error occurred' },
                    metadata: { error: 'unknown', message: result.message || 'Unknown error occurred' }
                  }
                : module
            )
          );
          
          setErrorMessage(result.message || 'An unknown error occurred while loading module data');
          setShowErrorBar(true);
        }
      }
    } catch (error) {
      console.error(`💥 Error loading module data for ${moduleId}:`, error);
      
      // Update the module with error information for network/other errors
      setModules(prevModules => 
        prevModules.map(module => 
          module.id === moduleId 
            ? { 
                ...module, 
                data: { error: 'network_error', message: error.message },
                metadata: { error: 'network_error', message: error.message }
              }
            : module
        )
      );
      
      setErrorMessage(`Network error: ${error.message}`);
      setShowErrorBar(true);
    }
  };

  const { fileName, fileSize } = getFileInfo();

  return (
    <div className="home-page">
      <div className="header-section">
        <div className="container-fluid px-4">
          <div className="row">
            <div className="col-12 py-4">
              <div className="d-flex justify-content-between align-items-center">
                <div className="text-center flex-grow-1">
                  <h1 className="header-logo mb-0">
                    <i className="fas fa-heartbeat me-3"></i>
                    Medical File Format
                  </h1>
                </div>
                <div className="user-info-container">
                  {sessionStorage.getItem('umdf_username') && (
                    <div className="user-info-card">
                      <div className="d-flex align-items-center gap-2">
                        <small className="text-muted">
                          <i className="fas fa-user me-1"></i>
                          Logged in as: <strong>{sessionStorage.getItem('umdf_username')}</strong>
                        </small>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={async () => {
                            try {
                              console.log('🔄 Change User: Starting user change process');
                              
                              // First, close the current file in the backend to clear any cached data
                              console.log('🔄 Change User: Closing current file in backend...');
                              const closeResponse = await fetch('/api/close', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                }
                              });
                              
                              if (closeResponse.ok) {
                                console.log('🔄 Change User: Successfully closed file in backend');
                              } else {
                                console.warn('🔄 Change User: Warning - could not close file in backend:', closeResponse.status);
                              }
                              
                              // Clear ALL session storage data
                              console.log('🔄 Change User: Clearing all session storage...');
                              sessionStorage.removeItem('umdf_username');
                              sessionStorage.removeItem('umdf_password');
                              sessionStorage.removeItem('umdf_modules_metadata');
                              sessionStorage.removeItem('umdf_file_ready');
                              sessionStorage.removeItem('umdf_file_data');
                              sessionStorage.removeItem('umdf_file_name');
                              
                              // Clear all component state
                              console.log('🔄 Change User: Clearing component state...');
                              setModules([]);
                              setEncounters([]);
                              setCurrentImageModuleId(null);
                              setSliderValues({});
                              setModuleGraph({});
                              setIsProcessing(false);
                              setProcessingMessage('');
                              setShowSuccessBar(false);
                              setIsEditMode(false); // Reset edit mode when changing users
                              
                              console.log('🔄 Change User: All data cleared, redirecting to home page');
                              
                              // Redirect to home page for new login
                              window.location.href = '/';
                              
                            } catch (error) {
                              console.error('❌ Change User: Error during user change:', error);
                              // Even if there's an error, clear everything and redirect
                              sessionStorage.clear(); // Nuclear option - clear everything
                              window.location.href = '/';
                            }
                          }}
                        >
                          <i className="fas fa-sign-out-alt me-1"></i>
                          Change User
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="main-content">
        {/* Hidden file input for changing files */}
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          accept=".umdf,.dcm,.dicom,.jpg,.jpeg,.png,.tiff,.bmp,.fhir,.json"
          onChange={handleChangeFile}
        />
        
        <div className="container-fluid px-4">
          <div className="row">
            <div className="col-12">
              {/* Title Card */}
              <div className="card mb-4" style={{maxWidth: '90vw', margin: '0 auto'}}>
                <div className="card-body px-5" style={{paddingTop: '8px', paddingBottom: '8px'}}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="text-center flex-grow-1">
                      <h2 className="mb-2" style={{color: '#667eea'}}>
                        UMDF File Viewer
                        {isEditMode && (
                          <span className="ms-2 badge bg-warning text-dark" style={{fontSize: '0.7rem', verticalAlign: 'middle'}}>
                            <i className="fas fa-edit me-1"></i>
                            Edit Mode
                          </span>
                        )}
                      </h2>
                      <p className="text-muted mb-0">
                        File: {fileName} ({fileSize} bytes) • {modules.length} module{modules.length !== 1 ? 's' : ''} found
                        {encounters.length > 0 && ` • ${encounters.length} encounter${encounters.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div className="d-flex flex-column gap-2">
                      {isEditMode ? (
                        // Edit mode buttons
                        <>
                          <button
                            className="btn btn-sm w-100"
                            title="Save changes to the file"
                            onClick={() => handleSaveFile()}
                            style={{
                              fontSize: '0.8rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '120px',
                              height: '38px',
                              backgroundColor: 'transparent',
                              color: '#667eea',
                              border: '1px solid #667eea',
                              transition: 'all 0.2s ease-in-out'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#667eea';
                              e.target.style.color = 'white';
                              e.target.style.transform = 'translateY(-1px)';
                              e.target.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'transparent';
                              e.target.style.color = '#667eea';
                              e.target.style.transform = 'translateY(0)';
                              e.target.style.boxShadow = 'none';
                            }}
                          >
                            <i className="fas fa-save me-1"></i>
                            Save
                          </button>
                          <button
                            className="btn btn-sm w-100"
                            title="Cancel editing and return to view mode"
                            onClick={() => handleCancelEdit()}
                            style={{
                              fontSize: '0.8rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '120px',
                              height: '38px',
                              backgroundColor: 'transparent',
                              color: '#667eea',
                              border: '1px solid #667eea',
                              transition: 'all 0.2s ease-in-out'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#667eea';
                              e.target.style.color = 'white';
                              e.target.style.transform = 'translateY(-1px)';
                              e.target.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'transparent';
                              e.target.style.color = '#667eea';
                              e.target.style.transform = 'translateY(0)';
                              e.target.style.boxShadow = 'none';
                            }}
                          >
                            <i className="fas fa-times me-1"></i>
                            Cancel
                          </button>
                          <button
                            className="btn btn-sm w-100"
                            title="Add a new encounter to the file"
                            onClick={() => handleAddNewEncounter()}
                            style={{
                              fontSize: '0.8rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '120px',
                              height: '38px',
                              backgroundColor: 'transparent',
                              color: '#667eea',
                              border: '1px solid #667eea',
                              transition: 'all 0.2s ease-in-out'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#667eea';
                              e.target.style.color = 'white';
                              e.target.style.transform = 'translateY(-1px)';
                              e.target.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'transparent';
                              e.target.style.color = '#667eea';
                              e.target.style.transform = 'translateY(0)';
                              e.target.style.boxShadow = 'none';
                            }}
                          >
                            <i className="fas fa-plus me-1"></i>
                            Add New Encounter
                          </button>
                        </>
                      ) : (
                        // View mode buttons
                        <>
                          <button
                            className="btn btn-sm w-100"
                            title="Edit File"
                            onClick={handleEditFile}
                            style={{
                              fontSize: '0.8rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '120px',
                              height: '38px',
                              backgroundColor: 'transparent',
                              color: '#667eea',
                              border: '1px solid #667eea',
                              transition: 'all 0.2s ease-in-out'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#667eea';
                              e.target.style.color = 'white';
                              e.target.style.transform = 'translateY(-1px)';
                              e.target.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'transparent';
                              e.target.style.color = '#667eea';
                              e.target.style.transform = 'translateY(0)';
                              e.target.style.boxShadow = 'none';
                            }}
                          >
                            <i className="fas fa-edit me-1"></i>
                            Edit File
                          </button>
                          <button
                            className="btn btn-sm w-100"
                            title="Change File"
                            onClick={async () => {
                              if (isFileSystemAccessSupported) {
                                await handleFileSelectWithPath();
                              } else {
                                fileInputRef.current.click();
                              }
                            }}
                            style={{
                              fontSize: '0.8rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '120px',
                              height: '38px',
                              backgroundColor: 'transparent',
                              color: '#667eea',
                              border: '1px solid #667eea',
                              transition: 'all 0.2s ease-in-out'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#667eea';
                              e.target.style.color = 'white';
                              e.target.style.transform = 'translateY(-1px)';
                              e.target.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'transparent';
                              e.target.style.color = '#667eea';
                              e.target.style.transform = 'translateY(0)';
                              e.target.style.boxShadow = 'none';
                            }}
                          >
                            <i className="fas fa-exchange-alt me-1"></i>
                            Change File
                          </button>
                          <button
                            className="btn btn-sm w-100"
                            title="Create New File"
                            style={{
                              fontSize: '0.8rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '120px',
                              height: '38px',
                              backgroundColor: 'transparent',
                              color: '#667eea',
                              border: '1px solid #667eea',
                              transition: 'all 0.2s ease-in-out'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#667eea';
                              e.target.style.color = 'white';
                              e.target.style.transform = 'translateY(-1px)';
                              e.target.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'transparent';
                              e.target.style.color = '#667eea';
                              e.target.style.transform = 'translateY(0)';
                              e.target.style.boxShadow = 'none';
                            }}
                          >
                            <i className="fas fa-plus me-1"></i>
                            Create New File
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>


              {/* Encounters and Module Cards */}
              {encounters.length > 0 ? (
                encounters.map((encounter, index) => renderEncounter(encounter, index))
              ) : modules.length > 0 ? (
                // Fallback to old module display if no encounters
                modules.map((module, index) => (
                  <div key={index} className="card mb-4" style={{maxWidth: '95vw', margin: '0 auto'}}>
                    <div className="card-body px-4 py-2">
                      <h4 className="card-title mb-3">
                        {module.name || `${capitalizeFirst(module.type)} Module`}
                      </h4>
                      
                      <div className="row mb-3">
                        <div className="col-md-6">
                          <p className="mb-1">
                            <strong>Module ID:</strong> {module.id || 'N/A'}
                          </p>
                          <p className="mb-1">
                            <strong>Schema Path:</strong> {module.schema_path || 'N/A'}
                          </p>
                        </div>
                        <div className="col-md-6">
                          <p className="mb-1">
                            <strong>Schema URL:</strong> 
                            {module.schema_url ? (
                              <a href={module.schema_url} target="_blank" rel="noopener noreferrer" className="ms-2">
                                {module.schema_url}
                              </a>
                            ) : (
                              <span className="ms-2">N/A</span>
                            )}
                          </p>
                          <p className="mb-1">
                            <strong>Version:</strong> {module.version || 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Check for any errors in metadata or data first */}
                      {(module.metadata && module.metadata.error) || (module.data && module.data.error) ? (
                        <div className="mt-3">
                          <h6 className="text-danger">
                            <i className="fas fa-exclamation-triangle me-2"></i>
                            Module Error
                          </h6>
                          <div className="bg-danger bg-opacity-10 border border-danger p-3 rounded">
                            {(() => {
                              if (module.metadata && module.metadata.error) {
                                return (
                                  <div>
                                    <div className="text-danger">
                                      <strong>Error Type:</strong> {module.metadata.error}
                                    </div>
                                    <div className="text-danger mt-1">
                                      <strong>Message:</strong> {module.metadata.message || 'No message available'}
                                    </div>
                                    {module.metadata.error === 'decryption_failed' && (
                                      <div className="mt-2">
                                        <i className="fas fa-lock me-1"></i>
                                        <small>This usually means the password is incorrect. Please check your login credentials.</small>
                                      </div>
                                    )}
                                  </div>
                                );
                              } else if (module.data && module.data.error) {
                                return (
                                  <div>
                                    <div className="text-danger">
                                      <strong>Error Type:</strong> {module.data.error}
                                    </div>
                                    <div className="text-danger mt-1">
                                      <strong>Message:</strong> {module.data.message || 'No message available'}
                                    </div>
                                    {module.data.error === 'decryption_failed' && (
                                      <div className="mt-2">
                                        <i className="fas fa-lock me-1"></i>
                                        <small>This usually means the password is incorrect. Please check your login credentials.</small>
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Module Metadata Display - only show if no errors */}
                          {module.metadata && !module.metadata.error && Array.isArray(module.metadata) && module.metadata.length > 0 && (
                        <div className="mt-3">
                          <h6 className="text-primary">
                            <i className="fas fa-info-circle me-2"></i>
                            Module Metadata
                          </h6>
                          <div className="bg-light p-3 rounded">
                            {module.metadata.map((meta, index) => (
                              <div key={index} className="mb-2">
                                <strong>Record {index + 1}:</strong>
                                <pre className="mt-1 mb-0" style={{fontSize: '0.875rem', maxHeight: '150px', overflow: 'auto'}}>
                                  {JSON.stringify(meta, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Module Data Display */}
                      {module.type === 'image' && (() => {
                        // For image modules, check for errors first
                        const hasMetadataError = module.metadata && module.metadata.error;
                        const hasDataError = module.data && module.data.error;
                        
                        if (hasMetadataError || hasDataError) {
                          return (
                            <div className="mt-3">
                              <h6 className="text-danger">
                                <i className="fas fa-exclamation-triangle me-2"></i>
                                Module Error
                              </h6>
                              <div className="bg-danger bg-opacity-10 border border-danger p-3 rounded">
                                {(() => {
                                  if (hasMetadataError) {
                                    return (
                                      <div>
                                        <div className="text-danger">
                                          <strong>Error Type:</strong> {module.metadata.error}
                                        </div>
                                        <div className="text-danger mt-1">
                                          <strong>Message:</strong> {module.metadata.message || 'No message available'}
                                        </div>
                                        {module.metadata.error === 'decryption_failed' && (
                                          <div className="mt-2">
                                            <i className="fas fa-lock me-1"></i>
                                            <small>This usually means the password is incorrect. Please check your login credentials.</small>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  } else if (hasDataError) {
                                    return (
                                      <div>
                                        <div className="text-danger">
                                          <strong>Error Type:</strong> {module.data.error}
                                        </div>
                                        <div className="text-danger mt-1">
                                          <strong>Message:</strong> {module.data.message || 'No message available'}
                                        </div>
                                        {module.data.error === 'decryption_failed' && (
                                          <div className="mt-2">
                                            <i className="fas fa-lock me-1"></i>
                                            <small>This usually means the password is incorrect. Please check your login credentials.</small>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          );
                        }
                        
                        // If no errors, render the normal image module
                        return renderImagingModule(module, null);
                      })()}
                      
                      {/* Show actual data if no errors */}
                      {module.type !== 'image' && module.data && !module.data.error && Object.keys(module.data).length > 0 && (
                        <div className="mt-3">
                          <h6 className="text-success">
                            <i className="fas fa-database me-2"></i>
                            Module Data
                          </h6>
                          <pre className="bg-light p-0" style={{maxHeight: '200px', overflowY: 'auto'}}>
                            {JSON.stringify(module.data, null, 2)}
                          </pre>
                        </div>
                      )}
                      
                      {/* Show message if no data available and no errors */}
                      {module.type !== 'image' && (!module.data || Object.keys(module.data).length === 0) && !module.data?.error && (
                        <div className="mt-3 text-center">
                          <div className="text-muted">
                            <i className="fas fa-info-circle me-2"></i>
                            Module data not yet loaded from file
                          </div>
                        </div>
                      )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-5">
                  <p className="text-muted">No modules to display</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Success Bar */}
      {showSuccessBar && (
        <div className="alert alert-success alert-dismissible fade show position-fixed bottom-0 start-50 translate-middle-x mb-4" role="alert" style={{zIndex: 1050, maxWidth: '90vw', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'}}>
          <i className="fas fa-check-circle me-2"></i>
          File processed successfully! {modules.length} module{modules.length !== 1 ? 's' : ''} loaded.
          <button type="button" className="btn-close" onClick={() => setShowSuccessBar(false)}></button>
        </div>
      )}

      {/* Error Bar */}
      {showErrorBar && (
        <div className="alert alert-danger alert-dismissible fade show position-fixed bottom-0 start-50 translate-middle-x mb-4" role="alert" style={{zIndex: 1050, maxWidth: '90vw', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'}}>
          <i className="fas fa-exclamation-circle me-2"></i>
          {errorMessage}
          <button type="button" className="btn-close" onClick={() => setShowErrorBar(false)}></button>
        </div>
      )}

      {/* Processing Modal */}
      <ProcessingModal 
        isVisible={isProcessing}
        fileName={sessionStorage.getItem('umdf_file_name')}
        fileSize={sessionStorage.getItem('umdf_file_size')}
        fileType="UMDF"
      />
    </div>
  );
};

export default UMDFViewer; 