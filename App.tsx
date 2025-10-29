import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { type FFTDataPoint, type WaveformDataPoint } from './types';
import { AlertTriangleIcon, MicrophoneIcon, StopIcon } from './components/Icons';

// Helper component for loading spinner
const Spinner: React.FC = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const ChartContainer: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="w-full">
        <h2 className="text-lg font-semibold text-slate-300 mb-3">{title}</h2>
        <div className="w-full h-80 bg-slate-800/50 rounded-lg p-4 pt-8 border border-slate-700">
            {children}
        </div>
    </div>
);


// Chart component for Waveform
const WaveformChart: React.FC<{ data: WaveformDataPoint[] }> = ({ data }) => {
    return (
        <ChartContainer title="Waveform (Live)">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                     <defs>
                        <linearGradient id="colorAmplitude" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#67e8f9" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#0891b2" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis 
                        dataKey="sample" 
                        type="number"
                        domain={[0, 'dataMax']}
                        stroke="#94a3b8"
                        tick={false}
                        label={{ value: 'Time', position: 'insideBottom', offset: -15, fill: '#cbd5e1' }}
                    />
                    <YAxis 
                        stroke="#94a3b8"
                        domain={[-1, 1]}
                        label={{ value: 'Amplitude', angle: -90, position: 'insideLeft', offset: -5, fill: '#cbd5e1' }}
                    />
                    <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
                    <Area type="monotone" dataKey="amplitude" stroke="#67e8f9" fill="url(#colorAmplitude)" isAnimationActive={false} />
                </AreaChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};


// Chart component for Frequency
const FrequencyChart: React.FC<{ data: FFTDataPoint[] }> = ({ data }) => {
    return (
        <ChartContainer title="Frequency Spectrum (Live)">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                        <linearGradient id="colorMagnitude" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#0891b2" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis 
                        dataKey="frequency" 
                        type="number"
                        domain={[0, 22050]} // Max frequency for human hearing
                        tickFormatter={(hz) => `${(hz / 1000).toFixed(1)} kHz`}
                        stroke="#94a3b8"
                        label={{ value: 'Frequency (kHz)', position: 'insideBottom', offset: -15, fill: '#cbd5e1' }}
                    />
                    <YAxis 
                        stroke="#94a3b8"
                        domain={[-100, -10]}
                        label={{ value: 'Magnitude (dB)', angle: -90, position: 'insideLeft', offset: -5, fill: '#cbd5e1' }}
                    />
                    <Area type="monotone" dataKey="magnitude" stroke="#22d3ee" fill="url(#colorMagnitude)" isAnimationActive={false} />
                </AreaChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};


export default function App() {
  const [fftData, setFftData] = useState<FFTDataPoint[]>([]);
  const [waveformData, setWaveformData] = useState<WaveformDataPoint[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fftSize, setFftSize] = useState<number>(8192);
  
  const FFT_SIZES = [256, 512, 1024, 2048, 4096, 8192, 16384];

  const audioContext = useMemo(() => new (window.AudioContext || (window as any).webkitAudioContext)(), []);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const stopRecording = useCallback(() => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    
    audioSourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    
    setIsRecording(false);
  }, []);
  
  const visualize = useCallback(() => {
    const analyser = analyserNodeRef.current;
    if (!analyser) return;

    // --- FFT Data ---
    const frequencyBufferLength = analyser.frequencyBinCount;
    const frequencyDataArray = new Float32Array(frequencyBufferLength);
    analyser.getFloatFrequencyData(frequencyDataArray);

    const processedFft: FFTDataPoint[] = [];
    const sampleRate = audioContext.sampleRate;
    for (let i = 0; i < frequencyBufferLength; i++) {
        const frequency = (i * sampleRate) / analyser.fftSize;
        processedFft.push({ frequency, magnitude: frequencyDataArray[i] });
    }
    setFftData(processedFft);

    // --- Waveform Data ---
    const waveformBufferLength = analyser.fftSize;
    const waveformdDataArray = new Float32Array(waveformBufferLength);
    analyser.getFloatTimeDomainData(waveformdDataArray);
    
    const processedWaveform: WaveformDataPoint[] = [];
    for(let i=0; i < waveformBufferLength; i++) {
      processedWaveform.push({ sample: i, amplitude: waveformdDataArray[i] });
    }
    setWaveformData(processedWaveform);

    animationFrameIdRef.current = requestAnimationFrame(visualize);
  }, [audioContext.sampleRate]);

  const startRecording = useCallback(async () => {
    try {
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;

      const source = audioContext.createMediaStreamSource(stream);
      audioSourceRef.current = source;
      
      const analyser = audioContext.createAnalyser();
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.85;
      analyserNodeRef.current = analyser;
      
      source.connect(analyser);
      
      setIsRecording(true);
      setError(null);
      visualize();

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Microphone access was denied. Please allow microphone access in your browser settings and refresh the page.");
    }
  }, [audioContext, visualize]);

  useEffect(() => {
    if (analyserNodeRef.current) {
        analyserNodeRef.current.fftSize = fftSize;
    }
  }, [fftSize]);
  
  useEffect(() => {
    // Cleanup on component unmount
    return () => {
        stopRecording();
    };
  }, [stopRecording]);

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };


  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col items-center p-4 sm:p-6 md:p-8">
      <main className="w-full max-w-5xl mx-auto flex flex-col items-center gap-8">
        <header className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300">
                Real-Time Audio Visualizer
            </h1>
            <p className="mt-2 text-slate-400 text-lg">
                Analyze the frequency spectrum of your voice live from the microphone.
            </p>
        </header>

        <div className="w-full flex flex-col items-center gap-6 p-6 bg-slate-800/30 border border-slate-700 rounded-xl">
            <div className="w-full flex flex-col sm:flex-row justify-center items-center gap-6">
                <button 
                    onClick={handleToggleRecording}
                    className={`px-8 py-3 text-lg font-bold rounded-lg transition-all duration-300 flex items-center gap-3 shadow-lg transform hover:scale-105 ${isRecording 
                        ? 'bg-red-600 hover:bg-red-500 text-white' 
                        : 'bg-sky-600 hover:bg-sky-500 text-white'}`}
                >
                    {isRecording ? <StopIcon className="w-6 h-6"/> : <MicrophoneIcon className="w-6 h-6"/>}
                    <span>{isRecording ? 'Stop Listening' : 'Start Listening'}</span>
                </button>
            </div>

            <div className="w-full max-w-md flex flex-col gap-3 pt-4">
                <label htmlFor="fft-size-slider" className="font-semibold text-slate-300 flex justify-between items-center">
                  <span>FFT Size</span>
                  <span className="font-mono text-sky-400 bg-slate-700 px-2 py-1 rounded">{fftSize}</span>
                </label>
                <input
                  id="fft-size-slider"
                  type="range"
                  min="0"
                  max={FFT_SIZES.length - 1}
                  step="1"
                  value={FFT_SIZES.indexOf(fftSize)}
                  onChange={(e) => setFftSize(FFT_SIZES[parseInt(e.target.value, 10)])}
                  className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
                <p className="text-xs text-slate-500 text-center px-2">
                  Larger sizes offer higher frequency resolution but have higher latency.
                </p>
            </div>
        </div>
        
        {error && (
          <div className="w-full max-w-2xl bg-red-900/30 border border-red-500 text-red-300 p-4 rounded-lg flex items-center gap-3">
            <AlertTriangleIcon className="w-6 h-6 text-red-400 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {(isRecording) && (
            <div className="w-full flex flex-col gap-8 mt-4">
                <WaveformChart data={waveformData} />
                <FrequencyChart data={fftData} />
            </div>
        )}
        
        {!isRecording && !error && (
            <div className="text-center text-slate-500 p-8">
                <p>Click "Start Listening" to begin visualizing your audio.</p>
            </div>
        )}
        
      </main>
      <footer className="w-full max-w-5xl mx-auto text-center py-6 text-slate-500 text-sm">
        <p>Built with React, Tailwind CSS, and the Web Audio API.</p>
      </footer>
    </div>
  );
}
