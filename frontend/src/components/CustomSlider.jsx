import React, { useEffect, useRef } from 'react';
import './CustomSlider.css';

const CustomSlider = ({ 
  value, 
  min, 
  max, 
  onChange, 
  label, 
  moduleId, 
  dimension,
  className = ""
}) => {
  const sliderRef = useRef(null);

  useEffect(() => {
    // Add event handlers for custom slider
    const slider = sliderRef.current;
    if (!slider) return;

    const track = slider.querySelector('.slider-track');
    const thumb = slider.querySelector('.slider-thumb');
    const fill = slider.querySelector('.slider-fill');
    const valueInput = slider.querySelector('.slider-value');

    const updateSlider = (clientX) => {
      const rect = track.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const percentage = (clickX / rect.width) * 100;
      
      // Update visual elements with precise positioning
      thumb.style.left = percentage + '%';
      fill.style.width = percentage + '%';
      
      // Calculate and update value with proper rounding
      const newValue = Math.round(min + (percentage / 100) * (max - min));
      valueInput.value = newValue;
      
      // Update the current value display
      const currentValueSpan = slider.querySelector('.current-value');
      if (currentValueSpan) {
        currentValueSpan.textContent = newValue;
      }
      
      // Call the onChange callback
      if (onChange) {
        onChange(newValue);
      }
      
      // Call global update function if it exists
      if (window.updateSliderValueGlobal) {
        window.updateSliderValueGlobal(moduleId, dimension, newValue);
      }
    };

    const handleClick = (e) => {
      // Only handle clicks on THIS specific slider's track
      if (e.target.closest('.slider-track') === track) {
        updateSlider(e.clientX);
      }
    };

    const handleMouseDown = (e) => {
      // Only handle mouse down on THIS specific slider's thumb
      if (e.target.closest('.slider-thumb') === thumb) {
        e.preventDefault();
        
        const onMouseMove = (e) => {
          updateSlider(e.clientX);
        };
        
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
    };

    // Add event listeners
    slider.addEventListener('click', handleClick);
    slider.addEventListener('mousedown', handleMouseDown);

    // Cleanup function
    return () => {
      slider.removeEventListener('click', handleClick);
      slider.removeEventListener('mousedown', handleMouseDown);
    };
  }, [min, max, onChange, moduleId, dimension]);

  // Calculate initial percentage for the current value
  const initialPercentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`custom-slider ${className}`} ref={sliderRef} data-dimension={dimension} data-module-id={moduleId}>
      <div className="slider-track">
        <div className="slider-fill" style={{width: `${initialPercentage}%`}}></div>
        <div className="slider-thumb" style={{left: `${initialPercentage}%`}}></div>
      </div>
      <input type="hidden" className="slider-value" defaultValue={value} min={min} max={max} />
      <div className="small text-muted mt-1">
        Current: <span className="current-value">{value}</span>
      </div>
    </div>
  );
};

export default CustomSlider; 