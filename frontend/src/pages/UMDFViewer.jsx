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

  // Set up global function for slider updates
  useEffect(() => {
    window.updateSliderValueGlobal = updateSliderValue;
    
    return () => {
      delete window.updateSliderValueGlobal;
    };
  }, []);
  
  // Load module data when encounters are available
  useEffect(() => {
    if (encounters.length > 0) {
      console.log(`🔄 Loading data for ${encounters.length} encounters`);
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
    }
  }, [encounters]);
  
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
          
          if (result.success) {
            // Store only essential module metadata in sessionStorage (not full image data)
            const modulesForStorage = result.modules.map(module => ({
              id: module.id,
              name: module.name,
              schema_id: module.schema_id,
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
      return renderImagingModule(module);
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
  const renderImagingModule = (module) => {
    // Access dimensions from the metadata array structure
    let dimensions = [];
    let dimensionNames = [];
    
    // Check if metadata is an array (as shown in your example)
    if (Array.isArray(module.metadata) && module.metadata.length > 0) {
      const metadataObj = module.metadata[0];
      dimensions = metadataObj.dimensions || [];
      dimensionNames = metadataObj.dimension_names || [];
      console.log('Found dimensions in metadata[0]:', dimensions);
      console.log('Found dimension names in metadata[0]:', dimensionNames);
    }
    // Fallback: check if dimensions are directly in module
    else if (module.dimensions && Array.isArray(module.dimensions)) {
      dimensions = module.dimensions;
      dimensionNames = module.dimension_names || [];
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
    
    console.log('Dimensions array:', dimensions);
    console.log('Number of dimensions:', numDimensions);
    console.log('Width:', width, 'Height:', height);
    console.log('Calculated frames:', numFrames);
    console.log('Expected total pixels per frame:', totalPixels);
    
    console.log('Final dimensions array:', dimensions);
    console.log('Width:', width, 'Height:', height, 'Total pixels:', totalPixels);
    
    // Debug: Check for image data in various possible locations
    console.log('module.imageData:', module.imageData);
    console.log('module.data:', module.data);
    console.log('module.pixelData:', module.pixelData);
    if (module.data) {
      console.log('module.data keys:', Object.keys(module.data));
      if (module.data.imageData) {
        console.log('module.data.imageData:', module.data.imageData);
      }
      if (module.data.pixelData) {
        console.log('module.data.pixelData:', module.data.pixelData);
      }
    }
    
    return (
      <div className="imaging-module">
        <div className="row">
          <div className="col-md-8">
            <div className="image-viewer-container">
              {(() => {
                // Function to render the first frame
                // Check multiple possible locations for image data
                let imageData = module.imageData;
                let pixelData = null;
                
                if (!imageData && module.data) {
                  // Check if module.data is an array of frames (like we see in the console)
                  if (Array.isArray(module.data) && module.data.length > 0) {
                    // This is the structure we see: module.data[0].data contains pixel data
                    imageData = module.data;
                    console.log('Found frame array in module.data, length:', imageData.length);
                  } else if (module.data.imageData) {
                    imageData = module.data.imageData;
                  } else if (module.data.pixelData) {
                    // If pixelData is directly in data, create a single frame structure
                    imageData = [{ pixelData: module.data.pixelData }];
                  }
                }
                
                if (!imageData || !Array.isArray(imageData) || imageData.length === 0) {
                  return (
                    <div className="text-center p-4">
                      <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                      <p className="text-muted">No image data available</p>
                      <small className="text-muted">
                        Checked: module.imageData, module.data (array of {module.data?.length || 0} frames)
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
                    const key = `${module.id || 'unknown'}_${i}`;
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
                    if (module.metadata && Array.isArray(module.metadata) && module.metadata.length > 0) {
                      const metadata = module.metadata[0];
                      if (metadata.dimension_names && Array.isArray(metadata.dimension_names) && metadata.dimension_names[i]) {
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
                } else if (currentFrame.data && Array.isArray(currentFrame.data)) {
                  pixelData = currentFrame.data;
                  console.log('Found pixel data in currentFrame.data, length:', pixelData.length);
                } else if (Array.isArray(currentFrame)) {
                  // If currentFrame is directly an array, treat it as pixel data
                  pixelData = currentFrame;
                }
                
                // Get channel information from metadata
                let numChannels = 1; // Default to grayscale
                let channelNames = [];
                
                // Check metadata for channel information
                if (currentFrame.metadata && Array.isArray(currentFrame.metadata) && currentFrame.metadata.length > 0) {
                  const frameMetadata = currentFrame.metadata[0];
                  if (frameMetadata.channels) {
                    numChannels = frameMetadata.channels;
                  } else if (frameMetadata.channel_count) {
                    numChannels = frameMetadata.channel_count;
                  }
                  if (frameMetadata.channel_names) {
                    channelNames = frameMetadata.channel_names;
                  }
                }
                
                // Also check module-level metadata for channel info
                if (numChannels === 1 && module.metadata && Array.isArray(module.metadata) && module.metadata.length > 0) {
                  const moduleMetadata = module.metadata[0];
                  if (moduleMetadata.channels) {
                    numChannels = moduleMetadata.channels;
                  } else if (moduleMetadata.channel_count) {
                    numChannels = moduleMetadata.channel_count;
                  }
                  if (moduleMetadata.channel_names) {
                    channelNames = moduleMetadata.channel_names;
                  }
                }
                
                console.log('Channel information:', { numChannels, channelNames });
                console.log('Pixel data length:', pixelData.length);
                console.log('Expected pixels per frame:', totalPixels);
                console.log('Expected total values per frame:', totalPixels * numChannels);
                
                if (!pixelData || !Array.isArray(pixelData)) {
                  return (
                    <div className="text-center p-4">
                      <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                      <p className="text-muted">No pixel data in first frame</p>
                      <small className="text-muted">
                        First frame keys: {firstFrame ? Object.keys(firstFrame).join(', ') : 'null'}
                      </small>
                    </div>
                  );
                }
                
                try {
                  // Create a canvas to display the image
                  const canvas = document.createElement('canvas');
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  
                  // Get the image data
                  const imageData = ctx.createImageData(width, height);
                  const data = imageData.data;
                  
                  // Convert pixel data to RGBA values based on channel count
                  if (numChannels === 1) {
                    // Grayscale: single value per pixel
                    for (let i = 0; i < pixelData.length && i < data.length / 4; i++) {
                      const pixelValue = pixelData[i];
                      const dataIndex = i * 4;
                      
                      // Convert to grayscale (same value for R, G, B)
                      data[dataIndex] = pixelValue;     // Red
                      data[dataIndex + 1] = pixelValue; // Green
                      data[dataIndex + 2] = pixelValue; // Blue
                      data[dataIndex + 3] = 255;        // Alpha (fully opaque)
                    }
                  } else if (numChannels === 3) {
                    // RGB: three values per pixel
                    for (let i = 0; i < pixelData.length / 3 && i < data.length / 4; i++) {
                      const dataIndex = i * 4;
                      const pixelIndex = i * 3;
                      
                      data[dataIndex] = pixelData[pixelIndex];     // Red
                      data[dataIndex + 1] = pixelData[pixelIndex + 1]; // Green
                      data[dataIndex + 2] = pixelData[pixelIndex + 2]; // Blue
                      data[dataIndex + 3] = 255;                    // Alpha (fully opaque)
                    }
                  } else if (numChannels === 4) {
                    // RGBA: four values per pixel
                    for (let i = 0; i < pixelData.length / 4 && i < data.length / 4; i++) {
                      const dataIndex = i * 4;
                      const pixelIndex = i * 4;
                      
                      data[dataIndex] = pixelData[pixelIndex];     // Red
                      data[dataIndex + 1] = pixelData[pixelIndex + 1]; // Green
                      data[dataIndex + 2] = pixelData[pixelIndex + 2]; // Blue
                      data[dataIndex + 3] = pixelData[pixelIndex + 3]; // Alpha
                    }
                  } else {
                    // Other channel counts: treat as grayscale for now
                    console.warn(`Unsupported channel count: ${numChannels}, treating as grayscale`);
                    for (let i = 0; i < pixelData.length && i < data.length / 4; i++) {
                      const pixelValue = pixelData[i];
                      const dataIndex = i * 4;
                      
                      data[dataIndex] = pixelValue;     // Red
                      data[dataIndex + 1] = pixelValue; // Green
                      data[dataIndex + 2] = pixelValue; // Blue
                      data[dataIndex + 3] = 255;        // Alpha (fully opaque)
                    }
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
                        <div className="mt-1">
                          <small className="text-muted">
                            Current slider positions: {(() => {
                              const positions = [];
                              for (let i = 2; i < numDimensions; i++) {
                                const key = `${module.id || 'unknown'}_${i}`;
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
            <div className="col-md-4">
              <div className="dimension-controls">
                {dimensions.slice(2).map((dim, index) => {
                  const dimIndex = index + 2;
                  // Get dimension name from metadata if available
                  let dimName = `Dimension ${dimIndex}`;
                  if (module.metadata && Array.isArray(module.metadata) && module.metadata.length > 0) {
                    const metadata = module.metadata[0];
                    if (metadata.dimension_names && Array.isArray(metadata.dimension_names) && metadata.dimension_names[dimIndex]) {
                      dimName = metadata.dimension_names[dimIndex];
                    }
                  }
                  return (
                    <div key={dimIndex} className="dimension-control mb-3">
                      <label className="form-label text-muted mb-2">
                        {dimName}: <span className="text-primary">1-{dim}</span>
                      </label>
                      <CustomSlider
                        value={sliderValues[`${module.id || 'unknown'}_${index + 2}`] || 1}
                        min={1}
                        max={dim}
                        onChange={(newValue) => updateSliderValue(module.id || 'unknown', index + 2, newValue)}
                        moduleId={module.id || 'unknown'}
                        dimension={index + 2}
                        className="me-4"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render encounter with its module tree
  const renderEncounter = (encounter) => {
    const { encounter_id, module_tree } = encounter;
    
    return (
      <div key={encounter_id} className="card mb-4" style={{maxWidth: '90vw', margin: '0 auto'}}>
        <div className="card-body px-5 py-4">
          <h4 className="card-title mb-4 text-center" style={{color: '#667eea'}}>
            <i className="fas fa-hospital me-2"></i>
            Encounter: {encounter_id.substring(0, 8)}...
          </h4>
          
          <div className="module-tree">
            {module_tree.map((moduleNode, index) => {
              const module = modules.find(m => m.id === moduleNode.id);
              if (!module) return null;
              
              return (
                <div key={index} className="module-node mb-4">
                  <div className="card border-primary" style={{width: '100%'}}>
                    <div className="card-header bg-primary text-white">
                      <h5 className="mb-0">
                        <i className="fas fa-cube me-2"></i>
                        {capitalizeFirst(module.type)} Module
                      </h5>
                    </div>
                    <div className="card-body px-5 py-4">
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
                              <p className="mb-3">
                                <strong>Created:</strong> <br/>
                                <span className="text-muted">{formatDate(module.created_at)}</span>
                              </p>
                            </div>
                          </div>
                          <div className="col-md-4">
                            <div className="module-info-section text-center">
                              <p className="mb-3">
                                <strong>Schema ID:</strong> <br/>
                                <span className="text-muted">{module.schema_id || 'N/A'}</span>
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
                      
                      {/* Module Data Display - Only show if data exists */}
                      {module.type === 'image' && renderImagingModule(module)}
                      {module.type !== 'image' && module.data && Object.keys(module.data).length > 0 && (
                        <div className="mt-3">
                          <h6>Module Data</h6>
                          <pre className="bg-light p-2 rounded" style={{maxHeight: '200px', overflowY: 'auto'}}>
                            {JSON.stringify(module.data, null, 2)}
                          </pre>
                        </div>
                      )}
                      
                      {/* Show message if no data available */}
                      {module.type !== 'image' && (!module.data || Object.keys(module.data).length === 0) && (
                        <div className="mt-3 text-center">
                          <div className="text-muted">
                            <i className="fas fa-info-circle me-2"></i>
                            Module data not yet loaded from file
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

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
        // Update the module with the loaded data
        console.log(`✅ Updating module ${moduleId} with data:`, result.data);
        setModules(prevModules => 
          prevModules.map(module => 
            module.id === moduleId 
              ? { ...module, data: result.data }
              : module
          )
        );
        console.log(`🎉 Successfully loaded data for module: ${moduleId}`);
      } else {
        console.error(`❌ Failed to load module data: ${result.error}`);
      }
    } catch (error) {
      console.error(`💥 Error loading module data for ${moduleId}:`, error);
    }
  };

  const { fileName, fileSize } = getFileInfo();

  return (
    <div className="home-page">
      <div className="header-section">
        <div className="container-fluid px-4">
          <div className="row">
            <div className="col-12 text-center py-4">
              <h1 className="header-logo mb-0">
                <i className="fas fa-heartbeat me-3"></i>
                Medical File Format
              </h1>
            </div>
          </div>
        </div>
      </div>
      
      <div className="main-content">
        <div className="container-fluid px-4">
          <div className="row">
            <div className="col-12">
              {/* Title Card */}
              <div className="card mb-4" style={{maxWidth: '90vw', margin: '0 auto'}}>
                <div className="card-body px-5 py-3">
                  <div className="d-flex justify-content-between align-items-start">
                    <div className="text-center flex-grow-1">
                      <h2 className="mb-2" style={{color: '#667eea'}}>UMDF File Viewer</h2>
                      <p className="text-muted mb-0">
                        File: {fileName} ({fileSize} bytes) • {modules.length} module{modules.length !== 1 ? 's' : ''} found
                        {encounters.length > 0 && ` • ${encounters.length} encounter${encounters.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm"
                        title="Import File"
                        style={{
                          border: 'none', 
                          padding: '0.5rem',
                          backgroundColor: 'white',
                          color: '#6c757d'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.color = '#667eea';
                          e.target.querySelector('i').style.color = '#667eea';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.color = '#6c757d';
                          e.target.querySelector('i').style.color = '#6c757d';
                        }}
                      >
                        <i className="fas fa-file-import fa-lg" style={{color: '#6c757d'}}></i>
                      </button>
                      <button
                        className="btn btn-sm"
                        title="Clear Cache"
                        onClick={clearCache}
                        style={{
                          border: 'none', 
                          padding: '0.5rem',
                          backgroundColor: 'white',
                          color: '#6c757d'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.color = '#dc3545';
                          e.target.querySelector('i').style.color = '#dc3545';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.color = '#6c757d';
                          e.target.querySelector('i').style.color = '#6c757d';
                        }}
                      >
                        <i className="fas fa-trash fa-lg" style={{color: '#6c757d'}}></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>


              {/* Encounters and Module Cards */}
              {encounters.length > 0 ? (
                encounters.map((encounter, index) => renderEncounter(encounter))
              ) : modules.length > 0 ? (
                // Fallback to old module display if no encounters
                modules.map((module, index) => (
                  <div key={index} className="card mb-4" style={{maxWidth: '95vw', margin: '0 auto'}}>
                    <div className="card-body px-4 py-2">
                      <h4 className="card-title mb-3">
                        {capitalizeFirst(module.type)} Module
                      </h4>
                      
                      <div className="row mb-3">
                        <div className="col-md-6">
                          <p className="mb-1">
                            <strong>Module ID:</strong> {module.id || 'N/A'}
                          </p>
                          <p className="mb-1">
                            <strong>Schema ID:</strong> {module.schema_id || 'N/A'}
                          </p>
                          <p className="mb-1">
                            <strong>Created:</strong> {formatDate(module.created || '')}
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

                      {/* Metadata Section - Only show if metadata exists */}
                      {module.metadata && Object.keys(module.metadata).length > 0 && (
                        <div className="metadata-section mb-3">
                          <h6 className="text-muted mb-2">Metadata:</h6>
                          <div className="bg-light p-3 rounded">
                            <pre style={{fontSize: '0.875rem', maxHeight: '200px', overflow: 'auto', margin: '0'}}>
                              {JSON.stringify(module.metadata, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Module Data Display - Only show if data exists */}
                      {module.type === 'image' && renderImagingModule(module)}
                      {module.type !== 'image' && module.data && Object.keys(module.data).length > 0 && (
                        <div className="mt-3">
                          <h6>Module Data</h6>
                          <pre className="bg-light p-2 rounded" style={{maxHeight: '200px', overflowY: 'auto'}}>
                            {JSON.stringify(module.data, null, 2)}
                          </pre>
                        </div>
                      )}
                      
                      {/* Show message if no data available */}
                      {module.type !== 'image' && (!module.data || Object.keys(module.data).length === 0) && (
                        <div className="mt-3 text-center">
                          <div className="text-muted">
                            <i className="fas fa-info-circle me-2"></i>
                            Module data not yet loaded from file
                          </div>
                        </div>
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