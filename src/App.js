import React, { useState, useCallback, useRef, useEffect } from 'react';

// --- Filter & Style Options ---
const STYLE_OPTIONS = [
  "No Filter (Base)",
  "Grayscale",
  "Sepia",
  "Invert",
  "Vintage",
  "Technicolor",
  "Polaroid",
  "Warm",
  "Cool",
  "Pixelate",
  "Edge Detection",
  "Sharpen",
  "Blur",
  "Gaussian Blur",
  "Emboss",
];

// --- Convolution Kernels ---
const KERNELS = {
  sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  edge: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  emboss: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
  blur: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  gaussian_blur: [1, 2, 1, 2, 4, 2, 1, 2, 1]
};

// --- Helper: Apply Convolution ---
const applyKernel = (imageData, kernel) => {
  const { data, width, height } = imageData;
  const divisor = kernel.reduce((a, b) => a + b) || 1;
  const outputData = new Uint8ClampedArray(data.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let i = (y * width + x) * 4;
      let r = 0, g = 0, b = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pIdx = ((y + ky) * width + (x + kx)) * 4;
          const kIdx = (ky + 1) * 3 + (kx + 1);
          r += data[pIdx] * kernel[kIdx];
          g += data[pIdx + 1] * kernel[kIdx];
          b += data[pIdx + 2] * kernel[kIdx];
        }
      }
      outputData[i] = r / divisor;
      outputData[i + 1] = g / divisor;
      outputData[i + 2] = b / divisor;
      outputData[i + 3] = data[i + 3];
    }
  }
  // Handle borders (copy)
  for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % width;
      const y = Math.floor((i / 4) / width);
      if(x===0 || x===width-1 || y===0 || y===height-1) {
          outputData[i] = data[i]; outputData[i+1]=data[i+1]; outputData[i+2]=data[i+2]; outputData[i+3]=data[i+3];
      }
  }
  return new ImageData(outputData, width, height);
};

// --- Core Processing Function ---
const processImage = (base64Image, settings) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        // 1. Apply Color Adjustments using ctx.filter
        const brightness = 100 + settings.brightness; 
        const contrast = 100 + settings.contrast;     
        const saturation = 100 + settings.saturation; 
        const hue = settings.hue;                     

        let filterString = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`;
        
        // Styles logic
        if (settings.style === "Grayscale") filterString += " grayscale(100%)";
        if (settings.style === "Sepia") filterString += " sepia(100%)";
        if (settings.style === "Invert") filterString += " invert(100%)";
        if (settings.style === "Vintage") filterString += " sepia(60%) contrast(120%) brightness(90%)";
        if (settings.style === "Technicolor") filterString += " saturate(200%) contrast(120%)";
        if (settings.style === "Polaroid") filterString += " sepia(20%) contrast(90%) brightness(110%)";
        if (settings.style === "Warm") filterString += " sepia(30%) saturate(120%) hue-rotate(-10deg)";
        if (settings.style === "Cool") filterString += " saturate(90%) hue-rotate(10deg) brightness(105%)";

        ctx.filter = filterString;

        // Handle "Pixelate" specifically
        if (settings.style === "Pixelate") {
             const pixelSize = Math.max(5, Math.floor(canvas.width / 100));
             const w = canvas.width;
             const h = canvas.height;
             
             ctx.imageSmoothingEnabled = false;
             
             const tempCanvas = document.createElement('canvas');
             tempCanvas.width = w / pixelSize;
             tempCanvas.height = h / pixelSize;
             const tempCtx = tempCanvas.getContext('2d');
             tempCtx.imageSmoothingEnabled = false;
             tempCtx.filter = filterString; 
             tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
             
             ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, w, h);
        } else {
             ctx.drawImage(img, 0, 0);
        }

        ctx.filter = 'none'; 

        // 2. Apply Pixel-Level Convolution Filters
        if (['Edge Detection', 'Sharpen', 'Blur', 'Gaussian Blur', 'Emboss'].includes(settings.style)) {
          let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          if (settings.style === "Edge Detection") {
            const d = imageData.data;
            for(let i=0; i<d.length; i+=4) {
                const avg = (d[i]+d[i+1]+d[i+2])/3;
                d[i]=avg; d[i+1]=avg; d[i+2]=avg;
            }
          }

          let kernel = null;
          if (settings.style === "Sharpen") kernel = KERNELS.sharpen;
          if (settings.style === "Blur") kernel = KERNELS.blur;
          if (settings.style === "Gaussian Blur") kernel = KERNELS.gaussian_blur;
          if (settings.style === "Edge Detection") kernel = KERNELS.edge;
          if (settings.style === "Emboss") kernel = KERNELS.emboss;

          if (kernel) {
            imageData = applyKernel(imageData, kernel);
            if (settings.style === "Emboss") {
               for(let i=0; i<imageData.data.length; i+=4) {
                   imageData.data[i]+=128; imageData.data[i+1]+=128; imageData.data[i+2]+=128;
               }
            }
            ctx.putImageData(imageData, 0, 0);
          }
        }

        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = base64Image;
  });
};

// --- Cropper Component ---
const Cropper = ({ imageSrc, onCancel, onApply }) => {
    const [selection, setSelection] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const imgRef = useRef(null);
    const containerRef = useRef(null);

    const getCoords = (e) => {
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const handleMouseDown = (e) => {
        const coords = getCoords(e);
        setStartPos(coords);
        setSelection({ x: coords.x, y: coords.y, w: 0, h: 0 });
        setIsDragging(true);
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        const coords = getCoords(e);
        const w = coords.x - startPos.x;
        const h = coords.y - startPos.y;
        
        setSelection({
            x: w > 0 ? startPos.x : coords.x,
            y: h > 0 ? startPos.y : coords.y,
            w: Math.abs(w),
            h: Math.abs(h)
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleApply = () => {
        if (!selection || selection.w < 10 || selection.h < 10) return;
        const img = imgRef.current;
        const scaleX = img.naturalWidth / img.offsetWidth;
        const scaleY = img.naturalHeight / img.offsetHeight;
        const cropX = selection.x * scaleX;
        const cropY = selection.y * scaleY;
        const cropW = selection.w * scaleX;
        const cropH = selection.h * scaleY;

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        onApply(canvas.toDataURL('image/png'));
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-4 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold">Crop Image</h3>
                    <div className="space-x-2">
                        <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                        <button onClick={handleApply} className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 font-bold">Apply Crop</button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-100 relative select-none"
                     onMouseUp={handleMouseUp}
                     onTouchEnd={handleMouseUp}
                >
                    <div 
                        ref={containerRef}
                        className="relative inline-block cursor-crosshair"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onTouchStart={handleMouseDown}
                        onTouchMove={handleMouseMove}
                    >
                        <img ref={imgRef} src={imageSrc} alt="Crop Target" className="max-w-full max-h-[70vh] object-contain pointer-events-none" />
                        {selection && (
                            <div 
                                className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                                style={{
                                    left: selection.x,
                                    top: selection.y,
                                    width: selection.w,
                                    height: selection.h,
                                }}
                            />
                        )}
                    </div>
                </div>
                <p className="text-center text-sm text-gray-500 mt-2">Click and drag to select area.</p>
            </div>
        </div>
    );
};


const App = () => {
  const [originalBase64, setOriginalBase64] = useState(null); 
  const [base64Image, setBase64Image] = useState(null); 
  const [generatedImageUrl, setGeneratedImageUrl] = useState(null); 
  
  const [style, setStyle] = useState("No Filter (Base)");
  const [brightness, setBrightness] = useState(0); 
  const [contrast, setContrast] = useState(0);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [error, setError] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);

  const applyEffects = useCallback(async () => {
    if (!base64Image) return;
    setIsLoading(true);
    try {
        const url = await processImage(base64Image, { style, brightness, contrast, hue, saturation });
        setGeneratedImageUrl(url);
    } catch (e) {
        setError(e.message);
    } finally {
        setIsLoading(false);
    }
  }, [base64Image, style, brightness, contrast, hue, saturation]);

  useEffect(() => {
      if (base64Image) {
          const timer = setTimeout(() => applyEffects(), 50);
          return () => clearTimeout(timer);
      }
  }, [applyEffects, base64Image]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            setBase64Image(evt.target.result);
            setOriginalBase64(evt.target.result);
            resetSettings();
        };
        reader.readAsDataURL(file);
    }
  };

  const resetSettings = () => {
      setBrightness(0); setContrast(0); setHue(0); setSaturation(0); setStyle("No Filter (Base)");
  };

  const handleResetAll = () => {
      resetSettings();
      if (originalBase64) setBase64Image(originalBase64); 
  };

  const handleRotate = (direction) => { 
      if (!base64Image) return;
      const img = new Image();
      img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.height;
          canvas.height = img.width;
          const ctx = canvas.getContext('2d');
          ctx.translate(canvas.width/2, canvas.height/2);
          ctx.rotate(direction * 90 * Math.PI / 180);
          ctx.drawImage(img, -img.width/2, -img.height/2);
          setBase64Image(canvas.toDataURL());
      };
      img.src = base64Image;
  };

  const handleCropApply = (croppedBase64) => {
      setBase64Image(croppedBase64);
      setIsCropping(false);
  };

  const handleDownload = (url) => {
    const targetUrl = url || generatedImageUrl;
    if (targetUrl) {
        const link = document.createElement('a');
        link.href = targetUrl;
        link.download = `edited-image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans text-gray-800">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-xl overflow-hidden">
        {/* Header */}
        <div className="bg-teal-700 p-6 text-white flex flex-col sm:flex-row justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold">Canvas Editor Pro v1.0 by Simon</h1>
                <p className="text-teal-100 text-sm opacity-90">Secure, Client-Side Image Processing</p>
            </div>
            {base64Image && (
                <div className="flex flex-wrap gap-2 mt-4 sm:mt-0">
                     {/* Rotate Left */}
                     <button 
                        onClick={() => handleRotate(-1)}
                        className="p-2 bg-white/20 text-white font-bold rounded hover:bg-white/30 transition"
                        title="Rotate Left 90°"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10a7 7 0 0112.7-4.3 1 1 0 001.4-1.4A9 9 0 002.1 9.9h-.9a1 1 0 000 2h3a1 1 0 001-1v-3a1 1 0 00-2 0v2.1z"></path>
                        </svg>
                    </button>
                    {/* Rotate Right */}
                    <button 
                        onClick={() => handleRotate(1)}
                        className="p-2 bg-white/20 text-white font-bold rounded hover:bg-white/30 transition"
                        title="Rotate Right 90°"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10a7 7 0 00-12.7-4.3 1 1 0 01-1.4-1.4A9 9 0 0121.9 9.9h.9a1 1 0 010 2h-3a1 1 0 01-1-1v-3a1 1 0 012 0v2.1z"></path>
                        </svg>
                    </button>
                    <button 
                        onClick={() => setIsCropping(true)}
                        className="px-4 py-2 bg-white text-teal-800 font-bold rounded-full hover:bg-teal-50 transition shadow-lg flex items-center"
                    >
                        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        Crop
                    </button>
                </div>
            )}
        </div>

        {/* Main Content */}
        <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Sidebar: Controls */}
            <div className="lg:col-span-4 space-y-8">
                {/* Upload */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <label className="block text-sm font-bold mb-2 text-gray-700">New Image</label>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="w-full text-sm" />
                </div>

                {/* Filters */}
                <div>
                    <div className='flex justify-between items-center mb-2'>
                        <label className="block text-sm font-bold text-gray-700">Filter Style</label>
                        <button onClick={handleResetAll} className="text-xs text-red-600 hover:text-red-800 underline">Reset All</button>
                    </div>
                    <select 
                        value={style} 
                        onChange={(e) => setStyle(e.target.value)} 
                        className="w-full p-3 border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    >
                        {STYLE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                {/* Sliders */}
                <div className="space-y-5">
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Color Adjustments</h3>
                        
                        <div className="mb-4">
                            <div className="flex justify-between text-xs mb-1"><span>Brightness</span><span>{brightness}</span></div>
                            <input type="range" min="-100" max="100" value={brightness} onChange={(e)=>setBrightness(Number(e.target.value))} className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-teal-600"/>
                        </div>
                        
                        <div className="mb-4">
                            <div className="flex justify-between text-xs mb-1"><span>Contrast</span><span>{contrast}</span></div>
                            <input type="range" min="-100" max="100" value={contrast} onChange={(e)=>setContrast(Number(e.target.value))} className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-teal-600"/>
                        </div>

                        <div className="mb-4">
                            <div className="flex justify-between text-xs mb-1"><span>Saturation</span><span>{saturation}</span></div>
                            <input type="range" min="-100" max="100" value={saturation} onChange={(e)=>setSaturation(Number(e.target.value))} className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-teal-600"/>
                        </div>

                        <div>
                            <div className="flex justify-between text-xs mb-1"><span>Hue Rotate</span><span>{hue}°</span></div>
                            <input type="range" min="-180" max="180" value={hue} onChange={(e)=>setHue(Number(e.target.value))} className="w-full h-2 bg-gradient-to-r from-red-500 via-green-500 to-blue-500 rounded-lg appearance-none cursor-pointer"/>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-4">
                    <button 
                        onClick={() => handleDownload(generatedImageUrl)}
                        disabled={!generatedImageUrl}
                        className="w-full py-3 bg-teal-600 text-white font-bold rounded-lg shadow hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                    >
                        Download Result
                    </button>
                </div>
            </div>

            {/* Right Side: Preview */}
            <div className="lg:col-span-8 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center min-h-[500px] relative overflow-hidden group">
                {!base64Image ? (
                    <div className="text-center text-gray-400">
                        <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <p>Upload an image to start editing</p>
                    </div>
                ) : (
                    <>
                        {isLoading && (
                            <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
                            </div>
                        )}
                        <img 
                            src={generatedImageUrl || base64Image} 
                            alt="Preview" 
                            onClick={() => generatedImageUrl && setIsModalOpen(true)}
                            className="max-w-full max-h-[70vh] object-contain shadow-2xl rounded cursor-zoom-in"
                        />
                        <div className="absolute bottom-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none">
                            {style} • Click to Zoom
                        </div>
                    </>
                )}
            </div>
        </div>
      </div>

      {/* Crop Modal */}
      {isCropping && base64Image && (
          <Cropper 
            imageSrc={base64Image} 
            onCancel={() => setIsCropping(false)} 
            onApply={handleCropApply} 
          />
      )}

      {/* Fullscreen Zoom Modal */}
      {isModalOpen && generatedImageUrl && (
        <div 
            className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setIsModalOpen(false)}
        >
            <div className="relative max-w-[95vw] max-h-[95vh]" onClick={e => e.stopPropagation()}>
                <button 
                    onClick={() => setIsModalOpen(false)}
                    className="absolute -top-10 right-0 text-white hover:text-gray-300"
                >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <img 
                    src={generatedImageUrl} 
                    alt="Zoomed" 
                    className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                />
                <div className='flex justify-center mt-4'>
                    <button 
                        onClick={() => handleDownload(generatedImageUrl)}
                        className='bg-teal-600 text-white px-6 py-2 rounded-full font-bold hover:bg-teal-700 transition'
                    >
                        Download High Res
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
          <div className="fixed bottom-5 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-full shadow-xl z-50 animate-bounce">
              {error}
          </div>
      )}

    </div>
  );
};

export default App;
