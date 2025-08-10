import React, { useState, useEffect } from 'react';
import './UMDFViewer.css';

const UMDFViewer = () => {
  const [modules, setModules] = useState([]);
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
  
  // Process file and load modules on component mount
  useEffect(() => {
    const processFile = async () => {
      const fileReady = sessionStorage.getItem('umdf_file_ready');
      const fileData = sessionStorage.getItem('umdf_file_data');
      
      if (fileReady === 'true' && fileData) {
        setIsProcessing(true);
        setProcessingMessage('Processing UMDF file...');
        
        try {
          // Convert base64 data back to file object
          const base64Response = await fetch(fileData);
          const fileBlob = await base64Response.blob();
          
          // Create FormData for upload
          const formData = new FormData();
          formData.append('file', fileBlob, sessionStorage.getItem('umdf_file_name'));
          
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
            
            // Set full modules in component state (this won't persist across page refreshes)
            setModules(result.modules);
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
    setShowErrorBar(true);
    setErrorMessage('Cache cleared - ready for new file');
    setShowSuccessBar(false);
    
    // Auto-hide the clear message after 2 seconds
    setTimeout(() => setShowErrorBar(false), 2000);
  };

  // Get file info from sessionStorage
  const getFileInfo = () => {
    const fileName = sessionStorage.getItem('umdf_file_name') || 'Unknown file';
    const fileSize = sessionStorage.getItem('umdf_file_size') || '0';
    return { fileName, fileSize };
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
                      <div className="custom-slider me-4" data-dimension={index + 2} data-module-id={module.id || 'unknown'}>
                        <div className="slider-track">
                          <div className="slider-fill" style={{width: '0%'}}></div>
                          <div className="slider-thumb" style={{left: '0%'}}></div>
                        </div>
                        <input type="hidden" className="slider-value" defaultValue="1" min="1" max={dim} />
                        <div className="small text-muted mt-1">
                          Current: <span className="current-value">1</span>
                        </div>
                      </div>
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
              <div className="card mb-4" style={{maxWidth: '95vw', margin: '0 auto'}}>
                <div className="card-body p-4">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <h2 className="mb-2" style={{color: '#667eea'}}>UMDF File Viewer</h2>
                      <p className="text-muted mb-0">
                        File: {fileName} ({fileSize} bytes)
                      </p>
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-outline-primary btn-sm"
                        title="Import File"
                        style={{border: 'none', padding: '0.5rem'}}
                      >
                        <i className="fas fa-file-import fa-lg text-primary"></i>
                      </button>
                      <button
                        className="btn btn-outline-danger btn-sm"
                        title="Clear Cache"
                        onClick={clearCache}
                        style={{border: 'none', padding: '0.5rem'}}
                      >
                        <i className="fas fa-trash fa-lg text-danger"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Module Cards */}
              {modules.length > 0 ? (
                modules.map((module, index) => (
                  <div key={index} className="card mb-4" style={{maxWidth: '95vw', margin: '0 auto'}}>
                    <div className="card-body p-4">
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

                      {/* Metadata Section */}
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

                      {renderModuleData(module)}
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
        <div className="success-bar">
          <div className="container-fluid">
            <div className="alert alert-success mb-0">
              <i className="fas fa-check-circle me-2"></i>
              File imported successfully! {modules.length} module(s) found.
            </div>
          </div>
        </div>
      )}

      {/* Error Bar */}
      {showErrorBar && (
        <div className="error-bar">
          <div className="container-fluid">
            <div className="alert alert-danger mb-0">
              <i className="fas fa-exclamation-circle me-2"></i>
              {errorMessage}
            </div>
          </div>
        </div>
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="processing-overlay">
          <div className="processing-content">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <h5 className="text-primary mb-2">Processing UMDF File</h5>
            <p className="text-muted mb-0">{processingMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default UMDFViewer;

// Custom CSS for sliders
const sliderStyles = `
  .custom-slider {
    position: relative;
    width: 150px;
    height: 20px;
    margin: 10px 0;
  }

  .slider-track {
    position: relative;
    width: 100%;
    height: 8px;
    background: #e9ecef;
    border-radius: 4px;
    cursor: pointer;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
  }

  .slider-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    border-radius: 4px;
    transition: width 0.05s ease-out;
    box-shadow: inset 0 1px 2px rgba(255,255,255,0.3);
  }

  .slider-thumb {
    position: absolute;
    top: -6px;
    left: 0%;
    width: 20px;
    height: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: 3px solid #fff;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
    transition: left 0.05s ease-out, transform 0.2s ease;
  }

  .slider-thumb:hover {
    background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
    transform: scale(1.15);
    box-shadow: 0 6px 12px rgba(102, 126, 234, 0.4);
  }
`;

// Inject the styles into the document
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = sliderStyles;
  document.head.appendChild(styleSheet);
  
  // Add event handlers for custom sliders
  document.addEventListener('click', function(e) {
    if (e.target.closest('.slider-track')) {
      const slider = e.target.closest('.custom-slider');
      const track = slider.querySelector('.slider-track');
      const thumb = slider.querySelector('.slider-thumb');
      const fill = slider.querySelector('.slider-fill');
      const valueInput = slider.querySelector('.slider-value');
      
      const rect = track.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const percentage = (clickX / rect.width) * 100;
      
      // Update visual elements with precise positioning
      thumb.style.left = percentage + '%';
      fill.style.width = percentage + '%';
      
      // Calculate and update value with proper rounding
      const min = parseInt(valueInput.getAttribute('min'));
      const max = parseInt(valueInput.getAttribute('max'));
      const value = Math.round(min + (percentage / 100) * (max - min));
      valueInput.value = value;
      
      // Update the current value display
      const currentValueSpan = slider.querySelector('.current-value');
      if (currentValueSpan) {
        currentValueSpan.textContent = value;
      }
      
      // Trigger update function
      const moduleId = slider.getAttribute('data-module-id');
      const dimension = parseInt(slider.getAttribute('data-dimension'));
      console.log(`Module ${moduleId}: Dimension ${dimension} changed to ${value}`);
      
      // Call global update function if it exists
      if (window.updateSliderValueGlobal) {
        window.updateSliderValueGlobal(moduleId, dimension, value);
      }
    }
  });
  
  // Drag functionality for sliders
  document.addEventListener('mousedown', function(e) {
    if (e.target.closest('.slider-thumb')) {
      const thumb = e.target.closest('.slider-thumb');
      const slider = thumb.closest('.custom-slider');
      const track = slider.querySelector('.slider-track');
      const fill = slider.querySelector('.slider-fill');
      const valueInput = slider.querySelector('.slider-value');
      
      let isDragging = true;
      
      // Disable transitions during drag for instant response
      thumb.style.transition = 'none';
      fill.style.transition = 'none';
      
      function onMouseMove(e) {
        if (!isDragging) return;
        
        const rect = track.getBoundingClientRect();
        const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const percentage = (mouseX / rect.width) * 100;
        
        // Update visual elements with precise positioning
        thumb.style.left = percentage + '%';
        fill.style.width = percentage + '%';
        
        // Calculate and update value with proper rounding
        const min = parseInt(valueInput.getAttribute('min'));
        const max = parseInt(valueInput.getAttribute('max'));
        const value = Math.round(min + (percentage / 100) * (max - min));
        valueInput.value = value;
        
        // Update the current value display
        const currentValueSpan = slider.querySelector('.current-value');
        if (currentValueSpan) {
          currentValueSpan.textContent = value;
        }
        
        // Trigger update function
        const moduleId = slider.getAttribute('data-module-id');
        const dimension = parseInt(slider.getAttribute('data-dimension'));
        console.log(`Module ${moduleId}: Dimension ${dimension} changed to ${value}`);
        
        // Call global update function if it exists
        if (window.updateSliderValueGlobal) {
          window.updateSliderValueGlobal(moduleId, dimension, value);
        }
      }
      
      function onMouseUp() {
        isDragging = false;
        
        // Re-enable transitions after drag for smooth hover effects
        thumb.style.transition = '';
        fill.style.transition = '';
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
  });
} 