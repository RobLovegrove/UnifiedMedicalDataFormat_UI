import json
import base64
import io
from typing import Dict, Any, Optional, List
from pathlib import Path
import pydicom
from PIL import Image
from ..models.medical_file import Module
from ..schemas.schema_manager import SchemaManager
import numpy as np
from .umdf_importer import UMDFImporter

class FileImporter:
    """Handles importing various file formats into the medical file format."""
    
    def __init__(self):
        self.schema_manager = SchemaManager()
    
    async def import_file(
        self, 
        content: bytes, 
        filename: str, 
        file_type: str, 
        schema_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Import a file and convert it to a module."""
        
        if file_type == "fhir":
            return await self._import_fhir(content, filename, schema_id)
        elif file_type == "dicom":
            return await self._import_dicom(content, filename, schema_id)
        elif file_type == "dicom_folder":
            return await self._import_dicom_folder(content, filename, schema_id)
        elif file_type in ["image", "jpg", "jpeg", "png"]:
            return await self._import_image(content, filename, schema_id)
        elif file_type == "umdf":
            return await self._import_umdf(content, filename, schema_id)
            return await self._import_image(content, filename, schema_id)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
    
    async def import_dicom_folder(
        self,
        folder_path: str,
        schema_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Import a folder of DICOM files as a 3D volume."""
        try:
            folder = Path(folder_path)
            if not folder.exists() or not folder.is_dir():
                raise ValueError(f"Invalid folder path: {folder_path}")
            
            # Find all DICOM files in the folder
            dicom_files = []
            for file_path in folder.rglob("*.dcm"):
                try:
                    ds = pydicom.dcmread(str(file_path))
                    dicom_files.append((file_path, ds))
                except Exception as e:
                    print(f"Warning: Could not read {file_path}: {e}")
            
            if not dicom_files:
                raise ValueError(f"No valid DICOM files found in {folder_path}")
            
            # Sort files by instance number for proper ordering
            dicom_files.sort(key=lambda x: x[1].get('InstanceNumber', 0))
            
            # Extract volume metadata from first file
            first_ds = dicom_files[0][1]
            volume_metadata = self._extract_volume_metadata(first_ds, len(dicom_files))
            
            # Process all slices
            slices_data = []
            for file_path, ds in dicom_files:
                slice_data = self._extract_slice_data(ds, file_path.name)
                slices_data.append(slice_data)
            
            # Create 3D volume module
            module = Module(
                name=f"DICOM_Volume_{folder.name}",
                schema_id=schema_id or "imaging",
                data={
                    **volume_metadata,
                    "slices": slices_data,
                    "num_slices": len(slices_data)
                },
                metadata={
                    "source": "dicom_folder",
                    "folder_path": str(folder),
                    "total_files": len(dicom_files),
                    "volume_type": "3D"
                }
            )
            
            return {
                "module": module.dict(),
                "schema_id": schema_id or "imaging",
                "volume_info": {
                    "num_slices": len(slices_data),
                    "dimensions": f"{volume_metadata.get('width', 'unknown')}x{volume_metadata.get('height', 'unknown')}x{len(slices_data)}",
                    "modality": volume_metadata.get('modality', 'unknown')
                }
            }
            
        except Exception as e:
            raise ValueError(f"Error processing DICOM folder: {e}")
    
    def _extract_volume_metadata(self, ds, num_slices: int) -> Dict[str, Any]:
        """Extract metadata for the entire 3D volume."""
        return {
            "modality": str(ds.Modality) if hasattr(ds, 'Modality') else "Unknown",
            "bodyPart": str(ds.BodyPartExamined) if hasattr(ds, 'BodyPartExamined') else "",
            "institution": str(ds.InstitutionName) if hasattr(ds, 'InstitutionName') else "",
            "acquisitionDate": str(ds.AcquisitionDate) if hasattr(ds, 'AcquisitionDate') else "",
            "technician": str(ds.OperatorsName) if hasattr(ds, 'OperatorsName') else "",
            "patientName": str(ds.PatientName) if hasattr(ds, 'PatientName') else "",
            "patientID": str(ds.PatientID) if hasattr(ds, 'PatientID') else "",
            "width": ds.Rows if hasattr(ds, 'Rows') else 0,
            "height": ds.Columns if hasattr(ds, 'Columns') else 0,
            "bit_depth": ds.BitsAllocated if hasattr(ds, 'BitsAllocated') else 0,
            "encoding": "raw",  # Default encoding
            "num_frames": num_slices,
            "seriesNumber": ds.SeriesNumber if hasattr(ds, 'SeriesNumber') else 0,
            "studyInstanceUID": str(ds.StudyInstanceUID) if hasattr(ds, 'StudyInstanceUID') else "",
            "seriesInstanceUID": str(ds.SeriesInstanceUID) if hasattr(ds, 'SeriesInstanceUID') else "",
            "sliceThickness": ds.SliceThickness if hasattr(ds, 'SliceThickness') else 0,
            "pixelSpacing": list(ds.PixelSpacing) if hasattr(ds, 'PixelSpacing') else [1, 1],
            "dicom_tags": self._extract_dicom_tags(ds)
        }
    
    def _extract_slice_data(self, ds, filename: str) -> Dict[str, Any]:
        """Extract data for a single slice."""
        slice_data = {
            "instanceNumber": ds.InstanceNumber if hasattr(ds, 'InstanceNumber') else 0,
            "sliceLocation": ds.SliceLocation if hasattr(ds, 'SliceLocation') else 0,
            "imagePosition": list(ds.ImagePositionPatient) if hasattr(ds, 'ImagePositionPatient') else [0, 0, 0],
            "imageOrientation": list(ds.ImageOrientationPatient) if hasattr(ds, 'ImageOrientationPatient') else [1, 0, 0, 0, 1, 0],
            "filename": filename,
            "dicom_tags": self._extract_dicom_tags(ds)
        }
        
        # Convert pixel data to base64 if available
        if hasattr(ds, 'pixel_array'):
            try:
                # Get pixel data
                pixel_array = ds.pixel_array
                
                # Adaptive window/level detection
                pixel_min = pixel_array.min()
                pixel_max = pixel_array.max()
                
                # Check if this looks like CT data (HU range)
                if pixel_min < -500 and pixel_max > 500:
                    # CT data - use adaptive window
                    # Find the 5th and 95th percentiles for better contrast
                    sorted_pixels = np.sort(pixel_array.flatten())
                    p5 = sorted_pixels[int(0.05 * len(sorted_pixels))]
                    p95 = sorted_pixels[int(0.95 * len(sorted_pixels))]
                    
                    # Use percentile-based window for better contrast
                    window_center = (p5 + p95) / 2
                    window_width = p95 - p5
                    
                    # Ensure minimum window width
                    if window_width < 100:
                        window_width = 100
                else:
                    # Non-CT data or unusual range - use soft tissue window
                    window_center = 40
                    window_width = 350
                
                # Debug: Print window settings
                print(f"DICOM window settings: Center={window_center:.1f}, Width={window_width:.1f}")
                print(f"Pixel range: {pixel_min:.1f} to {pixel_max:.1f}")
                
                # Calculate window/level
                min_val = window_center - window_width / 2
                max_val = window_center + window_width / 2
                
                # Clip values to window
                pixel_array = np.clip(pixel_array, min_val, max_val)
                
                # Normalize to 0-255
                pixel_array = ((pixel_array - min_val) / (max_val - min_val) * 255).astype(np.uint8)
                
                # Convert to PIL Image
                img = Image.fromarray(pixel_array, mode='L')  # 'L' for grayscale
                
                # Convert to PNG and then to base64
                img_buffer = io.BytesIO()
                img.save(img_buffer, format='PNG')
                img_buffer.seek(0)
                image_data = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
                slice_data["imageData"] = image_data
                
            except Exception as e:
                print(f"Warning: Could not process pixel data: {e}")
                slice_data["imageData"] = None
        
        return slice_data

    async def _import_fhir(self, content: bytes, filename: str, schema_id: Optional[str]) -> Dict[str, Any]:
        """Import FHIR JSON data."""
        try:
            # Parse FHIR JSON
            fhir_data = json.loads(content.decode('utf-8'))
            
            # Determine resource type
            resource_type = fhir_data.get("resourceType", "Unknown")
            
            # Map FHIR resource types to schemas
            schema_mapping = {
                "Patient": "patient",
                "Observation": "lab_results",
                "MedicationRequest": "medication",
                "ImagingStudy": "imaging"
            }
            
            # Use provided schema_id or map from FHIR resource type
            target_schema_id = schema_id or schema_mapping.get(resource_type, "patient")
            
            # Convert FHIR data to our format
            converted_data = self._convert_fhir_to_schema(fhir_data, target_schema_id)
            
            # Create module
            module = Module(
                name=f"FHIR_{resource_type}_{filename}",
                schema_id=target_schema_id,
                data=converted_data,
                metadata={
                    "source": "fhir",
                    "resource_type": resource_type,
                    "original_filename": filename
                }
            )
            
            return {
                "module": module.dict(),
                "schema_id": target_schema_id,
                "resource_type": resource_type
            }
            
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in FHIR file: {e}")
    
    async def _import_dicom(self, content: bytes, filename: str, schema_id: Optional[str]) -> Dict[str, Any]:
        """Import DICOM file."""
        try:
            # Read DICOM file
            dicom_file = io.BytesIO(content)
            ds = pydicom.dcmread(dicom_file)
            
            # Extract essential DICOM metadata
            dicom_data = {
                "modality": str(ds.Modality) if hasattr(ds, 'Modality') else "",
                "bodyPart": str(ds.BodyPartExamined) if hasattr(ds, 'BodyPartExamined') else "",
                "institution": str(ds.InstitutionName) if hasattr(ds, 'InstitutionName') else "",
                "acquisitionDate": str(ds.AcquisitionDate) if hasattr(ds, 'AcquisitionDate') else "",
                "technician": str(ds.PerformingPhysicianName) if hasattr(ds, 'PerformingPhysicianName') else "",
                "patientName": str(ds.PatientName) if hasattr(ds, 'PatientName') else "",
                "patientID": str(ds.PatientID) if hasattr(ds, 'PatientID') else "",
                "transferSyntax": str(ds.file_meta.TransferSyntaxUID) if hasattr(ds, 'file_meta') and hasattr(ds.file_meta, 'TransferSyntaxUID') else "Unknown",
                # Pixel data interpretation tags
                "rescaleIntercept": float(ds.RescaleIntercept) if hasattr(ds, 'RescaleIntercept') else None,
                "rescaleSlope": float(ds.RescaleSlope) if hasattr(ds, 'RescaleSlope') else None,
                "pixelRepresentation": int(ds.PixelRepresentation) if hasattr(ds, 'PixelRepresentation') else None,
                "photometricInterpretation": str(ds.PhotometricInterpretation) if hasattr(ds, 'PhotometricInterpretation') else "",
                "bitsAllocated": int(ds.BitsAllocated) if hasattr(ds, 'BitsAllocated') else None,
                "bitsStored": int(ds.BitsStored) if hasattr(ds, 'BitsStored') else None,
                "highBit": int(ds.HighBit) if hasattr(ds, 'HighBit') else None,
                "samplesPerPixel": int(ds.SamplesPerPixel) if hasattr(ds, 'SamplesPerPixel') else None,
                "rows": int(ds.Rows) if hasattr(ds, 'Rows') else None,
                "columns": int(ds.Columns) if hasattr(ds, 'Columns') else None,
                "pixelSpacing": [float(x) for x in ds.PixelSpacing] if hasattr(ds, 'PixelSpacing') else None,
                "sliceThickness": float(ds.SliceThickness) if hasattr(ds, 'SliceThickness') else None,
                "windowCenter": float(ds.WindowCenter) if hasattr(ds, 'WindowCenter') else None,
                "windowWidth": float(ds.WindowWidth) if hasattr(ds, 'WindowWidth') else None,
                "rescaleType": str(ds.RescaleType) if hasattr(ds, 'RescaleType') else "",
            }
            
            # Extract transfer syntax
            if hasattr(ds, 'file_meta') and hasattr(ds.file_meta, 'TransferSyntaxUID'):
                dicom_data["transferSyntax"] = str(ds.file_meta.TransferSyntaxUID)
            else:
                dicom_data["transferSyntax"] = "Unknown"
            
            # Convert pixel data to base64 if available
            if hasattr(ds, 'pixel_array'):
                try:
                    # Get pixel data
                    pixel_array = ds.pixel_array
                    
                    # Adaptive window/level detection
                    pixel_min = pixel_array.min()
                    pixel_max = pixel_array.max()
                    
                    # Check if this looks like CT data (HU range)
                    if pixel_min < -500 and pixel_max > 500:
                        # CT data - use adaptive window
                        # Find the 5th and 95th percentiles for better contrast
                        sorted_pixels = np.sort(pixel_array.flatten())
                        p5 = sorted_pixels[int(0.05 * len(sorted_pixels))]
                        p95 = sorted_pixels[int(0.95 * len(sorted_pixels))]
                        
                        # Use percentile-based window for better contrast
                        window_center = (p5 + p95) / 2
                        window_width = p95 - p5
                        
                        # Ensure minimum window width
                        if window_width < 100:
                            window_width = 100
                    else:
                        # Non-CT data or unusual range - use soft tissue window
                        window_center = 40
                        window_width = 350
                    
                    # Debug: Print window settings
                    print(f"DICOM window settings: Center={window_center:.1f}, Width={window_width:.1f}")
                    print(f"Pixel range: {pixel_min:.1f} to {pixel_max:.1f}")
                    
                    # Calculate window/level
                    min_val = window_center - window_width / 2
                    max_val = window_center + window_width / 2
                    
                    # Clip values to window
                    pixel_array = np.clip(pixel_array, min_val, max_val)
                    
                    # Normalize to 0-255
                    pixel_array = ((pixel_array - min_val) / (max_val - min_val) * 255).astype(np.uint8)
                    
                    # Convert to PIL Image
                    img = Image.fromarray(pixel_array, mode='L')  # 'L' for grayscale
                    
                    # Convert to PNG and then to base64
                    img_buffer = io.BytesIO()
                    img.save(img_buffer, format='PNG')
                    img_buffer.seek(0)
                    image_data = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
                    dicom_data["imageData"] = image_data
                    
                except Exception as e:
                    print(f"Warning: Could not process pixel data: {e}")
                    dicom_data["imageData"] = None
            
            # Use imaging schema by default
            target_schema_id = schema_id or "imaging"
            
            # Create module
            module = Module(
                name=f"DICOM_{dicom_data['modality']}_{filename}",
                schema_id=target_schema_id,
                data=dicom_data,
                metadata={
                    "source": "dicom",
                    "original_filename": filename,
                    "dicom_tags": self._extract_dicom_tags(ds)
                }
            )
            
            return {
                "module": module.dict(),
                "schema_id": target_schema_id,
                "modality": dicom_data["modality"]
            }
            
        except Exception as e:
            raise ValueError(f"Error reading DICOM file: {e}")
    
    async def _import_dicom_folder(self, content: bytes, filename: str, schema_id: Optional[str]) -> Dict[str, Any]:
        """Import DICOM folder (placeholder for folder upload)."""
        # This would be called when a folder is uploaded
        # For now, return an error suggesting to use the folder import method
        raise ValueError("DICOM folder import requires folder path. Use import_dicom_folder() method instead.")
    
    async def _import_image(self, content: bytes, filename: str, schema_id: Optional[str]) -> Dict[str, Any]:
        """Import image file (JPEG, PNG, etc.)."""
        try:
            # Open image
            image = Image.open(io.BytesIO(content))
            
            # Convert to base64
            img_buffer = io.BytesIO()
            image.save(img_buffer, format='PNG')
            img_buffer.seek(0)
            image_data = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
            
            # Extract image metadata
            image_info = {
                "modality": "Image",
                "bodyPart": "Unknown",
                "imageData": image_data,
                "metadata": {
                    "format": image.format,
                    "size": image.size,
                    "mode": image.mode,
                    "acquisitionDate": "",  # Would need to be provided separately
                    "institution": "",
                    "technician": ""
                }
            }
            
            # Use imaging schema by default
            target_schema_id = schema_id or "imaging"
            
            # Create module
            module = Module(
                name=f"Image_{filename}",
                schema_id=target_schema_id,
                data=image_info,
                metadata={
                    "source": "image",
                    "original_filename": filename,
                    "image_format": image.format,
                    "image_size": image.size
                }
            )
            
            return {
                "module": module.dict(),
                "schema_id": target_schema_id,
                "image_format": image.format
            }
            
        except Exception as e:
            raise ValueError(f"Error reading image file: {e}")
    
    def _convert_fhir_to_schema(self, fhir_data: Dict[str, Any], schema_id: str) -> Dict[str, Any]:
        """Convert FHIR data to our schema format."""
        if schema_id == "patient":
            return {
                "id": fhir_data.get("id", ""),
                "name": self._extract_patient_name(fhir_data),
                "dateOfBirth": fhir_data.get("birthDate", ""),
                "gender": fhir_data.get("gender", ""),
                "contact": {
                    "phone": self._extract_contact_phone(fhir_data),
                    "email": self._extract_contact_email(fhir_data)
                }
            }
        elif schema_id == "lab_results":
            return {
                "testName": fhir_data.get("code", {}).get("text", ""),
                "testCode": fhir_data.get("code", {}).get("coding", [{}])[0].get("code", ""),
                "value": fhir_data.get("valueQuantity", {}).get("value", 0),
                "unit": fhir_data.get("valueQuantity", {}).get("unit", ""),
                "status": fhir_data.get("interpretation", [{}])[0].get("text", ""),
                "date": fhir_data.get("effectiveDateTime", "")
            }
        elif schema_id == "medication":
            return {
                "name": fhir_data.get("medicationCodeableConcept", {}).get("text", ""),
                "dosage": self._extract_dosage(fhir_data),
                "frequency": self._extract_frequency(fhir_data),
                "route": self._extract_route(fhir_data),
                "startDate": fhir_data.get("authoredOn", ""),
                "prescriber": self._extract_prescriber(fhir_data),
                "instructions": fhir_data.get("dosageInstruction", [{}])[0].get("text", "")
            }
        else:
            # Default to patient schema
            return {
                "id": fhir_data.get("id", ""),
                "name": str(fhir_data),
                "dateOfBirth": "",
                "gender": "",
                "contact": {"phone": "", "email": ""}
            }
    
    def _extract_patient_name(self, fhir_data: Dict[str, Any]) -> str:
        """Extract patient name from FHIR data."""
        name = fhir_data.get("name", [{}])[0]
        if name:
            parts = []
            if name.get("given"):
                parts.extend(name["given"])
            if name.get("family"):
                parts.append(name["family"])
            return " ".join(parts)
        return ""
    
    def _extract_contact_phone(self, fhir_data: Dict[str, Any]) -> str:
        """Extract contact phone from FHIR data."""
        telecom = fhir_data.get("telecom", [])
        for contact in telecom:
            if contact.get("system") == "phone":
                return contact.get("value", "")
        return ""
    
    def _extract_contact_email(self, fhir_data: Dict[str, Any]) -> str:
        """Extract contact email from FHIR data."""
        telecom = fhir_data.get("telecom", [])
        for contact in telecom:
            if contact.get("system") == "email":
                return contact.get("value", "")
        return ""
    
    def _extract_dosage(self, fhir_data: Dict[str, Any]) -> str:
        """Extract dosage from FHIR medication data."""
        dosage = fhir_data.get("dosageInstruction", [{}])[0]
        if dosage:
            dose = dosage.get("doseAndRate", [{}])[0]
            if dose:
                return f"{dose.get('doseQuantity', {}).get('value', '')} {dose.get('doseQuantity', {}).get('unit', '')}"
        return ""
    
    def _extract_frequency(self, fhir_data: Dict[str, Any]) -> str:
        """Extract frequency from FHIR medication data."""
        dosage = fhir_data.get("dosageInstruction", [{}])[0]
        if dosage:
            timing = dosage.get("timing", {})
            if timing:
                return str(timing)
        return ""
    
    def _extract_route(self, fhir_data: Dict[str, Any]) -> str:
        """Extract route from FHIR medication data."""
        dosage = fhir_data.get("dosageInstruction", [{}])[0]
        if dosage:
            route = dosage.get("route", {})
            if route:
                return route.get("text", "")
        return ""
    
    def _extract_prescriber(self, fhir_data: Dict[str, Any]) -> str:
        """Extract prescriber from FHIR medication data."""
        requester = fhir_data.get("requester", {})
        if requester:
            return requester.get("display", "")
        return ""
    
    def _extract_dicom_tags(self, ds) -> Dict[str, Any]:
        """Extract relevant DICOM tags."""
        tags = {}
        for elem in ds:
            if elem.name and elem.value:
                tags[elem.name] = str(elem.value)
        return tags
    
    async def _import_umdf(self, content: bytes, filename: str, schema_id: Optional[str]) -> Dict[str, Any]:
        """Import a UMDF file and convert it to modules."""
        umdf_importer = UMDFImporter()
        
        if not umdf_importer.can_import():
            raise ImportError("UMDF reader module not available")
        
        try:
            # Import the UMDF file
            result = umdf_importer.import_file(content, filename)
            
            # Convert to internal module format
            modules = []
            for module_data in result.get('modules', []):
                module = Module(
                    id=module_data['id'],
                    name=f"UMDF_Module_{module_data['id']}",
                    schema_id=module_data['type'],
                    data=module_data['data'],
                    metadata={
                        **module_data['metadata'],
                        "source": "umdf",
                        "module_id": module_data['id'],
                        "schema_url": module_data['schema_url']
                    }
                )
                modules.append(module.dict())
            
            return {
                "file_type": "umdf",
                "file_path": filename,
                "modules": modules,
                "file_info": result.get('file_info', {}),
                "module_count": len(modules)
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to import UMDF file: {e}")
