import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ProcessingModal from '../components/ProcessingModal';
import CustomSlider from '../components/CustomSlider';
import './UMDFViewer.css';

// Helper function to resolve $ref references in schemas
const resolveSchemaReference = async (refPath, baseSchemaPath) => {
  try {
    console.log('🔗 Resolving schema reference:', refPath, 'from base:', baseSchemaPath);
    
    // Handle path resolution - $ref paths should be relative to the current working directory
    let resolvedPath = refPath;
    
    // Remove any leading './' or '/' prefixes first
    if (resolvedPath.startsWith('./')) {
      resolvedPath = resolvedPath.substring(2);
    } else if (resolvedPath.startsWith('/')) {
      resolvedPath = resolvedPath.substring(1);
    }
    
    // Remove ALL instances of 'schemas/' from the path since the backend endpoint already includes it
    resolvedPath = resolvedPath.replace(/^schemas\//, ''); // Remove leading 'schemas/'
    resolvedPath = resolvedPath.replace(/\/schemas\//g, '/'); // Remove any '/schemas/' in the middle
    
    console.log('🔗 Resolved path:', resolvedPath);
    
    // Fetch the referenced schema - the backend expects paths relative to current directory
    const response = await fetch(`/schemas/${resolvedPath}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch referenced schema: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    const referencedSchema = JSON.parse(result.content);
    console.log('🔗 Successfully loaded referenced schema:', referencedSchema.title || resolvedPath);
    
    return referencedSchema;
  } catch (error) {
    console.error('❌ Error resolving schema reference:', error);
    return null;
  }
};

// Parse schema to extract form fields dynamically from actual schema files
const parseSchemaForForm = async (schemaPath) => {
  try {
    console.log('🔍 Loading schema from:', schemaPath);
    
    // Convert relative path to schema path for the backend endpoint
    const schemaPathForBackend = schemaPath.replace('./schemas/', '');
    
    console.log('🔍 Fetching schema from backend:', schemaPathForBackend);
    
    const response = await fetch(`/schemas/${schemaPathForBackend}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch schema: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('🔍 Raw response from backend:', result);
    
    const schema = JSON.parse(result.content);
    console.log('🔍 Parsed schema object:', schema);
    
    // Parse the actual schema structure to create form fields
    const formFields = {
      title: schema.title || 'Unknown Module',
      metadata: {},
      data: {}
    };
    
    console.log('🔍 Schema properties:', schema.properties);
    console.log('🔍 Schema metadata properties:', schema.properties?.metadata?.properties);
    console.log('🔍 Schema data properties:', schema.properties?.data?.properties);
    
    // Parse metadata section
    if (schema.properties && schema.properties.metadata && schema.properties.metadata.properties) {
      console.log('🔍 Processing metadata section...');
      
      // Use for...of loop to support async operations
      for (const key of Object.keys(schema.properties.metadata.properties)) {
        const field = schema.properties.metadata.properties[key];
        console.log(`🔍 Processing metadata field: ${key}`, field);
        
        if (field.$ref) {
          // Handle $ref fields - store as embedded schema reference
          console.log(`🔗 Processing $ref field: ${key} -> ${field.$ref}`);
          const referencedSchema = await resolveSchemaReference(field.$ref, schemaPath);
          
          if (referencedSchema) {
            formFields.metadata[key] = {
              type: 'embedded_schema',
              required: schema.properties.metadata.required?.includes(key) || false,
              description: field.description || `Referenced schema: ${referencedSchema.title || 'Unknown'}`,
              embeddedSchema: referencedSchema,
              refPath: field.$ref
            };
          } else {
            // Fallback if reference can't be resolved
            console.warn(`⚠️ Could not resolve $ref for field: ${key} -> ${field.$ref}`);
            formFields.metadata[key] = {
              type: 'string',
              required: schema.properties.metadata.required?.includes(key) || false,
              description: `Reference to ${field.$ref} (could not resolve)`,
              ...getFieldConstraints(field)
            };
          }
        } else if (field.type === 'object' && field.properties) {
          // Handle nested object fields
          console.log(`🔍 Processing nested object field: ${key}`);
          formFields.metadata[key] = {
            type: 'object',
            required: schema.properties.metadata.required?.includes(key) || false,
            description: field.description || '',
            properties: {}
          };
          
          // Parse nested properties
          for (const subKey of Object.keys(field.properties)) {
            const subField = field.properties[subKey];
            console.log(`🔍 Processing nested field: ${key}.${subKey}`, subField);
            
            if (subField.$ref) {
              // Handle $ref in nested properties
              console.log(`🔗 Processing nested $ref field: ${key}.${subKey} -> ${subField.$ref}`);
              const referencedSchema = await resolveSchemaReference(subField.$ref, schemaPath);
              
              if (referencedSchema) {
                // Merge the referenced schema's properties
                if (referencedSchema.properties?.metadata?.properties) {
                  formFields.metadata[key].properties[subKey] = {
                    type: 'object',
                    required: field.required?.includes(subKey) || false,
                    description: subField.description || `Referenced schema: ${referencedSchema.title || 'Unknown'}`,
                    properties: {}
                  };
                  
                  Object.keys(referencedSchema.properties.metadata.properties).forEach(refKey => {
                    const refField = referencedSchema.properties.metadata.properties[refKey];
                    formFields.metadata[key].properties[subKey].properties[refKey] = {
                      type: getFieldType(refField),
                      required: referencedSchema.properties.metadata.required?.includes(refKey) || false,
                      description: refField.description || '',
                      ...getFieldConstraints(refField)
                    };
                  });
                }
              } else {
                // Fallback
                formFields.metadata[key].properties[subKey] = {
                  type: 'string',
                  required: field.required?.includes(subKey) || false,
                  description: `Reference to ${subField.$ref} (could not resolve)`,
                  ...getFieldConstraints(subField)
                };
              }
            } else {
              formFields.metadata[key].properties[subKey] = {
                type: getFieldType(subField),
                required: field.required?.includes(subKey) || false,
                description: subField.description || '',
                ...getFieldConstraints(subField)
              };
            }
          }
        } else {
          // Handle regular fields
          formFields.metadata[key] = {
            type: getFieldType(field),
            required: schema.properties.metadata.required?.includes(key) || false,
            description: field.description || '',
            ...getFieldConstraints(field)
          };
        }
      }
    } else {
      console.log('🔍 No metadata section found or invalid structure');
    }
    
    // Parse any additional sections in metadata (like image_structure, etc.) dynamically
    if (schema.properties && schema.properties.metadata && schema.properties.metadata.properties) {
      Object.keys(schema.properties.metadata.properties).forEach(key => {
        const field = schema.properties.metadata.properties[key];
        
        // Skip fields we've already processed (like basic metadata fields)
        if (formFields.metadata[key]) return;
        
        // If it's an object with properties, it might be a special section
        if (field.type === 'object' && field.properties && Object.keys(field.properties).length > 0) {
          console.log(`🔍 Processing additional metadata section: ${key}`);
          
          // Create a dynamic section based on the field name
          const sectionName = key.replace(/_/g, ''); // Remove underscores for cleaner naming
          formFields[sectionName] = {};
          
          Object.keys(field.properties).forEach(subKey => {
            const subField = field.properties[subKey];
            console.log(`🔍 Processing ${key} field: ${subKey}`, subField);
            
            if (subField.type === 'object' && subField.properties) {
              // Handle nested object fields
              formFields[sectionName][subKey] = {
                type: 'object',
                required: field.required?.includes(subKey) || false,
                description: subField.description || '',
                properties: {}
              };
              
              // Parse nested properties
              Object.keys(subField.properties).forEach(nestedKey => {
                const nestedField = subField.properties[nestedKey];
                formFields[sectionName][subKey].properties[nestedKey] = {
                  type: getFieldType(nestedField),
                  required: subField.required?.includes(nestedKey) || false,
                  description: nestedField.description || '',
                  ...getFieldConstraints(nestedField)
                };
              });
            } else {
              // Handle regular fields
              formFields[sectionName][subKey] = {
                type: getFieldType(subField),
                required: field.required?.includes(subKey) || false,
                description: subField.description || '',
                ...getFieldConstraints(subField)
              };
            }
          });
        }
      });
    }
    
    // Parse data section
    if (schema.properties && schema.properties.data && schema.properties.data.properties) {
      console.log('🔍 Processing data section...');
      
      // Use for...of loop to support async operations
      for (const key of Object.keys(schema.properties.data.properties)) {
        const field = schema.properties.data.properties[key];
        console.log(`🔍 Processing data field: ${key}`, field);
        
        if (field.$ref) {
          // Handle $ref fields - store as embedded schema reference
          console.log(`🔗 Processing $ref field in data: ${key} -> ${field.$ref}`);
          const referencedSchema = await resolveSchemaReference(field.$ref, schemaPath);
          
          if (referencedSchema) {
            formFields.data[key] = {
              type: 'embedded_schema',
              required: schema.properties.data.required?.includes(key) || false,
              description: field.description || `Referenced schema: ${referencedSchema.title || 'Unknown'}`,
              embeddedSchema: referencedSchema,
              refPath: field.$ref
            };
          } else {
            // Fallback if reference can't be resolved
            console.warn(`⚠️ Could not resolve $ref for data field: ${key} -> ${field.$ref}`);
            formFields.data[key] = {
              type: 'string',
              required: schema.properties.data.required?.includes(key) || false,
              description: `Reference to ${field.$ref} (could not resolve)`,
              ...getFieldConstraints(field)
            };
          }
        } else if (field.type === 'object' && field.properties) {
          // Handle nested object fields
          console.log(`🔍 Processing nested object field: ${key}`);
          formFields.data[key] = {
            type: 'object',
            required: schema.properties.data.required?.includes(key) || false,
            description: field.description || '',
            properties: {}
          };
          
          // Parse nested properties
          for (const subKey of Object.keys(field.properties)) {
            const subField = field.properties[subKey];
            console.log(`🔍 Processing nested field: ${key}.${subKey}`, subField);
            
            if (subField.$ref) {
              // Handle $ref in nested properties
              console.log(`🔗 Processing nested $ref field in data: ${key}.${subKey} -> ${subField.$ref}`);
              const referencedSchema = await resolveSchemaReference(subField.$ref, schemaPath);
              
              if (referencedSchema) {
                // Merge the referenced schema's properties
                if (referencedSchema.properties?.data?.properties) {
                  formFields.data[key].properties[subKey] = {
                    type: 'object',
                    required: field.required?.includes(subKey) || false,
                    description: subField.description || `Referenced schema: ${referencedSchema.title || 'Unknown'}`,
                    properties: {}
                  };
                  
                  Object.keys(referencedSchema.properties.data.properties).forEach(refKey => {
                    const refField = referencedSchema.properties.data.properties[refKey];
                    formFields.data[key].properties[subKey].properties[refKey] = {
                      type: getFieldType(refField),
                      required: referencedSchema.properties.data.required?.includes(refKey) || false,
                      description: refField.description || '',
                      ...getFieldConstraints(refField)
                    };
                  });
                }
              } else {
                // Fallback
                formFields.data[key].properties[subKey] = {
                  type: 'string',
                  required: field.required?.includes(subKey) || false,
                  description: `Reference to ${subField.$ref} (could not resolve)`,
                  ...getFieldConstraints(subField)
                };
              }
            } else {
              formFields.data[key].properties[subKey] = {
                type: getFieldType(subField),
                required: field.required?.includes(subKey) || false,
                description: subField.description || '',
                ...getFieldConstraints(subField)
              };
            }
          }
        } else {
          // Handle regular fields
          formFields.data[key] = {
            type: getFieldType(field),
            required: schema.properties.data.required?.includes(key) || false,
            description: field.description || '',
            ...getFieldConstraints(field)
          };
        }
      }
    } else {
      console.log('🔍 No data section found or invalid structure');
    }
    
    console.log('🔍 Final parsed form fields:', formFields);
    return formFields;
    
  } catch (error) {
    console.error('❌ Error parsing schema:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return null;
  }
};

// Helper function to determine field type from schema
const getFieldType = (field) => {
  if (field.enum) return 'select';
  if (field.type === 'array') return 'array';
  if (field.type === 'object') return 'object';
  if (field.format === 'date') return 'date';
  if (field.type === 'integer' || field.type === 'number') return 'number';
  return 'string';
};

// Helper function to extract field constraints
const getFieldConstraints = (field) => {
  const constraints = {};
  
  if (field.minimum !== undefined) constraints.min = field.minimum;
  if (field.maximum !== undefined) constraints.max = field.maximum;
  if (field.minLength !== undefined) constraints.minLength = field.minLength;
  if (field.maxLength !== undefined) constraints.maxLength = field.maxLength;
  if (field.enum) constraints.options = field.enum;
  
  // Handle length constraint for strings
  if (field.length !== undefined) {
    // If length is specified, it means maximum length only
    constraints.maxLength = field.length;
  }
  
  return constraints;
};

// Add Module Modal Component
const AddModuleModal = ({ 
  show, 
  onClose, 
  encounterId, 
  availableSchemas, 
  selectedSchema, 
  onSchemaChange, 
  onConfirm,
  onSchemaConfirm,
  showForm,
  formData,
  onFormFieldChange,
  onArrayFieldChange,
  onBackToSchemaSelection,
  onFormConfirm,
  parsedSchema,
  addDataInstance,
  removeDataInstance,
  onOpenEmbeddedSchema,
  onImportDicom
}) => {
  const [showSchemaSelection, setShowSchemaSelection] = useState(false);
  const [showDicomImport, setShowDicomImport] = useState(false);
  const [selectedDicomFolder, setSelectedDicomFolder] = useState(null);
  const [dicomFileCount, setDicomFileCount] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState('');
  const [convertedData, setConvertedData] = useState(null);
  const [showConversionReview, setShowConversionReview] = useState(false);
  if (!show) return null;

  // Handle DICOM folder selection
  const handleDicomFolderSelect = (event) => {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
      const folder = files[0];
      setSelectedDicomFolder(folder);
      
      // Count DICOM files
      const dicomFiles = files.filter(file => 
        file.name.toLowerCase().endsWith('.dcm') || 
        file.type === 'application/dicom'
      );
      setDicomFileCount(dicomFiles.length);
      
      if (dicomFiles.length === 0) {
        alert('No DICOM files (.dcm) found in the selected folder.');
      }
    }
  };

  // Handle DICOM conversion start
  const handleStartDicomConversion = async () => {
    if (!selectedDicomFolder) return;
    
    setIsConverting(true);
    setConversionProgress('Reading DICOM files...');
    
    try {
      // Create FormData with folder path
      const formData = new FormData();
      
      // Hardcoded base directory for DICOM images (including Test Image folder)
      const baseDicomPath = '/Users/rob/Documents/CS/Dissertation/DICOM images/Test Image';
      
      console.log('🔍 Debug folder selection:');
      console.log('  selectedDicomFolder:', selectedDicomFolder);
      console.log('  webkitRelativePath:', selectedDicomFolder.webkitRelativePath);
      console.log('  webkitRelativePath parts:', selectedDicomFolder.webkitRelativePath.split('/'));
      
      // Extract the folder name from the webkitRelativePath
      // webkitRelativePath format: "FolderName/file1.dcm", "FolderName/file2.dcm", etc.
      const webkitPath = selectedDicomFolder.webkitRelativePath;
      const folderName = webkitPath.split('/')[0]; // Get the first part (folder name)
      
      console.log('🔍 Folder selection details:');
      console.log('  selectedDicomFolder:', selectedDicomFolder);
      console.log('  webkitRelativePath:', webkitPath);
      console.log('  extracted folderName:', folderName);
      
      // Send the folder name to be appended to the base path in the backend
      formData.append('folder_name', folderName);
      formData.append('encounter_id', encounterId);
      
      setConversionProgress('Decompressing pixel data...');
      
      // Call backend DICOM conversion endpoint
      const response = await fetch('/api/import-dicom', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      setConversionProgress('Converting to UMDF format...');
      
      const result = await response.json();
      console.log('✅ DICOM conversion result:', result);
      
      if (result.success) {
        setConvertedData(result.data);
        setShowConversionReview(true);
        setShowDicomImport(false);
      } else {
        throw new Error(result.error || 'Conversion failed');
      }
      
    } catch (error) {
      console.error('❌ DICOM conversion error:', error);
      alert(`DICOM conversion failed: ${error.message}`);
    } finally {
      setIsConverting(false);
      setConversionProgress('');
    }
  };

  // Handle writing converted DICOM data to file
  const handleWriteConvertedData = async () => {
    if (!convertedData || !encounterId) return;
    
    try {
      // Extract the first series data (assuming single series for now)
      const seriesData = convertedData.series[0];
      
      // Convert string values to proper types based on the schema
      const convertDataTypes = (metadata) => {
        const converted = { ...metadata };
        
        // Convert numeric fields that come as strings
        if (converted.exposure && typeof converted.exposure === 'string') {
          converted.exposure = parseFloat(converted.exposure);
        }
        if (converted.rescaleIntercept && typeof converted.rescaleIntercept === 'string') {
          converted.rescaleIntercept = parseFloat(converted.rescaleIntercept);
        }
        if (converted.rescaleSlope && typeof converted.rescaleSlope === 'string') {
          converted.rescaleSlope = parseFloat(converted.rescaleSlope);
        }
        if (converted.patientSize && typeof converted.patientSize === 'string') {
          converted.patientSize = parseFloat(converted.patientSize);
        }
        if (converted.patientWeight && typeof converted.patientWeight === 'string') {
          converted.patientWeight = parseFloat(converted.patientWeight);
        }
        if (converted.sliceThickness && typeof converted.sliceThickness === 'string') {
          converted.sliceThickness = parseFloat(converted.sliceThickness);
        }
        if (converted.reconstructionDiameter && typeof converted.reconstructionDiameter === 'string') {
          converted.reconstructionDiameter = parseFloat(converted.reconstructionDiameter);
        }
        if (converted.contrastBolusVolume && typeof converted.contrastBolusVolume === 'string') {
          converted.contrastBolusVolume = parseFloat(converted.contrastBolusVolume);
        }
        if (converted.contrastBolusStartTime && typeof converted.contrastBolusStartTime === 'string') {
          converted.contrastBolusStartTime = parseFloat(converted.contrastBolusStartTime);
        }
        if (converted.contrastBolusStopTime && typeof converted.contrastBolusStopTime === 'string') {
          converted.contrastBolusStopTime = parseFloat(converted.contrastBolusStopTime);
        }
        if (converted.lossyImageCompressionRatio && typeof converted.lossyImageCompressionRatio === 'string') {
          converted.lossyImageCompressionRatio = parseFloat(converted.lossyImageCompressionRatio);
        }
        
        // Convert integer fields that come as strings
        if (converted.kvp && typeof converted.kvp === 'string') {
          converted.kvp = parseInt(converted.kvp, 10);
        }
        if (converted.exposureTime && typeof converted.exposureTime === 'string') {
          converted.exposureTime = parseInt(converted.exposureTime, 10);
        }
        if (converted.xRayTubeCurrent && typeof converted.xRayTubeCurrent === 'string') {
          converted.xRayTubeCurrent = parseInt(converted.xRayTubeCurrent, 10);
        }
        
        // Convert array fields that contain string numbers
        if (converted.pixelSpacing && Array.isArray(converted.pixelSpacing)) {
          converted.pixelSpacing = converted.pixelSpacing.map(item => 
            typeof item === 'string' ? parseFloat(item) : item
          );
        }
        if (converted.windowCenter && Array.isArray(converted.windowCenter)) {
          converted.windowCenter = converted.windowCenter.map(item => 
            typeof item === 'string' ? parseFloat(item) : item
          );
        }
        if (converted.windowWidth && Array.isArray(converted.windowWidth)) {
          converted.windowWidth = converted.windowWidth.map(item => 
            typeof item === 'string' ? parseFloat(item) : item
          );
        }
        
        return converted;
      };
      
      // Convert the metadata to proper types
      const convertedMetadata = convertDataTypes(seriesData.metadata);
      
      // Debug: Log the conversion results
      console.log('🔍 Original metadata:', seriesData.metadata);
      console.log('🔍 Converted metadata:', convertedMetadata);
      console.log('🔍 exposure field type:', typeof convertedMetadata.exposure, 'value:', convertedMetadata.exposure);
      console.log('🔍 rescaleIntercept field type:', typeof convertedMetadata.rescaleIntercept, 'value:', convertedMetadata.rescaleIntercept);
      
      // Debug: Log the frame data structure
      console.log('🔍 Frame data structure:', seriesData.data);
      console.log('🔍 Number of frames:', seriesData.data.frames?.length || 0);
      if (seriesData.data.frames && seriesData.data.frames.length > 0) {
        console.log('🔍 First frame structure:', seriesData.data.frames[0]);
        console.log('🔍 First frame keys:', Object.keys(seriesData.data.frames[0]));
      }
      
      // Prepare module data for the writer
      // For image modules, the UMDF writer expects:
      // - metadata: Image-level metadata
      // - data: Vector of ModuleData objects for each frame
      const moduleData = {
        metadata: convertedMetadata,
        data: {
          frames: seriesData.data.frames.map(frame => ({
            // Frame metadata from the frame schema
            metadata: {
              imagePositionPatient: frame.metadata?.imagePositionPatient || [0, 0, 0],
              imageOrientationPatient: frame.metadata?.imageOrientationPatient || [1, 0, 0, 0, 1, 0],
              largestImagePixelValue: frame.metadata?.largestImagePixelValue || 0,
              smallestImagePixelValue: frame.metadata?.smallestImagePixelValue || 0,
              // Add any other frame-specific metadata here
            },
            // Raw pixel data
            pixelData: frame.pixelData || frame.data || []
          }))
        }
      };
      
      // Create FormData for the request
      const formData = new FormData();
      formData.append('encounter_id', encounterId);
      formData.append('schema_path', './schemas/image/CT/v1.0.json');
      formData.append('module_data', JSON.stringify(moduleData));
      
      // Send to the existing create-module endpoint
      const response = await fetch('/api/create-module', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('✅ Module creation result:', result);
      
      if (result.success) {
        // Close the review modal
        setShowConversionReview(false);
        
        // Show success message
        alert('DICOM module successfully created and added to the encounter!');
        
        // Close the main modal
        onClose();
        
        // Optionally refresh the encounter data
        // This would depend on your existing refresh mechanism
      } else {
        throw new Error(result.error || 'Module creation failed');
      }
      
    } catch (error) {
      console.error('❌ Error writing converted data:', error);
      alert(`Failed to write converted data: ${error.message}`);
    }
  };

  // Render the form if showForm is true
  if (showForm) {
    if (!parsedSchema) return null;

    return (
      <div className="modal-overlay" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1050
      }}>
        <div className="modal-content" style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '800px',
          width: '95%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}
        onWheel={(e) => {
          // Prevent scroll event from bubbling up to the background page
          e.stopPropagation();
        }}
        onScroll={(e) => {
          // Prevent scroll event from bubbling up to the background page
          e.stopPropagation();
        }}
        >
          <div className="modal-header mb-4">
            <button
              type="button"
              className="btn btn-link p-0 me-3"
              onClick={onBackToSchemaSelection}
              style={{
                color: '#667eea',
                textDecoration: 'none',
                fontSize: '1.2rem'
              }}
            >
              <i className="fas fa-arrow-left me-1"></i>
              Back
            </button>
            <h4 className="modal-title" style={{ color: '#667eea', margin: 0 }}>
              <i className="fas fa-edit me-2"></i>
              Configure {parsedSchema.title}
            </h4>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#666'
              }}
            >
              ×
            </button>
          </div>

          <div className="modal-body">
            <div className="mb-4">
              <label className="form-label fw-bold">Encounter ID:</label>
              <div className="form-control-plaintext" style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '8px 12px', 
                borderRadius: '4px',
                fontFamily: 'monospace'
              }}>
                {encounterId}
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label fw-bold">Selected Schema:</label>
              <div className="form-control-plaintext" style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '8px 12px', 
                borderRadius: '4px',
                fontFamily: 'monospace'
              }}>
                {selectedSchema}
              </div>
            </div>

            {/* Dynamic Form Fields */}
            <DynamicForm
              parsedSchema={parsedSchema}
              formData={formData}
              onFormFieldChange={onFormFieldChange}
              onArrayFieldChange={onArrayFieldChange}
              onAddDataInstance={addDataInstance}
              onRemoveDataInstance={removeDataInstance}
              onOpenEmbeddedSchema={onOpenEmbeddedSchema}
            />
          </div>

          <div className="modal-footer d-flex justify-content-between">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onBackToSchemaSelection}
              style={{
                border: '2px solid #6c757d',
                backgroundColor: 'transparent',
                color: '#6c757d',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#6c757d';
                e.target.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#6c757d';
              }}
            >
              Back to Schema Selection
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onFormConfirm}
              style={{
                border: '2px solid #667eea',
                backgroundColor: '#667eea',
                color: 'white',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#5a6fd8';
                e.target.style.borderColor = '#5a6fd8';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#667eea';
                e.target.style.borderColor = '#667eea';
              }}
            >
              <i className="fas fa-check me-2"></i>
              Create Module
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render the DICOM conversion review modal
  if (showConversionReview && convertedData) {
    return (
      <div className="modal-overlay" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1050
      }}>
        <div className="modal-content" style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '800px',
          width: '95%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}>
          <div className="modal-header mb-4">
            <h4 className="modal-title" style={{ color: '#667eea', margin: 0 }}>
              <i className="fas fa-check-circle text-success me-2"></i>
              DICOM Conversion Complete
            </h4>
            <button
              type="button"
              className="btn-close"
              onClick={() => setShowConversionReview(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#666'
              }}
            >
              ×
            </button>
          </div>

          <div className="modal-body">
            <div className="alert alert-success">
              <i className="fas fa-info-circle me-2"></i>
              <strong>Success!</strong> DICOM folder converted successfully. Review the data below before writing to file.
            </div>
            
            {/* Conversion Summary */}
            <div className="row mb-4">
              <div className="col-md-6">
                <h6>Patient Information</h6>
                <p><strong>Name:</strong> {convertedData.series?.[0]?.metadata?.patientName || 'N/A'}</p>
                <p><strong>ID:</strong> {convertedData.series?.[0]?.metadata?.patientID || 'N/A'}</p>
                <p><strong>Study:</strong> {convertedData.series?.[0]?.metadata?.studyDescription || 'N/A'}</p>
              </div>
              <div className="col-md-6">
                <h6>Image Details</h6>
                <p><strong>Modality:</strong> {convertedData.series?.[0]?.metadata?.modality || 'N/A'}</p>
                <p><strong>Series:</strong> {convertedData.series?.[0]?.metadata?.seriesDescription || 'N/A'}</p>
                <p><strong>Frames:</strong> {convertedData.series?.[0]?.data?.frames?.length || 0}</p>
              </div>
            </div>

            {/* Image Structure Summary */}
            {convertedData.series?.[0]?.metadata?.image_structure && (
              <div className="mb-4">
                <h6>Image Structure</h6>
                <div className="row">
                  <div className="col-md-3">
                    <p><strong>Dimensions:</strong> {convertedData.series[0].metadata.image_structure.dimensions?.join(' x ') || 'N/A'}</p>
                  </div>
                  <div className="col-md-3">
                    <p><strong>Channels:</strong> {convertedData.series[0].metadata.image_structure.channels || 'N/A'}</p>
                  </div>
                  <div className="col-md-3">
                    <p><strong>Bit Depth:</strong> {convertedData.series[0].metadata.image_structure.bit_depth || 'N/A'}</p>
                  </div>
                  <div className="col-md-3">
                    <p><strong>Encoding:</strong> {convertedData.series[0].metadata.image_structure.encoding || 'N/A'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Raw Data Preview */}
            <div className="mb-4">
              <h6>Data Preview</h6>
              <details>
                <summary>Click to view raw converted data</summary>
                <pre className="bg-light p-3 mt-2" style={{maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem'}}>
                  {JSON.stringify(convertedData, null, 2)}
                </pre>
              </details>
            </div>
          </div>

          <div className="modal-footer d-flex justify-content-between">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowConversionReview(false)}
              style={{
                border: '2px solid #6c757d',
                backgroundColor: 'transparent',
                color: '#6c757d',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#6c757d';
                e.target.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#6c757d';
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-success"
              onClick={handleWriteConvertedData}
              style={{
                border: '2px solid #28a745',
                backgroundColor: '#28a745',
                color: 'white',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#218838';
                e.target.style.borderColor = '#218838';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#28a745';
                e.target.style.borderColor = '#28a745';
              }}
            >
              <i className="fas fa-save me-2"></i>
              Write to File
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render the schema selection view
  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1050
    }}>
        <div className="modal-content" style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}
        onWheel={(e) => {
          // Prevent scroll event from bubbling up to the background page
          e.stopPropagation();
        }}
        onScroll={(e) => {
          // Prevent scroll event from bubbling up to the background page
          e.stopPropagation();
        }}
        >
          <div className="modal-header mb-4">
          <h4 className="modal-title" style={{ color: '#667eea', margin: 0 }}>
            <i className="fas fa-plus-circle me-2"></i>
            Add New Module
          </h4>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="mb-4">
            <label className="form-label fw-bold">Encounter ID:</label>
            <div className="form-control-plaintext" style={{ 
              backgroundColor: '#f8f9fa', 
              padding: '8px 12px', 
              borderRadius: '4px',
              fontFamily: 'monospace'
            }}>
              {encounterId}
            </div>
          </div>

          <div className="mb-4">
                        <label className="form-label fw-bold">
              Choose Module Creation Method:
            </label>
            
            <div className="d-flex gap-3 justify-content-center">
              <button
                type="button"
                className="btn btn-success btn-lg"
                onClick={() => setShowDicomImport(true)}
                style={{ minWidth: '150px' }}
              >
                <i className="fas fa-file-medical me-2"></i>
                Import DICOM
              </button>
              
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => setShowSchemaSelection(true)}
                style={{ minWidth: '150px' }}
              >
                <i className="fas fa-edit me-2"></i>
                From Schema
              </button>
            </div>
            

            {/* DICOM Import Section */}
            {showDicomImport && (
              <div className="mt-4">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <label className="form-label fw-bold">
                    Select DICOM Folder:
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setShowDicomImport(false)}
                  >
                    <i className="fas fa-times me-1"></i>
                    Hide
                  </button>
                </div>
                
                <div className="mb-3">
                  <input
                    type="file"
                    className="form-control"
                    webkitdirectory=""
                    directory=""
                    onChange={handleDicomFolderSelect}
                    accept=".dcm"
                    style={{ border: '2px solid #dee2e6' }}
                  />
                  <small className="text-muted">
                    Select a folder containing DICOM files (.dcm). 
                    The folder will be imported from: <code>/Users/rob/Documents/CS/Dissertation/DICOM images/Test Image/</code>
                  </small>
                </div>

                {selectedDicomFolder && (
                  <div className="alert alert-info">
                    <i className="fas fa-folder-open me-2"></i>
                    <strong>Selected Folder:</strong> {selectedDicomFolder.name}
                    <br />
                    <small>Files: {dicomFileCount} DICOM files detected</small>
                  </div>
                )}

                {selectedDicomFolder && (
                  <>
                    {isConverting && (
                      <div className="mb-3">
                        <div className="progress" style={{ height: '25px' }}>
                          <div 
                            className="progress-bar progress-bar-striped progress-bar-animated bg-success" 
                            role="progressbar" 
                            style={{ width: '100%' }}
                          >
                            {conversionProgress}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <button
                      type="button"
                      className="btn btn-success w-100"
                      onClick={handleStartDicomConversion}
                      disabled={isConverting}
                    >
                      {isConverting ? (
                        <>
                          <i className="fas fa-spinner fa-spin me-2"></i>
                          Converting...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-play me-2"></i>
                          Start Conversion
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Schema Selection (Hidden by default) */}
            {showSchemaSelection && (
              <div className="mt-4">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <label htmlFor="schemaSelect" className="form-label fw-bold">
                    Select Schema: <span className="text-danger">*</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setShowSchemaSelection(false)}
                  >
                    <i className="fas fa-times me-1"></i>
                    Hide
                  </button>
                  </div>
                <select
                  id="schemaSelect"
                  className="form-select"
                  value={selectedSchema}
                  onChange={(e) => onSchemaChange(e.target.value)}
                  style={{ border: '2px solid #dee2e6' }}
                >
                  <option value="">Choose a schema...</option>
                  {availableSchemas.map((schema, index) => (
                    <option key={index} value={schema.path}>
                      {schema.title} - {schema.description}
                    </option>
                  ))}
                </select>
                {availableSchemas.length === 0 && (
                  <div className="text-muted small mt-2">
                    <i className="fas fa-info-circle me-1"></i>
                    No schemas available. Please check your schema configuration.
                  </div>
                )}
              </div>
            )}
          </div>

          {showSchemaSelection && (
            <div className="mb-4">
              <div className="alert alert-info">
                <i className="fas fa-info-circle me-2"></i>
                <strong>Note:</strong> This will create a module in the selected encounter. 
                The module will be initialized with the chosen schema structure.
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer d-flex justify-content-between">
          {showSchemaSelection && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{
                  border: '2px solid #6c757d',
                  backgroundColor: 'transparent',
                  color: '#6c757d',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#6c757d';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.color = '#6c757d';
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onSchemaConfirm}
                disabled={!selectedSchema}
                style={{
                  border: '2px solid #667eea',
                  backgroundColor: selectedSchema ? '#667eea' : 'transparent',
                  color: selectedSchema ? 'white' : '#667eea',
                  transition: 'all 0.3s ease',
                  opacity: selectedSchema ? 1 : 0.6
                }}
                onMouseEnter={(e) => {
                  if (selectedSchema) {
                    e.target.style.backgroundColor = '#5a6fd8';
                    e.target.style.borderColor = '#5a6fd8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedSchema) {
                    e.target.style.backgroundColor = '#667eea';
                    e.target.style.borderColor = '#667eea';
                  }
                }}
              >
                <i className="fas fa-arrow-right me-2"></i>
                Next: Configure Module
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Embedded Schema Form Component
const EmbeddedSchemaForm = ({ schema, data, onDataChange, fieldPath }) => {
  const [localData, setLocalData] = useState(data || {});
  
  // Handle field changes
  const handleFieldChange = (section, fieldName, value, parentFieldName = null) => {
    const newData = { ...localData };
    
    if (parentFieldName) {
      if (!newData[parentFieldName]) {
        newData[parentFieldName] = {};
      }
      newData[parentFieldName][fieldName] = value;
    } else {
      newData[fieldName] = value;
    }
    
    setLocalData(newData);
    onDataChange(newData);
  };
  
  // Render a field based on its type
  const renderEmbeddedField = (section, fieldName, fieldConfig, value, parentFieldName = null) => {
    const fieldId = `embedded_${section}_${fieldName}`;
    const isRequired = fieldConfig.required !== false;
    
    if (fieldConfig.type === 'select') {
      return (
        <div className="mb-3" key={fieldId}>
          <label htmlFor={fieldId} className="form-label fw-bold">
            {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            {isRequired && <span className="text-danger ms-1">*</span>}
          </label>
          <select
            id={fieldId}
            className="form-control"
            value={value || ''}
            onChange={(e) => handleFieldChange(section, fieldName, e.target.value, parentFieldName)}
          >
            <option value="">Select...</option>
            {fieldConfig.options.map((option, index) => (
              <option key={index} value={option}>{option}</option>
            ))}
          </select>
          {fieldConfig.description && (
            <div className="form-text text-muted">
              <i className="fas fa-info-circle me-1"></i>
              {fieldConfig.description}
            </div>
          )}
        </div>
      );
    }
    
    if (fieldConfig.type === 'number') {
      return (
        <div className="mb-3" key={fieldId}>
          <label htmlFor={fieldId} className="form-label fw-bold">
            {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            {isRequired && <span className="text-danger ms-1">*</span>}
          </label>
          <input
            type="number"
            id={fieldId}
            className="form-control"
            value={value || ''}
            onChange={(e) => handleFieldChange(section, fieldName, e.target.value, parentFieldName)}
            {...(fieldConfig.min !== undefined && { min: fieldConfig.min })}
            {...(fieldConfig.max !== undefined && { max: fieldConfig.max })}
          />
          {fieldConfig.description && (
            <div className="form-text text-muted">
              <i className="fas fa-info-circle me-1"></i>
              {fieldConfig.description}
            </div>
          )}
        </div>
      );
    }
    
    if (fieldConfig.type === 'date') {
      return (
        <div className="mb-3" key={fieldId}>
          <label htmlFor={fieldId} className="form-label fw-bold">
            {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            {isRequired && <span className="text-danger ms-1">*</span>}
          </label>
          <input
            type="date"
            id={fieldId}
            className="form-control"
            value={value || ''}
            onChange={(e) => handleFieldChange(section, fieldName, e.target.value, parentFieldName)}
          />
          {fieldConfig.description && (
            <div className="form-text text-muted">
              <i className="fas fa-info-circle me-1"></i>
              {fieldConfig.description}
            </div>
          )}
        </div>
      );
    }
    
    if (fieldConfig.type === 'object' && fieldConfig.properties) {
      return (
        <div className="mb-3" key={fieldId}>
          <label className="form-label fw-bold">
            {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            {isRequired && <span className="text-danger ms-1">*</span>}
          </label>
          <div className="border rounded p-3">
            {Object.keys(fieldConfig.properties).map((subFieldName) => {
              const subFieldConfig = fieldConfig.properties[subFieldName];
              const subValue = value && value[subFieldName];
              return renderEmbeddedField(section, subFieldName, subFieldConfig, subValue, fieldName);
            })}
          </div>
          {fieldConfig.description && (
            <div className="form-text text-muted">
              <i className="fas fa-info-circle me-1"></i>
              {fieldConfig.description}
            </div>
          )}
        </div>
      );
    }
    
    // Default string input
    return (
      <div className="mb-3" key={fieldId}>
        <label htmlFor={fieldId} className="form-label fw-bold">
          {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
          {isRequired && <span className="text-danger ms-1">*</span>}
        </label>
        <input
          type="text"
          id={fieldId}
          className="form-control"
          value={value || ''}
          onChange={(e) => handleFieldChange(section, fieldName, e.target.value, parentFieldName)}
          {...(fieldConfig.minLength !== undefined && { minLength: fieldConfig.minLength })}
          {...(fieldConfig.maxLength !== undefined && { maxLength: fieldConfig.maxLength })}
        />
        {fieldConfig.description && (
          <div className="form-text text-muted">
            <i className="fas fa-info-circle me-1"></i>
            {fieldConfig.description}
          </div>
        )}
      </div>
    );
  };
  
  // Parse the embedded schema to create form fields
  const parseEmbeddedSchema = (schema) => {
    const formFields = {
      metadata: {},
      data: {}
    };
    
    // Parse metadata section
    if (schema.properties?.metadata?.properties) {
      Object.keys(schema.properties.metadata.properties).forEach(key => {
        const field = schema.properties.metadata.properties[key];
        formFields.metadata[key] = {
          type: getFieldType(field),
          required: schema.properties.metadata.required?.includes(key) || false,
          description: field.description || '',
          ...getFieldConstraints(field)
        };
      });
    }
    
    // Parse data section
    if (schema.properties?.data?.properties) {
      Object.keys(schema.properties.data.properties).forEach(key => {
        const field = schema.properties.data.properties[key];
        formFields.data[key] = {
          type: getFieldType(field),
          required: schema.properties.data.required?.includes(key) || false,
          description: field.description || '',
          ...getFieldConstraints(field)
        };
      });
    }
    
    return formFields;
  };
  
  const parsedEmbeddedSchema = parseEmbeddedSchema(schema);
  
  return (
    <div>
      <h6 className="text-primary mb-3">
        <i className="fas fa-schema me-2"></i>
        {schema.title || 'Embedded Schema'} Configuration
      </h6>
      
      {/* Metadata Section */}
      {Object.keys(parsedEmbeddedSchema.metadata).length > 0 && (
        <div className="mb-4">
          <h6 className="text-secondary mb-3">
            <i className="fas fa-tags me-2"></i>
            Metadata
          </h6>
          {Object.keys(parsedEmbeddedSchema.metadata).map((fieldName) => {
            const fieldConfig = parsedEmbeddedSchema.metadata[fieldName];
            const value = localData.metadata && localData.metadata[fieldName];
            return renderEmbeddedField('metadata', fieldName, fieldConfig, value);
          })}
        </div>
      )}
      
      {/* Data Section */}
      {Object.keys(parsedEmbeddedSchema.data).length > 0 && (
        <div className="mb-4">
          <h6 className="text-secondary mb-3">
            <i className="fas fa-database me-2"></i>
            Data
          </h6>
          {Object.keys(parsedEmbeddedSchema.data).map((fieldName) => {
            const fieldConfig = parsedEmbeddedSchema.data[fieldName];
            const value = localData.data && localData.data[fieldName];
            return renderEmbeddedField('data', fieldName, fieldConfig, value);
          })}
        </div>
      )}
      
      {Object.keys(parsedEmbeddedSchema.metadata).length === 0 && Object.keys(parsedEmbeddedSchema.data).length === 0 && (
        <div className="text-center text-muted py-4">
          <i className="fas fa-info-circle me-2"></i>
          No configurable fields found in this schema
        </div>
      )}
    </div>
  );
};

// Dynamic Form Component
const DynamicForm = ({ 
  parsedSchema, 
  formData, 
  onFormFieldChange, 
  onArrayFieldChange, 
  onAddDataInstance, 
  onRemoveDataInstance,
  onOpenEmbeddedSchema 
}) => {
  const renderField = (section, fieldName, fieldConfig, value, parentFieldName = null, dataIndex = null) => {
    // Create unique ID by including dataIndex if it exists
    const fieldId = dataIndex !== null ? `${section}_${fieldName}_${dataIndex}` : `${section}_${fieldName}`;
    const isRequired = fieldConfig.required !== false; // Default to required unless explicitly false
    
    if (fieldConfig.type === 'select') {
      return (
        <div className="mb-3" key={fieldId}>
          <label htmlFor={fieldId} className="form-label fw-bold">
            {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            {isRequired && <span className="text-danger ms-1">*</span>}
          </label>
          <select
            id={fieldId}
            className="form-select"
            value={value || ''}
            onChange={(e) => onFormFieldChange(section, parentFieldName || fieldName, e.target.value, parentFieldName ? fieldName : null, dataIndex)}
            style={{ border: '2px solid #dee2e6' }}
          >
            <option value="">Select...</option>
            {fieldConfig.options.map((option, index) => (
              <option key={index} value={option}>{option}</option>
            ))}
          </select>
          {fieldConfig.description && (
            <div className="form-text text-muted">
              <i className="fas fa-info-circle me-1"></i>
              {fieldConfig.description}
            </div>
          )}
        </div>
      );
    }
    
    if (fieldConfig.type === 'number') {
      return (
        <div className="mb-3" key={fieldId}>
          <label htmlFor={fieldId} className="form-label fw-bold">
            {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            {isRequired && <span className="text-danger ms-1">*</span>}
          </label>
          <input
            type="number"
            id={fieldId}
            className="form-control"
            value={value || ''}
            onChange={(e) => onFormFieldChange(section, parentFieldName || fieldName, e.target.value, parentFieldName ? fieldName : null, dataIndex)}
            {...(fieldConfig.min !== undefined && { min: fieldConfig.min })}
            {...(fieldConfig.max !== undefined && { max: fieldConfig.max })}
            style={{ border: '2px solid #dee2e6' }}
          />
          {fieldConfig.description && (
            <div className="form-text text-muted">
              <i className="fas fa-info-circle me-1"></i>
              {fieldConfig.description}
            </div>
          )}
        </div>
      );
    }
    
    if (fieldConfig.type === 'date') {
      return (
        <div className="mb-3" key={fieldId}>
          <label htmlFor={fieldId} className="form-label fw-bold">
            {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            {isRequired && <span className="text-danger ms-1">*</span>}
          </label>
          <input
            type="date"
            id={fieldId}
            className="form-control"
            value={value || ''}
            onChange={(e) => onFormFieldChange(section, parentFieldName || fieldName, e.target.value, parentFieldName ? fieldName : null, dataIndex)}
            style={{ border: '2px solid #dee2e6' }}
          />
          {fieldConfig.description && (
            <div className="form-text text-muted">
              <i className="fas fa-info-circle me-1"></i>
              {fieldConfig.description}
            </div>
          )}
        </div>
      );
    }
    
    if (fieldConfig.type === 'array') {
      return (
        <div className="mb-3" key={fieldId}>
          <label className="form-label fw-bold">
            {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            {isRequired && <span className="text-danger ms-1">*</span>}
          </label>
          <div className="border rounded p-3" style={{ border: '2px solid #dee2e6' }}>
            {Array.isArray(value) && value.map((item, index) => (
              <div key={index} className="d-flex align-items-center mb-2">
                <input
                  type="text"
                  className="form-control me-2"
                  value={item || ''}
                  onChange={(e) => onArrayFieldChange(section, parentFieldName || fieldName, index, e.target.value, parentFieldName ? fieldName : null, dataIndex)}
                  placeholder={`${fieldName} ${index + 1}`}
                />
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => {
                    const newArray = [...value];
                    newArray.splice(index, 1);
                    onArrayFieldChange(section, parentFieldName || fieldName, index, newArray, parentFieldName ? fieldName : null, dataIndex);
                  }}
                >
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => {
                const newArray = [...(value || []), ''];
                onArrayFieldChange(section, parentFieldName || fieldName, (value || []).length, newArray, parentFieldName ? fieldName : null, dataIndex);
              }}
            >
              <i className="fas fa-plus me-1"></i>Add {fieldName}
            </button>
          </div>
          {fieldConfig.description && (
            <div className="form-text text-muted">
              <i className="fas fa-info-circle me-1"></i>
              {fieldConfig.description}
            </div>
          )}
        </div>
      );
    }
    
    if (fieldConfig.type === 'object' && fieldConfig.properties) {
      return (
        <div className="mb-3" key={fieldId}>
          <label className="form-label fw-bold">
            {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            {isRequired && <span className="text-danger ms-1">*</span>}
          </label>
          <div className="border rounded p-3" style={{ border: '2px solid #dee2e6' }}>
            {Object.keys(fieldConfig.properties).map((subFieldName) => {
              const subFieldConfig = fieldConfig.properties[subFieldName];
              const subValue = value && value[subFieldName];
              return renderField(section, subFieldName, subFieldConfig, subValue, fieldName, dataIndex);
            })}
          </div>
          {fieldConfig.description && (
            <div className="form-text text-muted">
              <i className="fas fa-info-circle me-1"></i>
              {fieldConfig.description}
            </div>
          )}
        </div>
      );
    }
    
    if (fieldConfig.type === 'embedded_schema') {
      return (
        <div className="mb-3" key={fieldId}>
          <label className="form-label fw-bold">
            {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            {isRequired && <span className="text-danger ms-1">*</span>}
          </label>
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => {
              // Open modal with embedded schema form
              console.log('🔗 Opening embedded schema:', fieldConfig.embeddedSchema.title);
              onOpenEmbeddedSchema(fieldConfig.embeddedSchema, parentFieldName ? `${parentFieldName}.${fieldName}` : fieldName, value || {});
            }}
            style={{ border: '2px solid #dee2e6' }}
          >
            <i className="fas fa-external-link-alt me-2"></i>
            Configure {fieldConfig.embeddedSchema.title || fieldName}
          </button>
          {fieldConfig.description && (
            <div className="form-text text-muted">
              <i className="fas fa-info-circle me-1"></i>
              {fieldConfig.description}
            </div>
          )}
        </div>
      );
    }
    
    // Default string input
    return (
      <div className="mb-3" key={fieldId}>
        <label htmlFor={fieldId} className="form-label fw-bold">
          {fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
          {isRequired && <span className="text-danger ms-1">*</span>}
        </label>
        <input
          type="text"
          id={fieldId}
          className="form-control"
          value={value || ''}
          onChange={(e) => onFormFieldChange(section, parentFieldName || fieldName, e.target.value, parentFieldName ? fieldName : null, dataIndex)}
          {...(fieldConfig.minLength !== undefined && { minLength: fieldConfig.minLength })}
          {...(fieldConfig.maxLength !== undefined && { maxLength: fieldConfig.maxLength })}
          style={{ border: '2px solid #dee2e6' }}
        />
        {fieldConfig.description && (
          <div className="form-text text-muted">
            <i className="fas fa-info-circle me-1"></i>
            {fieldConfig.description}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dynamic-form">
      {/* Metadata Section */}
      {parsedSchema.metadata && (
        <div className="mb-4">
          <h5 className="text-primary mb-3">
            <i className="fas fa-info-circle me-2"></i>
            Metadata
          </h5>
          {Object.keys(parsedSchema.metadata).map((fieldName) => {
            const fieldConfig = parsedSchema.metadata[fieldName];
            const value = formData.metadata && formData.metadata[fieldName];
            return renderField('metadata', fieldName, fieldConfig, value);
          })}
        </div>
      )}

      {/* Data Section */}
      {parsedSchema.data && (
        <div className="mb-4">
          <h5 className="text-success mb-3">
            <i className="fas fa-database me-2"></i>
            Data
          </h5>
          {formData.data.map((dataInstance, dataIndex) => (
            <div key={dataIndex} className="border rounded p-3 mb-3" style={{ border: '2px solid #28a745' }}>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="text-success mb-0">Data Instance {dataIndex + 1}</h6>
                {formData.data.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => onRemoveDataInstance(dataIndex)}
                    style={{
                      border: '2px solid #dc3545',
                      backgroundColor: 'transparent',
                      color: '#dc3545'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#dc3545';
                      e.target.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = 'transparent';
                      e.target.style.color = '#dc3545';
                    }}
                  >
                    <i className="fas fa-trash me-1"></i>Remove
                  </button>
                )}
              </div>
              {Object.keys(parsedSchema.data).map((fieldName) => {
                const fieldConfig = parsedSchema.data[fieldName];
                const value = dataInstance && dataInstance[fieldName];
                return renderField('data', fieldName, fieldConfig, value, null, dataIndex);
              })}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline-success btn-sm"
            onClick={onAddDataInstance}
            style={{
              border: '2px solid #28a745',
              backgroundColor: 'transparent',
              color: '#28a745'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#28a745';
              e.target.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = '#28a745';
            }}
          >
            <i className="fas fa-plus me-1"></i>Add Another
          </button>
        </div>
      )}

      {/* Dynamic Sections (not metadata or data) */}
      {Object.keys(parsedSchema).map((sectionName) => {
        if (sectionName === 'metadata' || sectionName === 'data') return null;
        
        const section = parsedSchema[sectionName];
        if (!section || typeof section !== 'object') return null;
        
        // Generate dynamic title and icon based on section name
        const title = sectionName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const iconMap = {
          'imagestructure': 'fas fa-image',
          'patientinfo': 'fas fa-user',
          'clinicaldata': 'fas fa-stethoscope'
        };
        const icon = iconMap[sectionName.toLowerCase()] || 'fas fa-cog';
        const colorMap = {
          'imagestructure': 'text-info',
          'patientinfo': 'text-warning',
          'clinicaldata': 'text-danger'
        };
        const color = colorMap[sectionName.toLowerCase()] || 'text-secondary';
        
        return (
          <div key={sectionName} className="mb-4">
            <h5 className={`${color} mb-3`}>
              <i className={`${icon} me-2`}></i>
              {title}
            </h5>
            {Object.keys(section).map((fieldName) => {
              const fieldConfig = section[fieldName];
              const value = formData[sectionName] && formData[sectionName][fieldName];
              return renderField(sectionName, fieldName, fieldConfig, value);
            })}
          </div>
        );
      })}
    </div>
  );
};

const UMDFViewer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [modules, setModules] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [moduleGraph, setModuleGraph] = useState({});
  const [showSuccessBar, setShowSuccessBar] = useState(false);
  const [showErrorBar, setShowErrorBar] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [sliderValues, setSliderValues] = useState({}); // Track slider values for each module
  const [selectedVariantModules, setSelectedVariantModules] = useState({}); // Track which variant module is selected for each base module

  const [fileInputRef] = useState(React.createRef()); // Track which image module is currently displayed
  const [isEditMode, setIsEditMode] = useState(false); // Track whether we're in edit mode
  const [encounterCollapsed, setEncounterCollapsed] = useState({}); // Track which encounters are collapsed
  const [showAddModuleModal, setShowAddModuleModal] = useState(false); // Control add module modal visibility
  const [selectedEncounterId, setSelectedEncounterId] = useState(null); // Track which encounter we're adding to
  const [selectedSchema, setSelectedSchema] = useState(''); // Track selected schema for new module
  const [availableSchemas, setAvailableSchemas] = useState([]); // Available schemas to choose from
  const [formData, setFormData] = useState({}); // Store form data for the new module
  const [showForm, setShowForm] = useState(false); // Control whether to show schema selection or form
  const [parsedSchema, setParsedSchema] = useState(null); // Store the parsed schema for the form
  
  // Embedded schema modal state
  const [showEmbeddedSchemaModal, setShowEmbeddedSchemaModal] = useState(false);
  const [embeddedSchemaData, setEmbeddedSchemaData] = useState({});
  const [currentEmbeddedSchema, setCurrentEmbeddedSchema] = useState(null);
  const [currentEmbeddedFieldPath, setCurrentEmbeddedFieldPath] = useState(null);
  
  // Use refs to prevent double execution of add/remove functions
  const addDataInstanceRef = useRef(false);
  const removeDataInstanceRef = useRef(false);

  // Set up global function for slider updates
  useEffect(() => {
    window.updateSliderValueGlobal = updateSliderValue;
    
    return () => {
      delete window.updateSliderValueGlobal;
    };
  }, []);

  // Monitor formData changes for debugging
  useEffect(() => {
    console.log('📊 formData changed:', formData);
  }, [formData]);
  
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
      
      if (fileReady === 'true') {
        // Check if file was passed via navigation state
        const file = location.state?.file;
        
        if (file) {
          // File was passed via navigation state
          console.log('📁 Processing file from navigation state:', file.name);
          
          // Clear any old module metadata when processing a new file
          sessionStorage.removeItem('umdf_modules_metadata');
          
          setIsProcessing(true);
          setProcessingMessage('Processing UMDF file...');
          
          try {
            // Get password from session storage (same one used from home page)
            const storedPassword = sessionStorage.getItem('umdf_password');
            console.log('🔄 Retrieved password from sessionStorage:', storedPassword ? 'Password found' : 'No password');
            
            // Process the file using the reusable function
            await processFileData(file, storedPassword);
            
          } catch (error) {
            console.error('Error processing file from navigation state:', error);
            setProcessingMessage('Error processing file. Please try again.');
            setIsProcessing(false);
          }
        } else {
          console.log('❌ No file found in navigation state');
          setProcessingMessage('No file to process. Please select a file from the home page.');
          setIsProcessing(false);
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
  }, [location]);

  // Check authentication status periodically
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/check-auth');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.authenticated) {
          console.log('🔒 Authentication lost - redirecting to home page');
          // Clear session storage
          sessionStorage.clear();
          // Redirect to home page
          window.location.href = '/';
        }
      } catch (error) {
        console.error('❌ Error checking authentication:', error);
        // If we can't reach the backend, assume authentication is lost
        console.log('🔒 Cannot reach backend - redirecting to home page');
        sessionStorage.clear();
        window.location.href = '/';
      }
    };

    // Check auth immediately
    checkAuth();
    
    // Check auth every 30 seconds
    const authInterval = setInterval(checkAuth, 30000);
    
    return () => clearInterval(authInterval);
  }, []);

  // Clear cache function
  const clearCache = () => {
    sessionStorage.removeItem('umdf_modules_metadata');
    sessionStorage.removeItem('umdf_file_name');
    sessionStorage.removeItem('umdf_file_size');
    sessionStorage.removeItem('umdf_file_last_modified');
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
    // Check if this module has a selected variant module
    const selectedVariantId = selectedVariantModules[module.id];
    const currentModule = selectedVariantId ? modules.find(m => m.id === selectedVariantId) : module;
    
    if (!currentModule) {
      console.log('No current module found for base module:', module.id);
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
    // Check if we have meaningful extra dimensions (greater than 1)
    const hasExtraDimensions = numDimensions > 2 && dimensions.slice(2).some(dim => dim > 1);
    
    // Calculate number of frames: if only 2 dimensions (width, height), then 1 frame
    // Otherwise, multiply all dimensions after the first 2 (width, height)
    const numFrames = hasExtraDimensions ? dimensions.slice(2).reduce((acc, dim) => acc * dim, 1) : 1;
    
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
          {/* Variant Image Module Buttons */}
          {moduleNode && moduleNode.variant && moduleNode.variant.length > 0 && (() => {
            const variantImageModules = moduleNode.variant
              .map(variant => modules.find(m => m.id === variant.id))
              .filter(variantModule => variantModule && variantModule.type === 'image');
            
            if (variantImageModules.length === 0) return null;
            
            return (
              <div className="col-md-3">
                <div className="variant-modules-sidebar" style={{
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
                            setSelectedVariantModules(prev => ({...prev, [module.id]: null}));
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
                          backgroundColor: !selectedVariantModules[module.id] ? '#667eea' : 'transparent',
                          color: !selectedVariantModules[module.id] ? 'white' : '#667eea',
                          border: '1px solid #667eea'
                        }}
                    >
                      <i className="fas fa-image me-1"></i>
                      {module.name || module.type} (Original)
                    </button>
                    
                    {/* Variant Image Module Buttons */}
                    {variantImageModules.map((variantModule, idx) => (
                      <button
                        key={idx}
                        className="btn btn-sm w-100"
                        onClick={async () => {
                          try {
                            // Load the variant module's data first if it hasn't been loaded
                            if (!variantModule.data || Object.keys(variantModule.data).length === 0) {
                              console.log('Loading data for variant module:', variantModule.id);
                              await loadModule(variantModule.id);
                            }
                            
                            // Switch to the variant image module for this specific base module
                            setSelectedVariantModules(prev => ({...prev, [module.id]: variantModule.id}));
                            console.log('Switched to variant image module:', variantModule.id, 'for base module:', module.id);
                          } catch (error) {
                            console.error('Error switching to variant module:', error);
                          }
                        }}
                        title={`Switch to ${variantModule.name || variantModule.type} Module`}
                        style={{
                          fontSize: '0.8rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          height: '38px',
                          backgroundColor: selectedVariantModules[module.id] === variantModule.id ? '#667eea' : 'transparent',
                          color: selectedVariantModules[module.id] === variantModule.id ? 'white' : '#667eea',
                          border: '1px solid #667eea'
                        }}
                      >
                        <i className="fas fa-image me-1"></i>
                        {variantModule.name || variantModule.type}
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
                
                if (hasExtraDimensions) {
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
                      console.log('🔍 Hex string conversion - Length:', hexString.length);
                      console.log('🔍 Hex string conversion - First 100 chars:', hexString.substring(0, 100));
                      console.log('🔍 Hex string conversion - Last 100 chars:', hexString.substring(hexString.length - 100));
                      
                      const bytes = new Uint8Array(hexString.length / 2);
                      console.log('🔍 Hex string conversion - Expected bytes:', hexString.length / 2);
                      console.log('🔍 Hex string conversion - Data size from frame:', currentFrame.data_size);
                      
                      for (let i = 0; i < hexString.length; i += 2) {
                        const hexByte = hexString.substr(i, 2);
                        const byteValue = parseInt(hexByte, 16);
                        bytes[i / 2] = byteValue;
                        
                        // Debug first few conversions
                        if (i < 20) {
                          console.log(`🔍 Hex conversion ${i/2}: "${hexByte}" → ${byteValue}`);
                        }
                      }
                      pixelData = bytes;
                      console.log('🔍 Hex string conversion - First 10 bytes:', Array.from(bytes.slice(0, 10)));
                      console.log('🔍 Hex string conversion - Last 10 bytes:', Array.from(bytes.slice(-10)));
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
                
                // Check for HU conversion parameters in image metadata
                let rescaleType = null;
                let rescaleSlope = 1.0;
                let rescaleIntercept = 0.0;
                let needsHUConversion = false;
                
                // Get windowing parameters for proper CT display
                let windowCenter = 0;
                let windowWidth = 255;
                let photometricInterpretation = "MONOCHROME2"; // Default to normal scaling
                
                // Parse image metadata for windowing parameters
                if (currentModule.metadata && typeof currentModule.metadata === 'object' && !Array.isArray(currentModule.metadata)) {
                  if (currentModule.metadata.content && Array.isArray(currentModule.metadata.content) && currentModule.metadata.content.length > 0) {
                    const moduleMetadata = currentModule.metadata.content[0];
                    // Handle arrays - take first value for single-frame images
                    windowCenter = Array.isArray(moduleMetadata.windowCenter) ? moduleMetadata.windowCenter[0] : (moduleMetadata.windowCenter || 0);
                    windowWidth = Array.isArray(moduleMetadata.windowWidth) ? moduleMetadata.windowWidth[0] : (moduleMetadata.windowWidth || 255);
                    photometricInterpretation = moduleMetadata.photometricInterpretation || "MONOCHROME2";
                  } else if (currentModule.metadata.windowCenter !== undefined) {
                    // Handle arrays - take first value for single-frame images
                    windowCenter = Array.isArray(currentModule.metadata.windowCenter) ? currentModule.metadata.windowCenter[0] : currentModule.metadata.windowCenter;
                    windowWidth = Array.isArray(currentModule.metadata.windowWidth) ? currentModule.metadata.windowWidth[0] : (currentModule.metadata.windowWidth || 255);
                    photometricInterpretation = currentModule.metadata.photometricInterpretation || "MONOCHROME2";
                  }
                }
                
                console.log('🔬 Windowing: WC =', windowCenter, 'WW =', windowWidth, 'Photometric =', photometricInterpretation);
                console.log('🔬 Windowing: Raw WC =', currentModule.metadata?.content?.[0]?.windowCenter, 'Raw WW =', currentModule.metadata?.content?.[0]?.windowWidth);
                
                // Get bit depth from image_structure for proper data handling
                let bitDepth = 8; // Default to 8-bit
                if (currentModule.metadata && typeof currentModule.metadata === 'object' && !Array.isArray(currentModule.metadata)) {
                  if (currentModule.metadata.content && Array.isArray(currentModule.metadata.content) && currentModule.metadata.content.length > 0) {
                    const moduleMetadata = currentModule.metadata.content[0];
                    if (moduleMetadata.image_structure && moduleMetadata.image_structure.bit_depth) {
                      bitDepth = moduleMetadata.image_structure.bit_depth;
                    }
                  } else if (currentModule.metadata.image_structure && currentModule.metadata.image_structure.bit_depth) {
                    bitDepth = currentModule.metadata.image_structure.bit_depth;
                  }
                }
                
                console.log('🔬 Bit Depth: Detected', bitDepth, 'bit data');
                
                // Parse image metadata for rescale parameters
                if (currentModule.metadata && typeof currentModule.metadata === 'object' && !Array.isArray(currentModule.metadata)) {
                  if (currentModule.metadata.content && Array.isArray(currentModule.metadata.content) && currentModule.metadata.content.length > 0) {
                    const moduleMetadata = currentModule.metadata.content[0];
                    rescaleType = moduleMetadata.rescaleType;
                    rescaleSlope = moduleMetadata.rescaleSlope || 1.0;
                    rescaleIntercept = moduleMetadata.rescaleIntercept || 0.0;
                  } else if (currentModule.metadata.rescaleType) {
                    rescaleType = currentModule.metadata.rescaleType;
                    rescaleSlope = currentModule.metadata.rescaleSlope || 1.0;
                    rescaleIntercept = currentModule.metadata.rescaleIntercept || 0.0;
                  }
                }
                
                // Check if we need HU conversion
                if (rescaleType === "HU") {
                  needsHUConversion = true;
                  console.log('🔬 HU Conversion: rescaleType = "HU", applying HU conversion');
                  console.log('🔬 HU Conversion: rescaleSlope =', rescaleSlope, 'rescaleIntercept =', rescaleIntercept);
                  console.log('🔬 HU Conversion: Formula: HU = (PixelValue ×', rescaleSlope, ') +', rescaleIntercept);
                } else {
                  console.log('🔬 HU Conversion: rescaleType =', rescaleType, '- no HU conversion needed');
                }
                
                // Function to apply DICOM windowing for proper CT display
                const applyDicomWindowing = (huValue) => {
                  // DICOM PS3.3 windowing formula
                  const wc = windowCenter;
                  const ww = windowWidth;
                  
                  // Calculate display range boundaries
                  const lowerBound = wc - 0.5 - (ww - 1) / 2;
                  const upperBound = wc - 0.5 + (ww - 1) / 2;
                  
                  let intensity;
                  
                  if (huValue <= lowerBound) {
                    // Below range: map to black
                    intensity = 0;
                  } else if (huValue > upperBound) {
                    // Above range: map to white
                    intensity = 255;
                  } else {
                    // Within range: linear scaling
                    intensity = Math.round(((huValue - (wc - 0.5)) / (ww - 1) + 0.5) * 255);
                  }
                  
                  // Clamp to valid range
                  intensity = Math.max(0, Math.min(255, intensity));
                  
                  // Apply photometric interpretation
                  if (photometricInterpretation === "MONOCHROME1") {
                    // Invert intensities
                    intensity = 255 - intensity;
                  }
                  // MONOCHROME2: no inversion (normal scaling)
                  
                  return intensity;
                };
                
                console.log('🔬 Windowing: Display range = [', (windowCenter - windowWidth/2).toFixed(1), ',', (windowCenter + windowWidth/2).toFixed(1), '] HU');
                console.log('🔬 Windowing: Lower bound =', (windowCenter - 0.5 - (windowWidth - 1) / 2).toFixed(1), 'HU');
                console.log('🔬 Windowing: Upper bound =', (windowCenter - 0.5 + (windowWidth - 1) / 2).toFixed(1), 'HU');
                console.log('🔬 Photometric:', photometricInterpretation === "MONOCHROME1" ? "Inverted" : "Normal");
                
                console.log('=== PIXEL DATA DEBUG ===');
                console.log('pixelData:', pixelData);
                console.log('pixelData type:', typeof pixelData);
                console.log('pixelData isArray:', Array.isArray(pixelData));
                console.log('pixelData length:', pixelData ? pixelData.length : 'null');
                console.log('pixelData first 10 values:', pixelData ? Array.from(pixelData.slice(0, 10)) : 'null');

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
                    
                    // Check if this is 16-bit data (2 bytes per pixel)
                    const is16Bit = pixelData.length === (width * height * 2);
                    console.log('🔍 Data analysis - pixelData.length:', pixelData.length, 'width*height*2:', width * height * 2, 'is16Bit:', is16Bit);
                    
                    if (is16Bit) {
                      console.log('🔍 Processing as 16-bit grayscale data');
                      // For 16-bit pixels, combine 2 bytes into one pixel value
                      for (let i = 0; i < width * height && i < data.length / 4; i++) {
                        const byteIndex = i * 2;
                        let pixelValue = (pixelData[byteIndex + 1] << 8) | pixelData[byteIndex]; // Little-endian 16-bit
                        
                        // Apply HU conversion if needed
                        if (needsHUConversion) {
                          const originalValue = pixelValue;
                          pixelValue = (pixelValue * rescaleSlope) + rescaleIntercept;
                          // Clamp HU values to reasonable range (-1000 to +3000)
                          pixelValue = Math.max(-1000, Math.min(3000, pixelValue));
                          
                          // Log first few conversions for debugging
                          if (i < 5) {
                            console.log(`🔬 HU Conversion: Pixel ${i}: ${originalValue} → ${pixelValue.toFixed(2)} HU`);
                          }
                        }
                        
                        // Apply DICOM windowing for proper CT display
                        const displayIntensity = applyDicomWindowing(pixelValue);
                        
                        const dataIndex = i * 4;
                        
                        // Convert to grayscale (same value for R, G, B)
                        data[dataIndex] = displayIntensity;     // Red
                        data[dataIndex + 1] = displayIntensity; // Green
                        data[dataIndex + 2] = displayIntensity; // Blue
                        data[dataIndex + 3] = 255;              // Alpha (fully opaque)
                      }
                    } else {
                      console.log('🔍 Processing as 8-bit grayscale data');
                      // Original 8-bit logic
                      for (let i = 0; i < pixelData.length && i < data.length / 4; i++) {
                        let pixelValue = pixelData[i];
                        
                        // Apply HU conversion if needed
                        if (needsHUConversion) {
                          const originalValue = pixelValue;
                          pixelValue = (pixelValue * rescaleSlope) + rescaleIntercept;
                          // Clamp HU values to reasonable range (-1000 to +3000)
                          pixelValue = Math.max(-1000, Math.min(3000, pixelValue));
                          
                          // Log first few conversions for debugging
                          if (i < 5) {
                            console.log(`🔬 HU Conversion: Pixel ${i}: ${originalValue} → ${pixelValue.toFixed(2)} HU`);
                          }
                        }
                        
                        // Apply DICOM windowing for proper CT display
                        const displayIntensity = applyDicomWindowing(pixelValue);
                        
                        const dataIndex = i * 4;
                        
                        // Convert to grayscale (same value for R, G, B)
                        data[dataIndex] = displayIntensity;     // Red
                        data[dataIndex + 1] = displayIntensity; // Green
                        data[dataIndex + 2] = displayIntensity; // Blue
                        data[dataIndex + 3] = 255;              // Alpha (fully opaque)
                      }
                    }
                    console.log('Processed grayscale pixels:', Math.min(pixelData.length, data.length / 4));
                    if (needsHUConversion) {
                      console.log('🔬 HU Conversion: Applied to grayscale pixels');
                    }
                  } else if (numChannels === 3) {
                    // RGB: three values per pixel
                    console.log('Processing as RGB (3 channels)');
                    for (let i = 0; i < pixelData.length / 3 && i < data.length / 4; i++) {
                      const dataIndex = i * 4;
                      const pixelIndex = i * 3;
                      
                      let redValue = pixelData[pixelIndex];
                      let greenValue = pixelData[pixelIndex + 1];
                      let blueValue = pixelData[pixelIndex + 2];
                      
                      // Apply HU conversion if needed (for CT images, all channels might need conversion)
                      if (needsHUConversion) {
                        redValue = (redValue * rescaleSlope) + rescaleIntercept;
                        greenValue = (greenValue * rescaleSlope) + rescaleIntercept;
                        blueValue = (blueValue * rescaleSlope) + rescaleIntercept;
                        
                        // Clamp HU values to reasonable range (-1000 to +3000)
                        redValue = Math.max(-1000, Math.min(3000, redValue));
                        greenValue = Math.max(-1000, Math.min(3000, greenValue));
                        blueValue = Math.max(-1000, Math.min(3000, blueValue));
                      }
                      
                      // Apply DICOM windowing for proper CT display
                      const displayRed = applyDicomWindowing(redValue);
                      const displayGreen = applyDicomWindowing(greenValue);
                      const displayBlue = applyDicomWindowing(blueValue);
                      
                      data[dataIndex] = displayRed;     // Red
                      data[dataIndex + 1] = displayGreen; // Green
                      data[dataIndex + 2] = displayBlue; // Blue
                      data[dataIndex + 3] = 255;        // Alpha (fully opaque)
                    }
                    console.log('Processed RGB pixels:', Math.min(pixelData.length / 3, data.length / 4));
                    if (needsHUConversion) {
                      console.log('🔬 HU Conversion: Applied to RGB pixels');
                    }
                  } else if (numChannels === 4) {
                    // RGBA: four values per pixel
                    console.log('Processing as RGBA (4 channels)');
                    for (let i = 0; i < pixelData.length / 4 && i < data.length / 4; i++) {
                      const dataIndex = i * 4;
                      const pixelIndex = i * 4;
                      
                      let redValue = pixelData[pixelIndex];
                      let greenValue = pixelData[pixelIndex + 1];
                      let blueValue = pixelData[pixelIndex + 2];
                      const alphaValue = pixelData[pixelIndex + 3];
                      
                      // Apply HU conversion if needed (for CT images, RGB channels might need conversion)
                      if (needsHUConversion) {
                        redValue = (redValue * rescaleSlope) + rescaleIntercept;
                        greenValue = (greenValue * rescaleSlope) + rescaleIntercept;
                        blueValue = (blueValue * rescaleSlope) + rescaleIntercept;
                        
                        // Clamp HU values to reasonable range (-1000 to +3000)
                        redValue = Math.max(-1000, Math.min(3000, redValue));
                        greenValue = Math.max(-1000, Math.min(3000, greenValue));
                        blueValue = Math.max(-1000, Math.min(3000, blueValue));
                      }
                      
                      // Apply DICOM windowing for proper CT display
                      const displayRed = applyDicomWindowing(redValue);
                      const displayGreen = applyDicomWindowing(greenValue);
                      const displayBlue = applyDicomWindowing(blueValue);
                      
                      data[dataIndex] = displayRed;     // Red
                      data[dataIndex + 1] = displayGreen; // Green
                      data[dataIndex + 2] = displayBlue; // Blue
                      data[dataIndex + 3] = alphaValue;  // Alpha
                    }
                    console.log('Processed RGBA pixels:', Math.min(pixelData.length / 4, data.length / 4));
                    if (needsHUConversion) {
                      console.log('🔬 HU Conversion: Applied to RGBA pixels');
                    }
                  } else {
                    // Other channel counts: treat as grayscale for now
                    console.warn(`Unsupported channel count: ${numChannels}, treating as grayscale`);
                    console.log('Processing as fallback grayscale');
                    for (let i = 0; i < pixelData.length && i < data.length / 4; i++) {
                      let pixelValue = pixelData[i];
                      const dataIndex = i * 4;
                      
                      // Apply HU conversion if needed
                      if (needsHUConversion) {
                        const originalValue = pixelValue;
                        pixelValue = (pixelValue * rescaleSlope) + rescaleIntercept;
                        // Clamp HU values to reasonable range (-1000 to +3000)
                        pixelValue = Math.max(-1000, Math.min(3000, pixelValue));
                        
                        // Log first few conversions for debugging
                        if (i < 5) {
                          console.log(`🔬 HU Conversion: Pixel ${i}: ${originalValue} → ${pixelValue.toFixed(2)} HU`);
                        }
                      }
                      
                      // Apply DICOM windowing for proper CT display
                      const displayIntensity = applyDicomWindowing(pixelValue);
                      
                      data[dataIndex] = displayIntensity;     // Red
                      data[dataIndex + 1] = displayIntensity; // Green
                      data[dataIndex + 2] = displayIntensity; // Blue
                      data[dataIndex + 3] = 255;              // Alpha (fully opaque)
                    }
                    console.log('Processed fallback pixels:', Math.min(pixelData.length, data.length / 4));
                    if (needsHUConversion) {
                      console.log('🔬 HU Conversion: Applied to fallback pixels');
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
                          Pixels per frame: {(() => {
                            if (!pixelData) return 'N/A';
                            // Check if this is 16-bit data (2 bytes per pixel)
                            const is16Bit = pixelData.length === (width * height * 2);
                            return is16Bit ? Math.floor(pixelData.length / 2) : pixelData.length;
                          })()} • 
                          Expected: {totalPixels}
                        </small>
                      </div>
                      {hasExtraDimensions && (
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
          
          {hasExtraDimensions && (
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
                      const hasExtraDimensions = numDimensions > 2 && dimensions.slice(2).some(dim => dim > 1);
                      
                      if (hasExtraDimensions) {
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
                                const hasExtraDimensions = numDimensions > 2 && dimensions.slice(2).some(dim => dim > 1);
                                if (hasExtraDimensions) {
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
                      
                      {/* Variant Modules */}
                      {moduleNode.variant && moduleNode.variant.length > 0 && (
                        <div className="mb-4 text-center">
                          <h6 className="text-success mb-3">
                            <i className="fas fa-arrow-down me-2"></i>
                            Variant Modules:
                          </h6>
                          <div className="list-group" style={{maxWidth: '80%', margin: '0 auto'}}>
                            {moduleNode.variant.map((variant, idx) => {
                              const variantModule = modules.find(m => m.id === variant.id);
                              return (
                                <div key={idx} className="list-group-item list-group-item-success text-center">
                                  <strong>{variantModule?.type || 'Unknown'}</strong> - {variant.id}
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
                          // Each module shows its own metadata - no cross-module dependencies
                          const metadataToShow = module.metadata;
                        
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
      setSelectedVariantModules({});
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
      // Password is now stored in backend - no need to send it
      console.log('🔐 Using stored credentials from backend for edit mode');
      
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
      setIsProcessing(true);
      
      // Call the backend to save the file and close the writer
      const response = await fetch('/api/save-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('💾 Save File: File saved successfully');
        setProcessingMessage('File saved successfully');
        setShowSuccessBar(true);
        setTimeout(() => setShowSuccessBar(false), 3000);
        
        // Switch back to view mode
        setIsEditMode(false);
        console.log('💾 Save File: Switched back to view mode');
        
        // Note: We don't reload the file data here because:
        // 1. The current state already contains the new modules we just created
        // 2. Reloading would overwrite our state with potentially stale data
        // 3. The user can see all their changes immediately
        console.log('💾 Save File: Keeping current state - new modules are already visible');
        
      } else {
        throw new Error(result.message || 'Failed to save file');
      }
      
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
      console.log('➕ Add Module: Opening add module modal for encounter:', encounterId);
      
      // Set the selected encounter and open the modal
      setSelectedEncounterId(encounterId);
      setShowAddModuleModal(true);
      
      // Load available schemas if we haven't already
      if (availableSchemas.length === 0) {
        await loadAvailableSchemas();
      }
      
    } catch (error) {
      console.error('❌ Add Module: Error opening modal:', error);
      setErrorMessage('Error opening add module dialog. Please try again.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
    }
  };

  // Toggle encounter collapse state
  const toggleEncounterCollapse = (encounterId) => {
    setEncounterCollapsed(prev => ({
      ...prev,
      [encounterId]: !prev[encounterId]
    }));
  };

  // Load available schemas from the local schemas folder
  const loadAvailableSchemas = async () => {
    try {
      console.log('📋 Loading available schemas from backend...');
      
      const response = await fetch('/api/schemas');
      if (!response.ok) {
        throw new Error(`Failed to fetch schemas: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      const schemas = result.schemas || [];
      
      setAvailableSchemas(schemas);
      console.log('📋 Loaded schemas from backend:', schemas);
      
    } catch (error) {
      console.error('❌ Error loading schemas:', error);
      setErrorMessage('Failed to load available schemas. Please try again.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
    }
  };

  // Handle modal close
  const handleCloseAddModuleModal = () => {
    setShowAddModuleModal(false);
    setSelectedEncounterId(null);
    setSelectedSchema('');
    setFormData({});
    setShowForm(false);
    setParsedSchema(null);
  };

  // Handle schema selection change
  const handleSchemaChange = (schema) => {
    setSelectedSchema(schema);
  };

  // Handle schema selection confirmation and show form
  const handleSchemaConfirm = async () => {
    if (!selectedSchema) {
      setErrorMessage('Please select a schema first.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
      return;
    }
    
    try {
      // Parse the schema and initialize form data
      const parsedSchemaResult = await parseSchemaForForm(selectedSchema);
      if (parsedSchemaResult) {
        // Store the parsed schema in state
        setParsedSchema(parsedSchemaResult);
        
        // Initialize form data with empty values
        const initialFormData = {};
        
        // Initialize metadata fields
        if (parsedSchemaResult.metadata) {
          initialFormData.metadata = {};
          Object.keys(parsedSchemaResult.metadata).forEach(key => {
            const field = parsedSchemaResult.metadata[key];
            if (field.type === 'array') {
              initialFormData.metadata[key] = [];
            } else if (field.type === 'object' && field.properties) {
              // Handle nested object fields with properties
              initialFormData.metadata[key] = {};
              Object.keys(field.properties).forEach(subKey => {
                const subField = field.properties[subKey];
                if (subField.type === 'array') {
                  initialFormData.metadata[key][subKey] = '';
                } else {
                  initialFormData.metadata[key][subKey] = '';
                }
              });
            } else {
              initialFormData.metadata[key] = '';
            }
          });
        }
        
        // Initialize any additional dynamic sections from metadata
        Object.keys(parsedSchemaResult).forEach(sectionName => {
          // Skip sections we've already handled (metadata, data)
          if (['metadata', 'data'].includes(sectionName)) return;
          
          const sectionData = parsedSchemaResult[sectionName];
          if (sectionData && typeof sectionData === 'object' && Object.keys(sectionData).length > 0) {
            initialFormData[sectionName] = {};
            Object.keys(sectionData).forEach(key => {
              const field = sectionData[key];
              if (field.type === 'array') {
                initialFormData[sectionName][key] = [];
              } else if (field.type === 'object' && field.properties) {
                // Handle nested object fields with properties
                initialFormData[sectionName][key] = {};
                Object.keys(field.properties).forEach(subKey => {
                  const subField = field.properties[subKey];
                  if (subField.type === 'array') {
                    initialFormData[sectionName][key][subKey] = [];
                  } else {
                    initialFormData[sectionName][key][subKey] = '';
                  }
                });
              } else {
                initialFormData[sectionName][key] = '';
              }
            });
          }
        });
        
        // Initialize data fields - support multiple data instances
        if (parsedSchemaResult.data) {
          // Start with one data instance
          initialFormData.data = [{}];
          
          // Initialize the first data instance
          Object.keys(parsedSchemaResult.data).forEach(key => {
            const field = parsedSchemaResult.data[key];
            if (field.type === 'array') {
              initialFormData.data[0][key] = [];
            } else if (field.type === 'object' && field.properties) {
              // Handle nested object fields with properties
              initialFormData.data[0][key] = {};
              Object.keys(field.properties).forEach(subKey => {
                const subField = field.properties[subKey];
                if (subField.type === 'array') {
                  initialFormData.data[0][key][subKey] = [];
                } else {
                  initialFormData.data[0][key][subKey] = '';
                }
              });
            } else {
              initialFormData.data[0][key] = '';
            }
          });
        }
        
        setFormData(initialFormData);
        setShowForm(true);
        console.log('✅ Form initialized with schema:', parsedSchemaResult);
        console.log('✅ Initial form data:', initialFormData);
      } else {
        setErrorMessage('Failed to parse selected schema. Please try again.');
        setShowErrorBar(true);
        setTimeout(() => setShowErrorBar(false), 3000);
      }
    } catch (error) {
      console.error('❌ Error handling schema confirmation:', error);
      setErrorMessage('Error processing schema. Please try again.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
    }
  };

  // Handle form field updates
  const handleFormFieldChange = (section, field, value, subField = null, dataIndex = null) => {
    setFormData(prev => {
      const newData = { ...prev };
      
      if (section === 'data' && dataIndex !== null) {
        // Handle data section with multiple instances
        if (!newData.data) newData.data = [];
        if (!newData.data[dataIndex]) newData.data[dataIndex] = {};
        
        if (subField !== null) {
          // Handle nested fields (e.g., name.given, name.family)
          if (!newData.data[dataIndex][field]) newData.data[dataIndex][field] = {};
          newData.data[dataIndex][field][subField] = value;
        } else {
          // Handle direct fields
          newData.data[dataIndex][field] = value;
        }
      } else if (subField !== null) {
        // Handle nested fields in other sections (e.g., name.given, name.family)
        if (!newData[section]) newData[section] = {};
        if (!newData[section][field]) newData[section][field] = {};
        newData[section][field][subField] = value;
      } else {
        // Handle direct fields in other sections
        if (!newData[section]) newData[section] = {};
        newData[section][field] = value;
      }
      return newData;
    });
  };

  // Add a new data instance
  const addDataInstance = () => {
    console.log('🔍 addDataInstance called, stack trace:', new Error().stack);
    
    // Prevent rapid successive calls using ref
    if (addDataInstanceRef.current) {
      console.log('🚫 addDataInstance blocked - already processing');
      return;
    }
    addDataInstanceRef.current = true;
    
    console.log('➕ Adding data instance, current count:', formData.data?.length || 0);
    setFormData(prev => {
      console.log('🔄 setFormData callback executed with prev:', prev);
      
      // Create a completely new data structure to avoid mutation issues
      const newData = {
        ...prev,
        data: [...(prev.data || [])]
      };
      
      // Create a new empty data instance with the same structure as the first one
      const newInstance = {};
      if (parsedSchema && parsedSchema.data) {
        Object.keys(parsedSchema.data).forEach(key => {
          const field = parsedSchema.data[key];
          if (field.type === 'array') {
            newInstance[key] = [];
          } else if (field.type === 'object' && field.properties) {
            newInstance[key] = {};
            Object.keys(field.properties).forEach(subKey => {
              const subField = field.properties[subKey];
              if (subField.type === 'array') {
                newInstance[key][subKey] = [];
              } else {
                newInstance[key][subKey] = '';
              }
            });
          } else {
            newInstance[key] = '';
          }
        });
      }
      
      // Add the new instance to the new array
      newData.data.push(newInstance);
      console.log('➕ New data instance added, new count:', newData.data.length, 'newData:', newData);
      return newData;
    });
    
    // Reset the processing flag after a short delay
    setTimeout(() => {
      addDataInstanceRef.current = false;
    }, 100);
  };

  // Remove a data instance
  const removeDataInstance = (index) => {
    // Prevent rapid successive calls using ref
    if (removeDataInstanceRef.current) return;
    removeDataInstanceRef.current = true;
    
    console.log('➖ Removing data instance at index:', index, 'current count:', formData.data?.length || 0);
    setFormData(prev => {
      // Create a completely new data structure to avoid mutation issues
      const newData = {
        ...prev,
        data: [...(prev.data || [])]
      };
      
      if (newData.data && newData.data.length > 1) {
        newData.data.splice(index, 1);
        console.log('➖ Data instance removed, new count:', newData.data.length);
      }
      return newData;
    });
    
    // Reset the processing flag after a short delay
    setTimeout(() => {
      removeDataInstanceRef.current = false;
    }, 100);
  };

  // Handle array field updates (for dimensions, dimension names, etc.)
  const handleArrayFieldChange = (section, field, value, subField = null, dataIndex = null) => {
    try {
      // Parse array string (e.g., "256, 256, 12, 5")
      const arrayValue = value.split(',').map(item => item.trim()).filter(item => item !== '');
      
      if (section === 'data' && dataIndex !== null) {
        // Handle data section with multiple instances
        if (subField !== null) {
          // Handle nested array fields in data
          setFormData(prev => ({
            ...prev,
            data: prev.data.map((instance, index) => 
              index === dataIndex 
                ? {
                    ...instance,
                    [field]: {
                      ...instance[field],
                      [subField]: arrayValue
                    }
                  }
                : instance
            )
          }));
        } else {
          // Handle direct array fields in data
          setFormData(prev => ({
            ...prev,
            data: prev.data.map((instance, index) => 
              index === dataIndex 
                ? { ...instance, [field]: arrayValue }
                : instance
            )
          }));
        }
      } else if (subField !== null) {
        // Handle nested array fields in other sections
        setFormData(prev => ({
          ...prev,
          [section]: {
            ...prev[section],
            [field]: {
              ...prev[section]?.[field],
              [subField]: arrayValue
            }
          }
        }));
      } else {
        // Handle direct array fields in other sections
        setFormData(prev => ({
          ...prev,
          [section]: {
            ...prev[section],
            [field]: arrayValue
          }
        }));
      }
    } catch (error) {
      console.error('Error parsing array field:', error);
    }
  };

  // Handle back button to return to schema selection
  const handleBackToSchemaSelection = () => {
    setShowForm(false);
    setFormData({});
  };



  // Convert form data types based on schema definitions and filter out empty fields
  const convertFormDataTypes = (data, schema) => {
    if (!schema || !data) return data;
    
    const convertValue = (value, fieldSchema) => {
      // Check if value is empty/blank
      const isEmpty = value === '' || value === null || value === undefined || 
                     (Array.isArray(value) && value.length === 0) ||
                     (typeof value === 'object' && value !== null && Object.keys(value).length === 0);
      
      // If field is not required and value is empty, return undefined to filter it out
      if (isEmpty && !fieldSchema.required) {
        return undefined;
      }
      
      // If value is empty but field is required, return as-is (will trigger validation error)
      if (isEmpty) {
        return value;
      }
      
      switch (fieldSchema.type) {
        case 'integer':
          const intValue = parseInt(value, 10);
          return isNaN(intValue) ? value : intValue;
        case 'number':
        case 'float':
          const floatValue = parseFloat(value);
          return isNaN(floatValue) ? value : floatValue;
        case 'boolean':
          if (typeof value === 'string') {
            return value.toLowerCase() === 'true' || value === '1';
          }
          return Boolean(value);
        case 'array':
          if (Array.isArray(value)) {
            return value.map(item => convertValue(item, fieldSchema.items || {}));
          }
          return value;
        case 'object':
          if (fieldSchema.properties && typeof value === 'object') {
            const converted = {};
            Object.keys(fieldSchema.properties).forEach(propKey => {
              const propSchema = fieldSchema.properties[propKey];
              const convertedValue = convertValue(value[propKey], propSchema);
              if (convertedValue !== undefined) {
                converted[propKey] = convertedValue;
              }
            });
            return Object.keys(converted).length > 0 ? converted : undefined;
          }
          return value;
        default:
          return value; // string and other types remain as-is
      }
    };
    
    const convertSection = (sectionData, sectionSchema) => {
      if (!sectionData || !sectionSchema) return sectionData;
      
      const converted = {};
      Object.keys(sectionData).forEach(key => {
        const fieldSchema = sectionSchema[key];
        if (fieldSchema) {
          const convertedValue = convertValue(sectionData[key], fieldSchema);
          if (convertedValue !== undefined) {
            converted[key] = convertedValue;
          }
        } else {
          // For fields not in schema, only include if they have a value
          if (sectionData[key] !== '' && sectionData[key] !== null && sectionData[key] !== undefined) {
            converted[key] = sectionData[key];
          }
        }
      });
      return converted;
    };
    
    // Convert metadata section
    if (data.metadata && schema.metadata) {
      data.metadata = convertSection(data.metadata, schema.metadata);
    }
    
    // Convert data section (array of objects)
    if (data.data && Array.isArray(data.data) && schema.data) {
      data.data = data.data.map(dataInstance => 
        convertSection(dataInstance, schema.data)
      ).filter(instance => Object.keys(instance).length > 0); // Remove empty data instances
    }
    
    // Convert any additional dynamic sections
    Object.keys(schema).forEach(sectionName => {
      if (!['metadata', 'data'].includes(sectionName) && 
          data[sectionName] && 
          typeof schema[sectionName] === 'object') {
        data[sectionName] = convertSection(data[sectionName], schema[sectionName]);
      }
    });
    
    return data;
  };

  // Handle DICOM import for new module
  const handleImportDicom = async () => {
    try {
      // Create a hidden file input for DICOM files
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.dcm,.dicom,image/dicom';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      
      // Handle file selection
      fileInput.onchange = async (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        console.log('🖼️ DICOM files selected:', files.length);
        
        // Close the add module modal
        handleCloseAddModuleModal();
        
        // Show processing message
        setProcessingMessage(`Processing ${files.length} DICOM file(s)...`);
        setIsProcessing(true);
        
        try {
          // Process each DICOM file
          for (const file of files) {
            console.log('🖼️ Processing DICOM file:', file.name);
            
            // Create FormData for the request
            const formData = new FormData();
            formData.append('file', file);
            formData.append('file_type', 'dicom');
            formData.append('encounter_id', selectedEncounterId);
            
            // Send to backend for processing
            const response = await fetch('/api/import/file', {
              method: 'POST',
              body: formData
            });
            
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('✅ DICOM import result:', result);
          }
          
          // Show success message
          setShowSuccessBar(true);
          setErrorMessage(`Successfully imported ${files.length} DICOM file(s)!`);
          setTimeout(() => setShowSuccessBar(false), 3000);
          
          // Refresh the encounter data to show new modules
          if (selectedEncounterId) {
            // TODO: Refresh encounter data
            console.log('🔄 Should refresh encounter data for:', selectedEncounterId);
          }
          
        } catch (error) {
          console.error('❌ Error processing DICOM files:', error);
          setErrorMessage(`Failed to process DICOM files: ${error.message}`);
          setShowErrorBar(true);
          setTimeout(() => setShowErrorBar(false), 5000);
        } finally {
          setIsProcessing(false);
        }
        
        // Clean up
        document.body.removeChild(fileInput);
      };
      
      // Add to DOM and trigger click
      document.body.appendChild(fileInput);
      fileInput.click();
      
    } catch (error) {
      console.error('❌ Error handling DICOM import:', error);
      setErrorMessage('Failed to handle DICOM import request.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
    }
  };

  // Handle module creation confirmation
  const handleConfirmAddModule = async () => {
    if (!selectedSchema || !selectedEncounterId) {
      setErrorMessage('Please select a schema and encounter.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
      return;
    }

    if (!formData || Object.keys(formData).length === 0) {
      setErrorMessage('Please fill out the module form before creating.');
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
      return;
    }

    try {
      console.log('➕ Creating module with schema:', selectedSchema, 'for encounter:', selectedEncounterId);
      console.log('📋 Form data to send:', formData);
      setProcessingMessage('Creating new module...');
      
      // Convert form data types based on schema definitions
      const convertedFormData = convertFormDataTypes({...formData}, parsedSchema);
      console.log('🔄 Original form data:', formData);
      console.log('🔄 Converted form data:', convertedFormData);
      console.log('🔄 Parsed schema for type checking:', parsedSchema);
      
      // Prepare the data to send to the backend
      const moduleDataToSend = {
        metadata: convertedFormData.metadata || {},
        data: convertedFormData.data || []
      };
      
      // Create FormData for the request
      const formDataToSend = new FormData();
      formDataToSend.append('encounter_id', selectedEncounterId);
      formDataToSend.append('schema_path', selectedSchema);
      formDataToSend.append('module_data', JSON.stringify(moduleDataToSend));
      
      // Send the request to the backend
      const response = await fetch('/api/create-module', {
        method: 'POST',
        body: formDataToSend
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('✅ Module creation result:', result);
      console.log('✅ Result type:', typeof result);
      console.log('✅ Result keys:', Object.keys(result));
      console.log('✅ Result.success:', result.success);
      console.log('✅ Result.success type:', typeof result.success);
      
      if (result.success) {
        setProcessingMessage('Module created successfully!');
        setShowSuccessBar(true);
        setTimeout(() => setShowSuccessBar(false), 3000);
        
        // Close the modal
        handleCloseAddModuleModal();
        
        // Add the new module to the encounter's module list
        if (result.module_id && result.module_id !== 'unknown') {
          // Get filePath from sessionStorage
          const filePath = sessionStorage.getItem('umdf_file_path');
          
          console.log('🔍 DEBUG: Creating new module with:');
          console.log('  - module_id:', result.module_id);
          console.log('  - selectedSchema:', selectedSchema);
          console.log('  - selectedEncounterId:', selectedEncounterId);
          console.log('  - filePath:', filePath);
          
          // Extract the title from the parsed schema, fallback to filename if no title
          const schemaTitle = parsedSchema?.title || selectedSchema.split('/').pop().replace('.json', '');
          
          // Format the title the same way the backend does: capitalize first letter of each word + " Module"
          const formattedTitle = schemaTitle.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ') + ' Module';
          
          const newModule = {
            id: result.module_id,
            name: formattedTitle,
            schema_id: selectedSchema,
            schema_path: selectedSchema,
            type: 'tabular', // Default type for new modules
            schema_url: selectedSchema,
            metadata: formData.metadata || {},
            data: formData.data || [],
            created_at: new Date().toISOString(),
            source_file: filePath || 'unknown'
          };
          
          // Update the modules list to include the new module
          setModules(prevModules => {
            const updatedModules = [...prevModules, newModule];
            console.log('✅ Updated modules list:', updatedModules);
            return updatedModules;
          });
          
          // Add the new module to the encounter's module tree
          setEncounters(prevEncounters => {
            const updatedEncounters = prevEncounters.map(encounter => 
              encounter.encounter_id === selectedEncounterId
                ? {
                    ...encounter,
                    module_tree: [
                      ...encounter.module_tree,
                      {
                        id: result.module_id,
                        // Add any additional module tree properties if needed
                      }
                    ]
                  }
                : encounter
            );
            console.log('✅ Updated encounters list:', updatedEncounters);
            return updatedEncounters;
          });
          
          console.log('✅ Added new module to modules list:', newModule);
          console.log('✅ Added new module to encounter module tree for encounter:', selectedEncounterId);
          
          // Debug: Check the current state after updates
          setTimeout(() => {
            console.log('🔍 DEBUG: Current modules state:', modules);
            console.log('🔍 DEBUG: Current encounters state:', encounters);
          }, 100);
        }
        
      } else {
        throw new Error(result.error || 'Module creation failed');
      }
      
    } catch (error) {
      console.error('❌ Error creating module:', error);
      setErrorMessage(`Failed to create module: ${error.message}`);
      setShowErrorBar(true);
      setTimeout(() => setShowErrorBar(false), 3000);
    }
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
      // Get password from session storage for authentication
      const storedPassword = sessionStorage.getItem('umdf_password');
      const url = storedPassword 
        ? `/api/module/${moduleId}/data?password=${encodeURIComponent(storedPassword)}`
        : `/api/module/${moduleId}/data`;
      
      console.log(`📡 Making request to: ${url}`);
      const response = await fetch(url, {
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
                              sessionStorage.removeItem('umdf_file_name');
                              
                              // Clear all component state
                              console.log('🔄 Change User: Clearing component state...');
                              setModules([]);
                              setEncounters([]);
                              setSelectedVariantModules({});
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

      {/* Add Module Modal */}
      <AddModuleModal
        show={showAddModuleModal}
        onClose={handleCloseAddModuleModal}
        encounterId={selectedEncounterId}
        availableSchemas={availableSchemas}
        selectedSchema={selectedSchema}
        onSchemaChange={handleSchemaChange}
        onConfirm={handleConfirmAddModule}
        onSchemaConfirm={handleSchemaConfirm}
        showForm={showForm}
        formData={formData}
        onFormFieldChange={handleFormFieldChange}
        onArrayFieldChange={handleArrayFieldChange}
        onBackToSchemaSelection={handleBackToSchemaSelection}
        onFormConfirm={handleConfirmAddModule}
        parsedSchema={parsedSchema}
        addDataInstance={addDataInstance}
        removeDataInstance={removeDataInstance}
        onOpenEmbeddedSchema={(schema, fieldPath, data) => {
          setCurrentEmbeddedSchema(schema);
          setCurrentEmbeddedFieldPath(fieldPath);
          setEmbeddedSchemaData(data);
          setShowEmbeddedSchemaModal(true);
        }}
        onImportDicom={handleImportDicom}
      />



      {/* Embedded Schema Modal */}
      {showEmbeddedSchemaModal && currentEmbeddedSchema && (
        <div className="modal fade show d-block" style={{backgroundColor: 'rgba(0,0,0,0.5)'}} tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content"
              onWheel={(e) => {
                // Prevent scroll event from bubbling up to the background page
                e.stopPropagation();
              }}
              onScroll={(e) => {
                // Prevent scroll event from bubbling up to the background page
                e.stopPropagation();
              }}
            >
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fas fa-cog me-2"></i>
                  Configure {currentEmbeddedSchema.title || 'Embedded Schema'}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowEmbeddedSchemaModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info">
                  <i className="fas fa-info-circle me-2"></i>
                  This is a referenced schema: <code>{currentEmbeddedSchema.$id || 'Unknown'}</code>
                </div>
                
                {/* Render the embedded schema form */}
                <EmbeddedSchemaForm
                  schema={currentEmbeddedSchema}
                  data={embeddedSchemaData}
                  onDataChange={(newData) => setEmbeddedSchemaData(newData)}
                  fieldPath={currentEmbeddedFieldPath}
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEmbeddedSchemaModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    // Save the embedded schema data back to the main form
                    console.log('💾 Saving embedded schema data:', embeddedSchemaData);
                    
                    // Update the main form data with embedded schema data
                    setFormData(prevFormData => {
                      const newFormData = { ...prevFormData };
                      
                      // Navigate to the correct location in the form data structure
                      const pathParts = currentEmbeddedFieldPath.split('.');
                      if (pathParts.length === 1) {
                        // Direct field in metadata or data
                        if (parsedSchema.metadata && parsedSchema.metadata[currentEmbeddedFieldPath]) {
                          if (!newFormData.metadata) newFormData.metadata = {};
                          newFormData.metadata[currentEmbeddedFieldPath] = embeddedSchemaData;
                        } else if (parsedSchema.data && parsedSchema.data[currentEmbeddedFieldPath]) {
                          if (!newFormData.data) newFormData.data = {};
                          newFormData.data[currentEmbeddedFieldPath] = embeddedSchemaData;
                        }
                      } else if (pathParts.length === 2) {
                        // Nested field (e.g., metadata.image_structure)
                        const [section, fieldName] = pathParts;
                        if (!newFormData[section]) newFormData[section] = {};
                        newFormData[section][fieldName] = embeddedSchemaData;
                      }
                      
                      console.log('💾 Updated main form data:', newFormData);
                      return newFormData;
                    });
                    
                    setShowEmbeddedSchemaModal(false);
                  }}
                >
                  <i className="fas fa-save me-2"></i>
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UMDFViewer; 